import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeServer, removeServer, SERVER_KEY } from '../src/adapters/mcp.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/cairn.js');

function cli(cwd, args, input = '') {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [CLI, ...args], {
      cwd, input, env: { ...process.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString() };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout?.toString() ?? '' };
  }
}

/** Send a batch of JSON-RPC messages and collect the responses. */
function rpc(dir, messages) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const { stdout } = cli(dir, ['mcp'], input);
  return stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2026-07-28', capabilities: {} },
};

function repo(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-mcp-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  cli(dir, ['init', '--stage', 'PRODUCTION']);
  cli(dir, ['new', '--title', 'No ORM in billing', '--type', 'CONSTRAINT', '--status', 'ACTIVE',
    '--scope', 'src/billing', '--claim', 'Billing code must use hand-written SQL.',
    '--rationale', 'The audit needs statement-level traceability.']);
  return dir;
}

test('initialize echoes a protocol version it supports', (t) => {
  const dir = repo(t);
  const [response] = rpc(dir, [INIT]);
  assert.equal(response.result.protocolVersion, '2026-07-28');
  assert.equal(response.result.serverInfo.name, 'cairn');
  assert.ok(response.result.capabilities.tools);
  assert.ok(response.result.capabilities.resources);
});

test('an older protocol version is honoured rather than refused', (t) => {
  const dir = repo(t);
  const [response] = rpc(dir, [
    { ...INIT, params: { protocolVersion: '2025-06-18', capabilities: {} } },
  ]);
  assert.equal(response.result.protocolVersion, '2025-06-18');
});

test('an unknown protocol version falls back to ours', (t) => {
  const dir = repo(t);
  const [response] = rpc(dir, [{ ...INIT, params: { protocolVersion: '1999-01-01', capabilities: {} } }]);
  assert.equal(response.result.protocolVersion, '2026-07-28');
});

test('tools are listed with schemas', (t) => {
  const dir = repo(t);
  const [, listed] = rpc(dir, [INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
  const names = listed.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ['cairn_why', 'cairn_context', 'cairn_show', 'cairn_timeline', 'cairn_record']);
  for (const tool of listed.result.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 20);
  }
});

test('cairn_why returns the anchors governing a path', (t) => {
  const dir = repo(t);
  const [, called] = rpc(dir, [INIT, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'cairn_why', arguments: { path: 'src/billing/ledger.py' } },
  }]);
  assert.match(called.result.content[0].text, /No ORM in billing/);
});

test('cairn_record writes a PROPOSED anchor and says it is not binding', (t) => {
  const dir = repo(t);
  const [, called] = rpc(dir, [INIT, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: {
      name: 'cairn_record',
      arguments: {
        title: 'Retries stop after three attempts',
        type: 'DECISION',
        claims: ['Outbound payment retries stop after three attempts.'],
        rationale: 'Unbounded retries double-charged customers during the March incident.',
      },
    },
  }]);
  assert.match(called.result.content[0].text, /PROPOSED/);
  assert.match(called.result.content[0].text, /not binding/);

  const written = fs.readdirSync(path.join(dir, '.cairn')).find((f) => f.includes('retries'));
  assert.match(fs.readFileSync(path.join(dir, '.cairn', written), 'utf8'), /status: PROPOSED/);
  assert.equal(cli(dir, ['check']).code, 0, 'what it writes must still validate');
});

test('a tool that cannot do its job reports in band, not as a transport error', (t) => {
  const dir = repo(t);
  const [, called] = rpc(dir, [INIT, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'cairn_show', arguments: { id: 'ANC-9999' } },
  }]);
  assert.equal(called.result.isError, true);
  assert.ok(!called.error, 'the call itself succeeded');
});

test('unknown methods and tools produce JSON-RPC errors', (t) => {
  const dir = repo(t);
  const responses = rpc(dir, [
    INIT,
    { jsonrpc: '2.0', id: 2, method: 'nonsense/method' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'cairn_nope', arguments: {} } },
  ]);
  assert.equal(responses[1].error.code, -32601);
  assert.equal(responses[2].error.code, -32602);
});

test('notifications receive no response', (t) => {
  const dir = repo(t);
  const responses = rpc(dir, [INIT, { jsonrpc: '2.0', method: 'notifications/initialized' }]);
  assert.equal(responses.length, 1, 'only initialize should be answered');
});

test('malformed input is answered with a parse error, not a crash', (t) => {
  const dir = repo(t);
  const { stdout } = cli(dir, ['mcp'], 'this is not json\n');
  assert.equal(JSON.parse(stdout.trim()).error.code, -32700);
});

test('the index is exposed as a resource', (t) => {
  const dir = repo(t);
  const [, listed, read] = rpc(dir, [
    INIT,
    { jsonrpc: '2.0', id: 2, method: 'resources/list' },
    { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'cairn://index' } },
  ]);
  assert.equal(listed.result.resources[0].uri, 'cairn://index');
  assert.match(read.result.contents[0].text, /CAIRN-REGISTRY/);
});

test('stdout carries protocol messages and nothing else', (t) => {
  const dir = repo(t);
  const { stdout } = cli(dir, ['mcp'], `${JSON.stringify(INIT)}\n`);
  for (const line of stdout.split('\n').filter(Boolean)) {
    assert.doesNotThrow(() => JSON.parse(line), `stray output would corrupt the session: ${line}`);
  }
});

test('registering the server leaves other servers alone', () => {
  const existing = { mcpServers: { other: { command: 'other-server' } } };
  const merged = mergeServer(existing, { command: 'cairn', args: ['mcp'] });
  assert.ok(merged.mcpServers.other, 'an unrelated server survives');
  assert.deepEqual(merged.mcpServers[SERVER_KEY], { command: 'cairn', args: ['mcp'] });

  const cleaned = removeServer(merged);
  assert.ok(cleaned.mcpServers.other);
  assert.ok(!(SERVER_KEY in cleaned.mcpServers));
  assert.deepEqual(removeServer({ mcpServers: { cairn: {} } }), {});
});
