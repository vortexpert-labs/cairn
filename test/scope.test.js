import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeMatches, globToRegExp, anchorsFor } from '../src/graph/scope.js';

test('global matches everything', () => {
  assert.ok(scopeMatches('global', 'src/billing/invoice.js'));
  assert.ok(scopeMatches('global', 'README.md'));
});

test('a directory scope matches files beneath it', () => {
  assert.ok(scopeMatches('src/billing', 'src/billing/invoice.js'));
  assert.ok(scopeMatches('src/billing', 'src/billing'));
  assert.ok(!scopeMatches('src/billing', 'src/billings/other.js'), 'must respect segment boundaries');
  assert.ok(!scopeMatches('src/billing', 'src/api/x.js'));
});

test('asking about a parent directory surfaces anchors scoped beneath it', () => {
  assert.ok(scopeMatches('src/billing', 'src'), 'relevance runs both ways');
});

test('globs match within and across segments correctly', () => {
  assert.ok(globToRegExp('src/*.js').test('src/a.js'));
  assert.ok(!globToRegExp('src/*.js').test('src/nested/a.js'), 'a single star stays in one segment');
  assert.ok(globToRegExp('packages/**/*.ts').test('packages/api/src/x.ts'));
  assert.ok(globToRegExp('packages/**/*.ts').test('packages/x.ts'), '** may match nothing');
});

test('glob scopes are relevant to their literal prefix', () => {
  assert.ok(scopeMatches('packages/api/**', 'packages/api/src/handler.ts'));
  assert.ok(scopeMatches('packages/api/**', 'packages'));
  assert.ok(!scopeMatches('packages/api/**', 'packages/web/index.ts'));
});

test('anchorsFor returns only binding anchors, broadest first', () => {
  const anchors = [
    { id: 'ANC-0003', scope: 'src/billing/ledger', status: 'ACTIVE' },
    { id: 'ANC-0001', scope: 'global', status: 'ACTIVE' },
    { id: 'ANC-0002', scope: 'src/billing', status: 'ACTIVE' },
    { id: 'ANC-0004', scope: 'src/billing', status: 'PROPOSED' },
    { id: 'ANC-0005', scope: 'src/api', status: 'ACTIVE' },
  ];
  const found = anchorsFor(anchors, 'src/billing/ledger/post.js');
  assert.deepEqual(found.map((a) => a.id), ['ANC-0001', 'ANC-0002', 'ANC-0003']);
});
