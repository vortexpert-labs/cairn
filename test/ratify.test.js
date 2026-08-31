import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readDeclined } from '../src/anchor/declined.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/cairn.js');

function workspace() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-ratify-')));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], {
    cwd: dir,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@e',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@e',
    },
  });
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

function seed(dir) {
  cairn(dir, 'init', '--stage', 'PROTOTYPE');
  cairn(dir, 'new', '--title', 'No ORM in billing', '--type', 'CONSTRAINT',
    '--scope', 'src/billing', '--claim', 'Billing queries are hand-written SQL.',
    '--rationale', 'Audit requires statement-level traceability.');
  cairn(dir, 'new', '--title', 'Sessions must not use Redis', '--type', 'REJECTED_PATH',
    '--scope', 'src/sessions', '--claim', 'Session state must not be stored in Redis.',
    '--rationale', 'Eviction under memory pressure signed users out mid-checkout.');
  return dir;
}

// The governance model rests on this: an agent may write, but what it writes
// must not steer anyone until a person has agreed to it. If a draft leaked into
// the injected context, unreviewed machine-written text would be governing work,
// which is the condition the review gate exists to prevent.
test('a draft governs nothing until it is ratified', () => {
  const dir = seed(workspace());

  const before = cairn(dir, 'context').stdout;
  assert.ok(!before.includes('hand-written SQL'), 'a PROPOSED anchor must not reach context');
  assert.ok(!before.includes('Redis'), 'a PROPOSED anchor must not reach context');

  cairn(dir, 'status', 'ANC-0002', 'ACTIVE');
  const after = cairn(dir, 'context').stdout;
  assert.ok(after.includes('hand-written SQL'), 'an ACTIVE anchor must reach context');
  assert.ok(!after.includes('Redis'), 'the still-PROPOSED anchor must stay out');
});

test('review --proposed lists drafts and nothing else', () => {
  const dir = seed(workspace());
  const out = cairn(dir, 'review', '--proposed').stdout;
  assert.match(out, /Drafts waiting for a decision \(2\)/);
  assert.match(out, /ANC-0002/);
  assert.match(out, /ANC-0003/);
  // The commands to act on them are printed ready to paste, because the point
  // of batching ratification is that it costs one step, not three.
  assert.match(out, /cairn status ANC-0002 ANC-0003 ACTIVE/);
  assert.match(out, /cairn decline ANC-0002 ANC-0003/);
});

test('several anchors are ratified in one command', () => {
  const dir = seed(workspace());
  const result = cairn(dir, 'status', 'ANC-0002', 'ANC-0003', 'ACTIVE');
  assert.equal(result.code, 0);

  const context = cairn(dir, 'context').stdout;
  assert.ok(context.includes('hand-written SQL'));
  assert.ok(context.includes('Redis'));
  assert.equal(cairn(dir, 'review', '--proposed').stdout.includes('ANC-0002'), false);
});

// Half-applying a batch would leave someone working out which of their anchors
// took effect, which is worse than refusing the whole thing.
test('a batch with one bad id changes nothing', () => {
  const dir = seed(workspace());
  const result = cairn(dir, 'status', 'ANC-0002', 'ANC-9999', 'ACTIVE');
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /no anchor with id ANC-9999/);
  assert.ok(
    !cairn(dir, 'context').stdout.includes('hand-written SQL'),
    'the valid id must not have been applied',
  );
});

test('declining removes the draft and records why', () => {
  const dir = seed(workspace());
  const result = cairn(dir, 'decline', 'ANC-0003', '--reason', 'not a real constraint');
  assert.equal(result.code, 0);

  assert.equal(cairn(dir, 'show', 'ANC-0003').code, 3, 'the anchor should be gone');

  const declined = readDeclined(path.join(dir, '.cairn'));
  assert.equal(declined.length, 1);
  assert.equal(declined[0].title, 'Sessions must not use Redis');
  assert.equal(declined[0].type, 'REJECTED_PATH');
  assert.equal(declined[0].reason, 'not a real constraint');
  assert.deepEqual(declined[0].claims, ['Session state must not be stored in Redis.']);

  assert.equal(cairn(dir, 'check', '--strict').code, 0, 'the repo stays valid after a decline');
});

// Suppression is the whole reason the ledger exists: a detector that suggests
// the same rejected draft next week teaches people to stop reading proposals.
test('the declined ledger accumulates rather than replacing', () => {
  const dir = seed(workspace());
  cairn(dir, 'decline', 'ANC-0002');
  cairn(dir, 'decline', 'ANC-0003');
  assert.equal(readDeclined(path.join(dir, '.cairn')).length, 2);
});

