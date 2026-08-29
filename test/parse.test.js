import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, FrontmatterError } from '../src/anchor/parse.js';

test('parses scalars, lists, inline lists and folded blocks', () => {
  const { data } = parseFrontmatter(`---
id: ANC-0019
title: "PgBouncer over direct pooling"
type: DECISION
status: ACTIVE
created_at: 2026-04-02T09:00:00Z
supersedes: ["ANC-0004"]
depends_on: []
claims:
  - "Pooling goes through PgBouncer."
  - "Services must not open direct connections."
rationale: >
  Direct pooling saturated under load
  and failed silently.
---
`);
  assert.equal(data.id, 'ANC-0019');
  assert.equal(data.title, 'PgBouncer over direct pooling');
  assert.deepEqual(data.supersedes, ['ANC-0004']);
  assert.deepEqual(data.depends_on, []);
  assert.equal(data.claims.length, 2);
  assert.equal(data.rationale, 'Direct pooling saturated under load and failed silently.');
});

test('parses a list of objects', () => {
  const { data } = parseFrontmatter(`---
id: ANC-0001
alternatives:
  - option: "SQLite"
    rejected_because: "No concurrent writers."
  - option: "DynamoDB"
    rejected_because: "No team experience."
---
`);
  assert.deepEqual(data.alternatives, [
    { option: 'SQLite', rejected_because: 'No concurrent writers.' },
    { option: 'DynamoDB', rejected_because: 'No team experience.' },
  ]);
});

test('parses a nested mapping', () => {
  const { data } = parseFrontmatter(`---
id: ANC-0001
verify:
  command: "! rg -q sqlalchemy src"
  description: "No SQLAlchemy"
---
`);
  assert.deepEqual(data.verify, {
    command: '! rg -q sqlalchemy src',
    description: 'No SQLAlchemy',
  });
});

test('a horizontal rule in the body does not truncate parsing', () => {
  const { data, body } = parseFrontmatter(`---
id: ANC-0001
title: "x"
---

Intro.

---

After the rule.
`);
  assert.equal(data.id, 'ANC-0001');
  assert.ok(body.includes('After the rule.'));
  assert.ok(body.includes('---'));
});

test('handles CRLF line endings', () => {
  const { data } = parseFrontmatter('---\r\nid: ANC-0001\r\ntitle: "x"\r\n---\r\n\r\nBody\r\n');
  assert.equal(data.id, 'ANC-0001');
  assert.equal(data.title, 'x');
});

test('malformed input raises rather than guessing', () => {
  const cases = [
    ['no frontmatter', 'plain text'],
    ['unclosed frontmatter', '---\nid: ANC-0001\n'],
    ['unparseable line', '---\nid: ANC-0001\nnot a key value pair\n---\n'],
  ];
  for (const [label, input] of cases) {
    assert.throws(() => parseFrontmatter(input), FrontmatterError, label);
  }
});
