import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/cairn.js');

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-test-'));
  const real = fs.realpathSync(dir);
  execFileSync('git', ['init', '-q'], { cwd: real });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: real });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: real });
  return real;
}

/** @returns {{code: number, stdout: string, stderr: string}} */
function cairn(cwd, ...args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
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

const ANCHOR = [
  'new',
  '--title', 'No ORM in billing',
  '--type', 'CONSTRAINT',
  '--status', 'ACTIVE',
  '--scope', 'src/billing',
  '--claim', 'Billing code must use hand-written SQL.',
  '--rationale', 'The annual audit requires statement-level traceability from a report row to the SQL behind it.',
];

test('init then new then check is clean', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(cairn(dir, 'init', '--stage', 'PRODUCTION').code, 0);
  assert.ok(fs.existsSync(path.join(dir, '.cairn/schema.json')));
  assert.ok(fs.existsSync(path.join(dir, '.cairn/INDEX.md')));

  assert.equal(cairn(dir, ...ANCHOR).code, 0);
  const result = cairn(dir, 'check');
  assert.equal(result.code, 0, result.stdout + result.stderr);
});

test('regression: invalid enum values are rejected and nothing is written', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');

  const before = fs.readdirSync(path.join(dir, '.cairn')).length;
  const result = cairn(
    dir, 'new', '--title', 'Bad', '--type', 'BANANA', '--status', 'FLOATING',
    '--claim', 'x', '--rationale', 'y',
  );

  assert.equal(result.code, 2);
  assert.match(result.stderr, /BANANA/);
  assert.match(result.stderr, /FLOATING/);
  assert.equal(fs.readdirSync(path.join(dir, '.cairn')).length, before, 'no file was written');
});

test('regression: hand-written goals survive index --write byte-for-byte', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');

  const indexPath = path.join(dir, '.cairn/INDEX.md');
  const goals = '- **GOAL-01:** Ship the billing rewrite by Q4.\n- **GOAL-02:** p99 under 200ms.\n';
  fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('- \n', goals));

  cairn(dir, ...ANCHOR);
  assert.equal(cairn(dir, 'index', '--write').code, 0);

  const after = fs.readFileSync(indexPath, 'utf8');
  assert.ok(after.includes('- **GOAL-01:** Ship the billing rewrite by Q4.'));
  assert.ok(after.includes('- **GOAL-02:** p99 under 200ms.'));
});

test('regression: an unreadable anchor fails the check instead of vanishing', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');

  fs.writeFileSync(
    path.join(dir, '.cairn/ANC-0009-corrupt.md'),
    'No frontmatter.\nCRITICAL: never use an ORM in src/billing.\n',
  );

  const result = cairn(dir, 'check');
  assert.equal(result.code, 1, 'a corrupt anchor must not pass');
  assert.match(result.stderr, /ANC-0009-corrupt\.md/);
});

test('immutable fields of a committed ACTIVE anchor cannot be edited', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  cairn(dir, ...ANCHOR);
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'anchors'], { cwd: dir });

  assert.equal(cairn(dir, 'check').code, 0);

  const file = fs.readdirSync(path.join(dir, '.cairn')).find((f) => f.includes('no-orm'));
  const full = path.join(dir, '.cairn', file);
  fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replace('hand-written SQL', 'an ORM'));

  const result = cairn(dir, 'check');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /superseding/);
});

test('only one STAGE anchor may be ACTIVE', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  cairn(
    dir, 'new', '--title', 'Second stage', '--type', 'STAGE', '--status', 'ACTIVE',
    '--claim', 'The project is in BETA.', '--rationale', 'Testing the constraint.',
  );
  const result = cairn(dir, 'check');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /one stage at a time/);
});

test('verify is refused on non-constraint types', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  const result = cairn(
    dir, 'new', '--title', 'A goal', '--type', 'GOAL',
    '--claim', 'x', '--rationale', 'y', '--verify', 'true',
  );
  assert.equal(result.code, 2);
  assert.match(result.stderr, /only allowed on CONSTRAINT/);
});

test('json output is machine-readable and reports counts', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  cairn(dir, ...ANCHOR);

  const result = cairn(dir, 'check', '--json');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.counts.anchors, 2);
  assert.deepEqual(payload.errors, []);
});

test('exit codes follow the documented contract', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(cairn(dir, 'check').code, 3, 'nothing to act on');
  assert.equal(cairn(dir, 'nonsense').code, 2, 'usage error');
  assert.equal(cairn(dir, '--help').code, 0);
  cairn(dir, 'init');
  assert.equal(cairn(dir, 'check').code, 0, 'clean');
});

test('new anchors default to PROPOSED so a person promotes them', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  cairn(dir, 'new', '--title', 'Drafted thing', '--type', 'FINDING',
    '--claim', 'Something was learned.', '--rationale', 'Because it was measured.');

  const file = fs.readdirSync(path.join(dir, '.cairn')).find((f) => f.includes('drafted-thing'));
  assert.match(fs.readFileSync(path.join(dir, '.cairn', file), 'utf8'), /status: PROPOSED/);
});

test('alternatives are recorded from the command line', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');

  const ok = cairn(
    dir, 'new', '--title', 'Chose Postgres', '--type', 'DECISION', '--status', 'ACTIVE',
    '--claim', 'Postgres is the primary store.',
    '--rationale', 'Transactional integrity is required for the ledger.',
    '--alternative', 'SQLite :: No concurrent writer story for the worker pool.',
  );
  assert.equal(ok.code, 0, ok.stderr);

  const file = fs.readdirSync(path.join(dir, '.cairn')).find((f) => f.includes('chose-postgres'));
  const text = fs.readFileSync(path.join(dir, '.cairn', file), 'utf8');
  assert.match(text, /- option: "SQLite"/);
  assert.match(text, /rejected_because: "No concurrent writer story for the worker pool\."/);

  // A decision that records its fork no longer warns.
  const result = cairn(dir, 'check');
  assert.ok(!result.stdout.includes('no alternatives') && !result.stderr.includes('no alternatives'));
});

test('a malformed --alternative is rejected with guidance', (t) => {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init');
  const result = cairn(
    dir, 'new', '--title', 'x', '--type', 'DECISION',
    '--claim', 'a', '--rationale', 'b', '--alternative', 'no separator here',
  );
  assert.equal(result.code, 2);
  assert.match(result.stderr, /option :: why it was rejected/);
});