test('an anchor that has governed work cannot be declined', () => {
  const dir = seed(workspace());
  cairn(dir, 'status', 'ANC-0002', 'ACTIVE');

  const result = cairn(dir, 'decline', 'ANC-0002');
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /is ACTIVE, not PROPOSED/);
  assert.equal(cairn(dir, 'show', 'ANC-0002').code, 0, 'the anchor must survive');
});

test('a draft something else rests on cannot be declined', () => {
  const dir = seed(workspace());
  cairn(dir, 'new', '--title', 'Follows from the billing rule', '--type', 'DECISION',
    '--scope', 'src/billing', '--claim', 'Query helpers live in src/billing/db.py.',
    '--rationale', 'Keeps the hand-written SQL in one place.',
    '--depends-on', 'ANC-0002');

  const result = cairn(dir, 'decline', 'ANC-0002');
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /referenced by ANC-0004/);
});

// The gap this closes: an agent drafting a replacement used to retire the old
// anchor immediately, leaving the scope governed by nothing while the
// replacement sat unreviewed. A draft must not be able to withdraw a rule.
test('a draft does not retire what it proposes to replace', () => {
  const dir = seed(workspace());
  cairn(dir, 'status', 'ANC-0002', 'ACTIVE');
  cairn(dir, 'new', '--title', 'Billing may use the query builder', '--type', 'DECISION',
    '--scope', 'src/billing', '--claim', 'Billing uses the query builder.',
    '--rationale', 'The audit trail is now produced by the builder itself.',
    '--alternative', 'Keep hand-written SQL :: the builder now emits the same audit trail',
    '--supersedes', 'ANC-0002');

  assert.match(cairn(dir, 'show', 'ANC-0002').stdout, /ACTIVE/, 'the old rule must still bind');
  assert.match(cairn(dir, 'show', 'ANC-0004').stdout, /PROPOSED/);
  assert.ok(
    cairn(dir, 'context', '--scope', 'src/billing').stdout.includes('hand-written SQL'),
    'the scope must never be left ungoverned by an unreviewed draft',
  );
  assert.equal(cairn(dir, 'check', '--strict').code, 0);
});

test('accepting a replacement retires what it supersedes, in one step', () => {
  const dir = seed(workspace());
  cairn(dir, 'status', 'ANC-0002', 'ACTIVE');
  cairn(dir, 'new', '--title', 'Billing may use the query builder', '--type', 'DECISION',
    '--scope', 'src/billing', '--claim', 'Billing uses the query builder.',
    '--rationale', 'The audit trail is now produced by the builder itself.',
    '--alternative', 'Keep hand-written SQL :: the builder now emits the same audit trail',
    '--supersedes', 'ANC-0002');

  cairn(dir, 'status', 'ANC-0004', 'ACTIVE');

  assert.match(cairn(dir, 'show', 'ANC-0002').stdout, /SUPERSEDED/);
  assert.match(cairn(dir, 'show', 'ANC-0004').stdout, /ACTIVE/);
  assert.equal(cairn(dir, 'check', '--strict').code, 0, 'both sides of the supersession agree');

  const context = cairn(dir, 'context', '--scope', 'src/billing').stdout;
  assert.ok(context.includes('query builder'), 'the replacement now governs');
  // Matched on the retired anchor's own rationale, since the phrase from its
  // claim survives legitimately inside the replacement's recorded alternative.
  assert.ok(
    !context.includes('statement-level traceability'),
    'the retired rule is no longer injected',
  );
});

test('the pull request comment renders drafts as markdown', () => {
  const dir = seed(workspace());
  const out = cairn(dir, 'review', '--proposed', '--format', 'markdown').stdout;
  assert.match(out, /#### Anchors proposed on this branch \(2\)/);
  assert.match(out, /\*\*ANC-0002\*\* · `CONSTRAINT` · `src\/billing`/);
  assert.match(out, /govern nothing until someone accepts them/);
  assert.match(out, /cairn status ANC-0002 ANC-0003 ACTIVE/);
});

test('nothing is rendered when there is nothing to decide', () => {
  const dir = workspace();
  cairn(dir, 'init', '--stage', 'PROTOTYPE');
  assert.equal(cairn(dir, 'review', '--proposed', '--format', 'markdown').stdout.trim(), '');
});
