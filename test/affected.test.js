import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SKILLS, renderSkill, skillState } from '../src/adapters/skills.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/cairn.js');

function cairn(cwd, ...args) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [CLI, ...args], {
      cwd, env: { ...process.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString(), stderr: '' };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() ?? '' };
  }
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

/** A repo on a feature branch that touches a governed file. */
function branched(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-affected-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');

  fs.mkdirSync(path.join(dir, 'src/ledger'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cairn(dir, 'init', '--stage', 'PRODUCTION');
  cairn(dir, 'new', '--title', 'Ledger rows are append only', '--type', 'CONSTRAINT',
    '--status', 'ACTIVE', '--scope', 'src/ledger',
    '--claim', 'Ledger rows must never be updated or deleted.',
    '--rationale', 'The audit replays rows in order to reconstruct balances.');
  fs.writeFileSync(path.join(dir, 'src/ledger/entries.sql'), '-- ledger\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');

  git(dir, 'checkout', '-qb', 'feature');
  return dir;
}

test('affected reports the anchors governing changed files', (t) => {
  const dir = branched(t);
  fs.appendFileSync(path.join(dir, 'src/ledger/entries.sql'), 'UPDATE ledger SET x = 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'touch the ledger');

  const result = cairn(dir, 'affected', '--base', 'main');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Ledger rows are append only/);
  assert.match(result.stdout, /entries\.sql/);
});

test('affected stays quiet when a change touches nothing governed', (t) => {
  const dir = branched(t);
  fs.writeFileSync(path.join(dir, 'docs/notes.md'), 'notes\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'docs only');

  const result = cairn(dir, 'affected', '--base', 'main');
  assert.match(result.stdout, /No anchors govern/);
  assert.equal(cairn(dir, 'affected', '--base', 'main', '--format', 'markdown').stdout.trim(), '',
    'an empty report must produce no comment at all');
});

test('proposed anchors are surfaced for a decision', (t) => {
  const dir = branched(t);
  cairn(dir, 'new', '--title', 'Batch settlement nightly', '--type', 'DECISION',
    '--scope', 'src/settlement', '--claim', 'Settlement runs as a nightly batch.',
    '--rationale', 'Downstream banks only accept batches overnight.');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'propose an anchor');

  const result = cairn(dir, 'affected', '--base', 'main');
  assert.match(result.stdout, /awaiting a decision/);
  assert.match(result.stdout, /Batch settlement nightly/);
});

test('the markdown report is stable and carries its marker', (t) => {
  const dir = branched(t);
  fs.appendFileSync(path.join(dir, 'src/ledger/entries.sql'), 'UPDATE ledger SET x = 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'touch the ledger');

  const { stdout } = cairn(dir, 'affected', '--base', 'main', '--format', 'markdown');
  assert.ok(stdout.startsWith('<!-- cairn-comment -->'), 'the marker lets the action update in place');
  assert.match(stdout, /\*\*ANC-0002\*\* \(CONSTRAINT\)/);
});

test('an unreachable base ref fails clearly', (t) => {
  const dir = branched(t);
  const result = cairn(dir, 'affected', '--base', 'no-such-ref');
  assert.equal(result.code, 3);
  assert.match(result.stderr, /no-such-ref/);
});

test('project-wide anchors are omitted, since they govern every change', (t) => {
  const dir = branched(t);
  cairn(dir, 'new', '--title', 'Amounts are integer minor units', '--type', 'CONSTRAINT',
    '--status', 'ACTIVE', '--claim', 'Money is stored as integers.',
    '--rationale', 'Float rounding caused a reconciliation discrepancy.');
  fs.appendFileSync(path.join(dir, 'src/ledger/entries.sql'), 'x\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'change');

  const { stdout } = cairn(dir, 'affected', '--base', 'main');
  assert.match(stdout, /append only/);
  assert.ok(!stdout.includes('integer minor units'), 'true of every change, so not news');
});

test('the recording skill is written for each platform that supports one', (t) => {
  const dir = branched(t);
  cairn(dir, 'adapters', '--write');
  for (const skill of SKILLS) {
    assert.ok(fs.existsSync(path.join(dir, skill.file)), `${skill.id} skill missing`);
    assert.ok(skillState(dir, skill).installed);
  }
});

test('the skill states the four tests and the proposed gate', () => {
  const body = renderSkill(SKILLS[0]);
  assert.match(body, /name: anchor-this/);
  assert.match(body, /still be true in months/);
  assert.match(body, /not visible in the code/);
  assert.match(body, /PROPOSED/);
  assert.match(body, /cairn status <id> ACTIVE/);
  assert.ok(body.length < 3000, 'a loaded skill stays in context, so it must stay short');
});
