import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeHooks, removeHooks } from '../src/adapters/hooks.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/cairn.js');

function cairn(cwd, args, input) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, input: input ?? '', env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() ?? '' };
  }
}

function governedRepo(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-hook-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  cairn(dir, ['init', '--stage', 'PRODUCTION']);
  cairn(dir, ['new', '--title', 'No ORM in billing', '--type', 'CONSTRAINT', '--status', 'ACTIVE',
    '--scope', 'src/billing', '--claim', 'Billing code must use hand-written SQL.',
    '--rationale', 'The audit needs statement-level traceability.']);
  return dir;
}

test('session hook returns the project orientation as injectable context', (t) => {
  const dir = governedRepo(t);
  const { stdout } = cairn(dir, ['hook', 'session', '--format', 'claude-code']);
  const output = JSON.parse(stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'SessionStart');
  assert.match(output.additionalContext, /No ORM in billing/);
  assert.match(output.additionalContext, /PRODUCTION/);
});

test('edit hook returns only anchors scoped to the path', (t) => {
  const dir = governedRepo(t);
  const { stdout } = cairn(dir, ['hook', 'edit', '--format', 'claude-code'],
    JSON.stringify({ tool_input: { file_path: 'src/billing/ledger.py' } }));
  const context = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /No ORM in billing/);
  assert.ok(!context.includes('PRODUCTION'), 'session start already supplied project-wide anchors');
});

test('edit hook stays silent for an ungoverned path', (t) => {
  const dir = governedRepo(t);
  const { stdout } = cairn(dir, ['hook', 'edit', '--format', 'claude-code'],
    JSON.stringify({ tool_input: { file_path: 'README.md' } }));
  assert.deepEqual(JSON.parse(stdout), {});
});

test('a hook never fails in a way that would break the editor', (t) => {
  const dir = governedRepo(t);
  for (const input of ['not json', '', '{}', '{"tool_input":{}}', 'null']) {
    const result = cairn(dir, ['hook', 'edit', '--format', 'claude-code'], input);
    assert.equal(result.code, 0, `input ${JSON.stringify(input)} must not fail`);
    assert.doesNotThrow(() => JSON.parse(result.stdout || '{}'));
  }
});

test('a repository without anchors answers nothing rather than erroring', (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-bare-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = cairn(dir, ['hook', 'session', '--format', 'claude-code']);
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('the cursor format uses its own field name', (t) => {
  const dir = governedRepo(t);
  const { stdout } = cairn(dir, ['hook', 'session', '--format', 'cursor']);
  assert.ok('additional_context' in JSON.parse(stdout));
});

test('an unknown format is refused', (t) => {
  const dir = governedRepo(t);
  assert.equal(cairn(dir, ['hook', 'session', '--format', 'emacs']).code, 2);
});

test('merging hooks preserves settings that are not ours', () => {
  const existing = {
    permissions: { allow: ['Bash(ls)'] },
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './my-script.sh' }] }],
    },
  };
  const merged = mergeHooks(existing, {
    PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'cairn hook edit' }] }],
  });

  assert.deepEqual(merged.permissions, existing.permissions, 'unrelated settings survive');
  assert.equal(merged.hooks.PreToolUse.length, 2);
  assert.ok(merged.hooks.PreToolUse.some((g) => g.matcher === 'Bash'), "the user's own hook survives");
});

test('merging twice does not duplicate our entries', () => {
  const wanted = {
    SessionStart: [{ hooks: [{ type: 'command', command: 'cairn hook session' }] }],
  };
  const once = mergeHooks({}, wanted);
  assert.deepEqual(mergeHooks(once, wanted), once);
});

test('removing hooks leaves the rest of the file intact', () => {
  const existing = mergeHooks(
    { permissions: { allow: [] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ command: './mine.sh' }] }] } },
    { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'cairn hook edit' }] }] },
  );
  const cleaned = removeHooks(existing);
  assert.equal(cleaned.hooks.PreToolUse.length, 1);
  assert.equal(cleaned.hooks.PreToolUse[0].matcher, 'Bash');
  assert.ok(cleaned.permissions);
});

test('removing the only hooks drops the empty hooks key', () => {
  const existing = mergeHooks({}, { SessionStart: [{ hooks: [{ command: 'cairn hook session' }] }] });
  assert.deepEqual(removeHooks(existing), {});
});
