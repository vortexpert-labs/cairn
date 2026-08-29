import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceErrors, cycles, suspects } from '../src/graph/dag.js';

const anchor = (id, extra = {}) => ({
  id, file: `${id}.md`, status: 'ACTIVE', depends_on: [], ...extra,
});

test('flags references to anchors that do not exist', () => {
  const errors = referenceErrors([anchor('ANC-0001', { depends_on: ['ANC-9999'] })]);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /ANC-9999/);
});

test('detects dependency cycles', () => {
  const found = cycles([
    anchor('ANC-0001', { depends_on: ['ANC-0002'] }),
    anchor('ANC-0002', { depends_on: ['ANC-0003'] }),
    anchor('ANC-0003', { depends_on: ['ANC-0001'] }),
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].length, 4);
});

test('accepts an acyclic graph including a diamond', () => {
  assert.deepEqual(cycles([
    anchor('ANC-0001'),
    anchor('ANC-0002', { depends_on: ['ANC-0001'] }),
    anchor('ANC-0003', { depends_on: ['ANC-0001'] }),
    anchor('ANC-0004', { depends_on: ['ANC-0002', 'ANC-0003'] }),
  ]), []);
});

test('marks anchors resting on an invalidated ancestor as suspect', () => {
  const found = suspects([
    anchor('ANC-0001', { status: 'INVALIDATED' }),
    anchor('ANC-0002', { depends_on: ['ANC-0001'] }),
    anchor('ANC-0003', { depends_on: ['ANC-0002'] }),
    anchor('ANC-0004'),
  ]);
  assert.equal(found.get('ANC-0002'), 'ANC-0001');
  assert.equal(found.get('ANC-0003'), 'ANC-0001', 'suspicion is transitive');
  assert.ok(!found.has('ANC-0004'));
  assert.ok(!found.has('ANC-0001'), 'an invalidated anchor is not suspect of itself');
});
