import test from 'node:test';
import assert from 'node:assert/strict';
import { renderIndex, registryBlock, START, END } from '../src/render/index.js';

const anchors = [
  { id: 'ANC-0001', file: 'ANC-0001-a.md', type: 'STAGE', title: 'Stage', scope: 'global', status: 'ACTIVE' },
  { id: 'ANC-0002', file: 'ANC-0002-b.md', type: 'DECISION', title: 'Choice', scope: 'src', status: 'PROPOSED' },
];

test('lists active and proposed anchors separately', () => {
  const block = registryBlock(anchors);
  assert.ok(block.indexOf('### Active') < block.indexOf('### Proposed'));
  assert.match(block, /[Nn]ot binding/);
});

test('preserves everything outside the markers byte-for-byte', () => {
  const existing = `# Orientation

## Goals

- **GOAL-01:** Ship billing by Q4.
- **GOAL-02:** p99 under 200ms.

${START}
stale content
${END}

## Notes written by a human
Keep me.
`;
  const result = renderIndex(existing, anchors);
  assert.ok(result.includes('- **GOAL-01:** Ship billing by Q4.'));
  assert.ok(result.includes('- **GOAL-02:** p99 under 200ms.'));
  assert.ok(result.includes('## Notes written by a human\nKeep me.'));
  assert.ok(!result.includes('stale content'));
  assert.equal(result.slice(0, result.indexOf(START)), existing.slice(0, existing.indexOf(START)));
});

test('is idempotent', () => {
  const once = renderIndex(null, anchors);
  assert.equal(renderIndex(once, anchors), once);
});

test('refuses to guess when the markers are absent', () => {
  assert.throws(() => renderIndex('# No markers here\n', anchors), /markers/);
});
