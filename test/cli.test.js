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

// --- Phase 2: retrieval, lifecycle and rendering -------------------------

/** A workspace with a superseded decision, a finding, and a closed path. */
function billingWorkspace(t) {
  const dir = workspace();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  cairn(dir, 'init', '--stage', 'PRODUCTION');
  cairn(dir, 'new', '--title', 'SQLite as the ledger store', '--type', 'DECISION',
    '--status', 'ACTIVE', '--scope', 'src/billing',
    '--claim', 'The billing ledger is stored in SQLite.',
    '--rationale', 'Single writer at launch volumes.');
  cairn(dir, 'new', '--title', 'Ledger saturates above 200 rps', '--type', 'FINDING',
    '--status', 'ACTIVE', '--scope', 'src/billing',
    '--claim', 'Sustained writes above 200 rps cause silent retries.',
    '--rationale', 'Measured during the March load test.');
  return dir;
}

test('why reports what governs a path and separates project-wide rules', (t) => {
  const dir = billingWorkspace(t);
  const result = cairn(dir, 'why', 'src/billing');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /SQLite as the ledger store/);
  assert.match(result.stdout, /Also applies project-wide/);
  assert.match(result.stdout, /Project stage: PRODUCTION/);
});

test('why is honest when nothing is scoped to a path', (t) => {
  const dir = billingWorkspace(t);
  const result = cairn(dir, 'why', 'src/frontend');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Nothing is scoped to/);
});

test('why needs a path', (t) => {
  const dir = billingWorkspace(t);
  assert.equal(cairn(dir, 'why').code, 2);
});

test('superseding writes both sides in one command', (t) => {
  const dir = billingWorkspace(t);
  const result = cairn(dir, 'new', '--title', 'Postgres as the ledger store', '--type', 'DECISION',
    '--status', 'ACTIVE', '--scope', 'src/billing', '--supersedes', 'ANC-0002',
    '--depends-on', 'ANC-0003',
    '--claim', 'The ledger is stored in Postgres.',
    '--alternative', 'Staying on SQLite :: Cannot pass 200 rps.',
    '--rationale', 'Write volume passed the ceiling found in the load test.');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /ANC-0002\s+ACTIVE → SUPERSEDED/);

  const old = fs.readFileSync(
    path.join(dir, '.cairn', fs.readdirSync(path.join(dir, '.cairn')).find((f) => f.includes('sqlite'))),
    'utf8',
  );
  assert.match(old, /status: SUPERSEDED/);
  assert.match(old, /superseded_by: ANC-0004/);
  assert.equal(cairn(dir, 'check').code, 0, 'both sides must remain valid');
});

test('superseding a missing or non-active anchor is refused before anything is written', (t) => {
  const dir = billingWorkspace(t);
  const before = fs.readdirSync(path.join(dir, '.cairn')).length;
  const result = cairn(dir, 'new', '--title', 'x', '--type', 'DECISION',
    '--claim', 'a', '--rationale', 'b', '--supersedes', 'ANC-9999');
  assert.equal(result.code, 2);
  assert.match(result.stderr, /ANC-9999/);
  assert.equal(fs.readdirSync(path.join(dir, '.cairn')).length, before, 'nothing was written');
});

test('status promotes a proposed anchor and refuses to move a closed one', (t) => {
  const dir = billingWorkspace(t);
  cairn(dir, 'new', '--title', 'Append only ledger', '--type', 'CONSTRAINT', '--scope', 'src/billing',
    '--claim', 'Ledger rows are never updated.', '--rationale', 'The audit trail needs immutability.');

  const promote = cairn(dir, 'status', 'ANC-0004', 'ACTIVE');
  assert.equal(promote.code, 0, promote.stderr);
  assert.match(promote.stdout, /PROPOSED → ACTIVE/);

  const backwards = cairn(dir, 'status', 'ANC-0004', 'PROPOSED');
  assert.equal(backwards.code, 2);
  assert.match(backwards.stderr, /can only become/);

  const retired = cairn(dir, 'status', 'ANC-0004', 'RETIRED');
  assert.equal(retired.code, 0);
  assert.equal(cairn(dir, 'status', 'ANC-0004', 'ACTIVE').code, 2, 'closed anchors are final');
});

test('timeline renders text and mermaid', (t) => {
  const dir = billingWorkspace(t);
  const text = cairn(dir, 'timeline');
  assert.equal(text.code, 0);
  assert.match(text.stdout, /ANC-0001[\s\S]*ANC-0002[\s\S]*ANC-0003/, 'oldest first');

  const mermaid = cairn(dir, 'timeline', '--format', 'mermaid');
  assert.match(mermaid.stdout, /^graph TD/m);
  assert.match(mermaid.stdout, /classDef active/);

  assert.equal(cairn(dir, 'timeline', '--format', 'svg').code, 2, 'unknown formats are refused');
});

test('context produces the payload an agent loads', (t) => {
  const dir = billingWorkspace(t);
  const scoped = cairn(dir, 'context', '--scope', 'src/billing');
  assert.equal(scoped.code, 0);
  assert.match(scoped.stdout, /Project stage: PRODUCTION/);
  assert.match(scoped.stdout, /## Anchors governing src\/billing/);
  assert.match(scoped.stdout, /Why: Single writer at launch volumes\./);

  const brief = cairn(dir, 'context', '--scope', 'src/billing', '--brief');
  assert.ok(!brief.stdout.includes('Why:'), '--brief drops the reasoning');
});

test('review surfaces a named revisit condition', (t) => {
  const dir = billingWorkspace(t);
  cairn(dir, 'new', '--title', 'Rate limit at 100 rps', '--type', 'CONSTRAINT', '--status', 'ACTIVE',
    '--scope', 'src/billing', '--claim', 'Requests are capped at 100 rps.',
    '--rationale', 'Protects the ledger from the saturation found in testing.',
    '--revisit-if', 'the ledger moves to a store without the write ceiling');

  const result = cairn(dir, 'review');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /named a condition to revisit/);
  assert.match(result.stdout, /without the write ceiling/);
  assert.equal(cairn(dir, 'review', '--churn', 'lots').code, 2);
});

test('show renders one anchor and reports a missing fork', (t) => {
  const dir = billingWorkspace(t);
  const result = cairn(dir, 'show', 'ANC-0003', '--fork');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Ledger saturates above 200 rps/);
  assert.match(result.stdout, /No alternatives were recorded/);
  assert.equal(cairn(dir, 'show', 'ANC-9999').code, 3);
});
