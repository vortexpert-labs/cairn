import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runVerifications, countVerifiable } from '../src/verify/runner.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/cairn.js');

function workspace() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-verify-')));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

function cairn(cwd, ...args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, env: { ...process.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    };
  }
}

/** A repository whose constraint carries an observable side effect. */
function repoWithPayload(t, { status = 'ACTIVE' } = {}) {
  const dir = workspace();
  const marker = path.join(dir, 'executed.marker');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  cairn(dir, 'new', '--title', 'Carries a payload', '--type', 'CONSTRAINT', '--status', status,
    '--claim', 'Looks like an ordinary rule.',
    '--rationale', 'Its verify command has an observable side effect, so execution is detectable.',
    '--verify', `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, '\\\\')}','x')"`);
  return { dir, marker };
}

test('verify does not execute by default', (t) => {
  const { dir, marker } = repoWithPayload(t);
  const result = cairn(dir, 'check');
  assert.equal(result.code, 0);
  assert.ok(!fs.existsSync(marker), 'a plain check must never run repository commands');
  assert.match(result.stdout, /--allow-verify/, 'but it should say the commands exist');
});

test('no file inside the repository can grant permission, committed or not', (t) => {
  const { dir, marker } = repoWithPayload(t);
  // Everything a hostile repository might hope is treated as a permission slip.
  for (const name of ['.cairn/local.json', '.cairn/config.json', 'cairn.config.json', '.cairnrc']) {
    fs.writeFileSync(path.join(dir, name), '{"allowVerify":true}');
  }
  execFileSync('git', ['add', '-A', '-f'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'hostile'], { cwd: dir });

  assert.equal(cairn(dir, 'check').code, 0);
  assert.ok(!fs.existsSync(marker), 'cloning a repository must not be an act of trust');
});

test('the flag runs the command and reports success', (t) => {
  const { dir, marker } = repoWithPayload(t);
  const result = cairn(dir, 'check', '--allow-verify');
  assert.equal(result.code, 0, result.stderr);
  assert.ok(fs.existsSync(marker), 'the opt-in must actually opt in');
  assert.match(result.stdout, /1 verified/);
});

test('a failing command fails the check and reports its exit code', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  cairn(dir, 'new', '--title', 'Never holds', '--type', 'CONSTRAINT', '--status', 'ACTIVE',
    '--claim', 'This constraint does not hold.',
    '--rationale', 'Used to prove a violated constraint fails the build.',
    '--verify', 'node -e "process.exit(3)"');

  const result = cairn(dir, 'check', '--allow-verify');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /verify failed \(exited 3\)/);
});

test('a proposed constraint is not executed', (t) => {
  const { dir, marker } = repoWithPayload(t, { status: 'PROPOSED' });
  const result = cairn(dir, 'check', '--allow-verify');
  assert.equal(result.code, 0);
  assert.ok(!fs.existsSync(marker), 'a rule nobody has agreed to cannot fail a build');
});

test('a hanging command is stopped and reported as a timeout', () => {
  const anchors = [{
    id: 'ANC-0001', file: 'a.md', status: 'ACTIVE', type: 'CONSTRAINT',
    verify: { command: 'node -e "setTimeout(()=>{}, 60000)"' },
  }];
  const [result] = runVerifications(anchors, process.cwd(), { timeout: 750 });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true, 'a timeout is not the same as a failed assertion');
});

test('countVerifiable counts only active constraints', () => {
  assert.equal(countVerifiable([
    { status: 'ACTIVE', verify: { command: 'true' } },
    { status: 'PROPOSED', verify: { command: 'true' } },
    { status: 'ACTIVE' },
  ]), 1);
});
