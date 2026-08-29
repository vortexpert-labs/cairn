import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTransition, canTransition } from '../src/anchor/transition.js';
import { parseFrontmatter } from '../src/anchor/parse.js';

const ANCHOR = `---
id: ANC-0002
title: "SQLite as the ledger store"
type: DECISION
status: ACTIVE
created_at: 2026-01-01T00:00:00Z
scope: "src/billing"
claims:
  - "The ledger is stored in SQLite."
rationale: >
  Single writer at launch volumes.
---

Body text stays put.
`;

function withFile(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-tr-'));
  const file = path.join(dir, 'ANC-0002-x.md');
  fs.writeFileSync(file, ANCHOR);
  try { return run(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('only forward transitions are permitted', () => {
  assert.ok(canTransition('PROPOSED', 'ACTIVE'));
  assert.ok(canTransition('ACTIVE', 'RETIRED'));
  assert.ok(!canTransition('SUPERSEDED', 'ACTIVE'), 'closed anchors are final');
  assert.ok(!canTransition('ACTIVE', 'PROPOSED'), 'status never moves backwards');
  assert.ok(!canTransition('RETIRED', 'INVALIDATED'));
});

test('a transition touches only the lifecycle fields', () => {
  withFile((file) => {
    const before = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    applyTransition(file, { status: 'SUPERSEDED', superseded_by: 'ANC-0004' });
    const after = parseFrontmatter(fs.readFileSync(file, 'utf8'));

    assert.equal(after.data.status, 'SUPERSEDED');
    assert.equal(after.data.superseded_by, 'ANC-0004');
    assert.ok(after.data.updated_at, 'updated_at is stamped');

    // The immutable content must survive byte-for-byte.
    assert.deepEqual(after.data.claims, before.data.claims);
    assert.equal(after.data.rationale, before.data.rationale);
    assert.equal(after.data.created_at, before.data.created_at);
    assert.equal(after.body, before.body);
  });
});

test('inserted keys land in the documented field order', () => {
  withFile((file) => {
    applyTransition(file, { status: 'SUPERSEDED', superseded_by: 'ANC-0004' });
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.indexOf('created_at:') < text.indexOf('updated_at:'));
    assert.ok(text.indexOf('updated_at:') < text.indexOf('scope:'));
    assert.ok(text.indexOf('scope:') < text.indexOf('superseded_by:'));
    assert.ok(text.indexOf('superseded_by:') < text.indexOf('claims:'));
  });
});

test('a repeated transition replaces rather than duplicates a key', () => {
  withFile((file) => {
    applyTransition(file, { status: 'SUPERSEDED', superseded_by: 'ANC-0004' });
    applyTransition(file, { status: 'SUPERSEDED', superseded_by: 'ANC-0009' });
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.match(/^superseded_by:/gm).length, 1);
    assert.equal(text.match(/^status:/gm).length, 1);
    assert.match(text, /superseded_by: ANC-0009/);
  });
});
