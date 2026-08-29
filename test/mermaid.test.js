import test from 'node:test';
import assert from 'node:assert/strict';
import { toMermaid } from '../src/render/mermaid.js';
import { byDate, supersessionChain, heads } from '../src/graph/timeline.js';

const anchors = [
  { id: 'ANC-0001', title: 'Stage', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', depends_on: [] },
  { id: 'ANC-0002', title: 'SQLite', status: 'SUPERSEDED', created_at: '2026-02-01T00:00:00Z', depends_on: [], superseded_by: 'ANC-0004' },
  { id: 'ANC-0003', title: 'Saturates at 200 rps', status: 'ACTIVE', created_at: '2026-03-01T00:00:00Z', depends_on: [] },
  { id: 'ANC-0004', title: 'Postgres', status: 'ACTIVE', created_at: '2026-04-01T00:00:00Z', depends_on: ['ANC-0003'], supersedes: ['ANC-0002'] },
];

test('renders nodes, dependency edges and supersession edges', () => {
  const out = toMermaid(anchors);
  assert.match(out, /^graph TD/);
  assert.match(out, /ANC0004\["ANC-0004<br\/>Postgres"\]/);
  assert.match(out, /ANC0003 --> ANC0004/);
  assert.match(out, /ANC0002 -\.->\|superseded by\| ANC0004/);
});

test('assigns a class per status so closed anchors read as closed', () => {
  const out = toMermaid(anchors);
  assert.match(out, /class ANC0001,ANC0003,ANC0004 active;/);
  assert.match(out, /class ANC0002 closed;/);
});

test('escapes characters that would end a label early', () => {
  const out = toMermaid([
    { id: 'ANC-0001', title: 'Use "quotes" and [brackets]', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', depends_on: [] },
  ]);
  assert.ok(!out.includes('"quotes"'), 'raw quotes would terminate the label');
  assert.match(out, /&quot;quotes&quot;/);
  assert.match(out, /&#91;brackets&#93;/);
});

test('omits edges to anchors that are not in the rendered set', () => {
  const out = toMermaid([anchors[3]]);
  assert.ok(!out.includes('ANC0003 -->'), 'a filtered timeline must not dangle edges');
});

test('never emits an empty diagram body', () => {
  assert.match(toMermaid([]), /graph TD\n\s+empty/);
});

test('timeline helpers order by date and follow supersession', () => {
  assert.deepEqual(byDate(anchors).map((a) => a.id), ['ANC-0001', 'ANC-0002', 'ANC-0003', 'ANC-0004']);
  assert.deepEqual(supersessionChain(anchors, 'ANC-0002'), ['ANC-0002', 'ANC-0004']);
  assert.deepEqual(heads(anchors).map((a) => a.id), ['ANC-0001', 'ANC-0003', 'ANC-0004']);
});
