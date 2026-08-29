import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from '../src/schema/validator.js';
import { packageRoot } from '../src/paths.js';

const schema = JSON.parse(fs.readFileSync(path.join(packageRoot, '.cairn/schema.json'), 'utf8'));

const valid = {
  id: 'ANC-0007',
  title: 'No ORM in billing',
  type: 'CONSTRAINT',
  status: 'ACTIVE',
  created_at: '2025-11-04T09:12:00Z',
  claims: ['Hand-written SQL only under src/billing.'],
  rationale: 'The audit requires statement-level traceability.',
};

test('accepts a well-formed anchor', () => {
  assert.deepEqual(validate(valid, schema), []);
});

test('rejects the exact document v1 accepted', () => {
  const errors = validate(
    { ...valid, type: 'BANANA', status: 'FLOATING', authority: 'GOD_MODE' },
    schema,
  );
  const paths = errors.map((e) => e.path);
  assert.ok(paths.includes('type'));
  assert.ok(paths.includes('status'));
  assert.ok(paths.includes('authority'), 'unknown fields must be rejected');
});

test('enforces required fields, lengths and formats', () => {
  assert.ok(validate({ ...valid, id: undefined }, schema).some((e) => e.path === 'id'));
  assert.ok(validate({ ...valid, title: 'x'.repeat(101) }, schema).some((e) => e.path === 'title'));
  assert.ok(validate({ ...valid, claims: [] }, schema).some((e) => e.path === 'claims'));
  assert.ok(validate({ ...valid, claims: ['x'.repeat(281)] }, schema).some((e) => e.path === 'claims[0]'));
  assert.ok(validate({ ...valid, created_at: 'yesterday' }, schema).some((e) => e.path === 'created_at'));
  assert.ok(validate({ ...valid, id: 'ANC-7' }, schema).some((e) => e.path === 'id'));
});

test('validates nested objects', () => {
  const errors = validate(
    { ...valid, alternatives: [{ option: 'SQLite' }] },
    schema,
  );
  assert.ok(errors.some((e) => e.path === 'alternatives[0].rejected_because'));
});

test('reports schema keywords it cannot enforce instead of ignoring them', () => {
  const errors = validate('x', { type: 'string', multipleOf: 2 });
  assert.ok(errors.some((e) => e.message.includes('unsupported keyword')));
});
