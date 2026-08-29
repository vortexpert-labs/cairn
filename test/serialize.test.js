import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeAnchor, slugify } from '../src/anchor/serialize.js';
import { parseFrontmatter } from '../src/anchor/parse.js';

const anchor = {
  id: 'ANC-0019',
  title: 'PgBouncer over direct pooling',
  type: 'DECISION',
  status: 'ACTIVE',
  created_at: '2026-04-02T09:00:00Z',
  scope: 'src/billing',
  supersedes: ['ANC-0004'],
  depends_on: ['ANC-0011'],
  claims: ['Pooling goes through PgBouncer in transaction mode.', 'No direct pooled connections.'],
  rationale: 'Direct pooling saturated at roughly 200 requests per second and the failure mode was silent.',
  alternatives: [{ option: 'Direct pooling', rejected_because: 'Saturates at ~200 rps.' }],
  revisit_if: 'write volume stays under 50/s through Q2',
  evidence: ['https://example.com/pull/812'],
  body: '### Notes\n\nApplies to the read replica too.',
};

test('survives a serialize/parse round trip', () => {
  const { data, body } = parseFrontmatter(serializeAnchor(anchor));
  for (const key of ['id', 'title', 'type', 'status', 'created_at', 'scope', 'revisit_if', 'rationale']) {
    assert.equal(data[key], anchor[key], key);
  }
  assert.deepEqual(data.claims, anchor.claims);
  assert.deepEqual(data.supersedes, anchor.supersedes);
  assert.deepEqual(data.depends_on, anchor.depends_on);
  assert.deepEqual(data.alternatives, anchor.alternatives);
  assert.deepEqual(data.evidence, anchor.evidence);
  assert.equal(body, anchor.body);
});

test('omits empty optional fields rather than writing blanks', () => {
  const output = serializeAnchor({
    id: 'ANC-0001', title: 'x', type: 'GOAL', status: 'PROPOSED',
    created_at: '2026-01-01T00:00:00Z', scope: 'global',
    claims: ['a'], rationale: 'b',
  });
  for (const field of ['scope:', 'supersedes:', 'alternatives:', 'verify:', 'evidence:', 'revisit_if:']) {
    assert.ok(!output.includes(field), `${field} should be omitted`);
  }
});

test('quotes values that would otherwise break parsing', () => {
  const { data } = parseFrontmatter(serializeAnchor({
    id: 'ANC-0001', title: 'Ratio: 2:1 rule', type: 'GOAL', status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z', claims: ['a: b: c'], rationale: 'x',
  }));
  assert.equal(data.title, 'Ratio: 2:1 rule');
  assert.deepEqual(data.claims, ['a: b: c']);
});

test('slugify produces safe filenames', () => {
  assert.equal(slugify('No ORM in billing'), 'no-orm-in-billing');
  assert.equal(slugify('  Weird!! Chars??  '), 'weird-chars');
  assert.equal(slugify('!!!'), 'anchor');
  assert.ok(slugify('x'.repeat(80)).length <= 50);
});

test('values containing quotes and backslashes survive a round trip', () => {
  const tricky = {
    id: 'ANC-0001',
    title: 'Rule with "quotes" and a \\ backslash',
    type: 'CONSTRAINT',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    claims: ['Say "no" to this, and to C:\\Windows\\paths.'],
    rationale: 'Because quoting bugs are found in production, not in tests.',
    verify: { command: 'node -e "process.exit(0)"', description: 'a quoted shell command' },
  };
  const { data } = parseFrontmatter(serializeAnchor(tricky));
  assert.equal(data.title, tricky.title);
  assert.deepEqual(data.claims, tricky.claims);
  assert.equal(data.verify.command, tricky.verify.command);
  assert.equal(data.verify.description, tricky.verify.description);
});
