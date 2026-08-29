import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PLATFORMS } from '../src/adapters/platforms.js';
import { injectBlock, removeBlock, extractBlock, renderAdapter } from '../src/adapters/render.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/cairn.js');

function workspace() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-adapters-')));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function cairn(cwd, ...args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, env: { ...process.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() ?? '' };
  }
}

test('every platform names the document its path came from', () => {
  for (const platform of PLATFORMS) {
    assert.ok(platform.docs?.startsWith('https://'), `${platform.id} must cite a source`);
    assert.ok(platform.target, `${platform.id} must have a target path`);
    assert.ok(['file', 'block'].includes(platform.mode));
  }
});

test('generated adapters stay inside documented size limits', () => {
  for (const platform of PLATFORMS.filter((p) => p.limit)) {
    assert.ok(
      renderAdapter(platform).length < platform.limit,
      `${platform.id} exceeds its ${platform.limit} character limit`,
    );
  }
});

test('injecting into a file keeps the surrounding content exactly', () => {
  const existing = '# My project\n\nRun tests with `make test`.\n';
  const result = injectBlock(existing, '<!-- CAIRN:START -->\nrules\n<!-- CAIRN:END -->');
  assert.ok(result.startsWith(existing.trimEnd()));
  assert.match(result, /CAIRN:START/);
});

test('re-injecting replaces the region rather than stacking copies', () => {
  let text = injectBlock('# Project\n', '<!-- CAIRN:START -->\nv1\n<!-- CAIRN:END -->');
  text = injectBlock(text, '<!-- CAIRN:START -->\nv2\n<!-- CAIRN:END -->');
  assert.equal(text.match(/CAIRN:START/g).length, 1);
  assert.match(text, /v2/);
  assert.ok(!text.includes('v1'));
});

test('a half-present region is refused rather than guessed at', () => {
  assert.throws(() => injectBlock('# P\n<!-- CAIRN:START -->\nbroken\n', 'x'), /refusing to guess/);
});

test('removing the region restores the original content', () => {
  const original = '# My project\n\nRun tests with `make test`.\n';
  const injected = injectBlock(original, '<!-- CAIRN:START -->\nrules\n<!-- CAIRN:END -->');
  assert.equal(removeBlock(injected).trim(), original.trim());
  assert.equal(extractBlock(original), null);
});

test('write then check is clean, and tampering is caught', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');

  assert.equal(cairn(dir, 'adapters').code, 1, 'nothing written yet');
  assert.equal(cairn(dir, 'adapters', '--write').code, 0);
  assert.equal(cairn(dir, 'adapters').code, 0);

  const cursorRule = path.join(dir, '.cursor/rules/cairn.mdc');
  fs.appendFileSync(cursorRule, '\nhand edited\n');
  const drifted = cairn(dir, 'adapters');
  assert.equal(drifted.code, 1);
  assert.match(drifted.stderr, /cairn\.mdc/);
});

test('uninstall clears only what Cairn owns', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');

  const mine = '# My project\n\nDeploy notes live in the wiki.\n';
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), mine);
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github/workflows/ci.yml'), 'name: CI\n');

  cairn(dir, 'adapters', '--write');
  assert.equal(cairn(dir, 'uninstall').code, 0);

  assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').trim(), mine.trim());
  assert.ok(fs.existsSync(path.join(dir, '.github/workflows/ci.yml')), 'unrelated files survive');
  assert.ok(!fs.existsSync(path.join(dir, '.cursor')), 'emptied directories are pruned');
  assert.ok(fs.existsSync(path.join(dir, '.cairn/INDEX.md')), 'anchors are never touched');
});

test('an unknown platform is rejected', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  const result = cairn(dir, 'adapters', '--platform', 'emacs', '--write');
  assert.equal(result.code, 2);
  assert.match(result.stderr, /unknown platform/);
});
