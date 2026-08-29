import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema, nextId } from '../anchor/load.js';
import { serializeAnchor, slugify } from '../anchor/serialize.js';
import { validate } from '../schema/validator.js';
import { anchorsFor, normalise } from '../graph/scope.js';
import { byDate } from '../graph/timeline.js';
import { renderIndex, readIndex } from '../render/index.js';

/**
 * The tool bodies, returning plain text.
 *
 * These deliberately do not reuse the CLI command functions: those write to
 * stdout, and on a stdio transport stdout carries the protocol. Anything
 * printed there that is not a JSON-RPC message corrupts the session.
 */

function load(dir) {
  const schema = readSchema(dir);
  return { schema, ...loadAnchors(dir, schema) };
}

function describe(anchor, { reasoning = true } = {}) {
  const lines = [`${anchor.id} — ${anchor.title} (${anchor.type}, scope: ${anchor.scope})`];
  for (const claim of anchor.claims) lines.push(`  - ${claim}`);
  for (const alternative of anchor.alternatives || []) {
    lines.push(`  - already ruled out: ${alternative.option} — ${alternative.rejected_because}`);
  }
  if (anchor.revisit_if) lines.push(`  - revisit if: ${anchor.revisit_if}`);
  if (anchor.supersedes?.length) lines.push(`  - supersedes ${anchor.supersedes.join(', ')}`);
  if (reasoning && anchor.rationale) lines.push(`  why: ${anchor.rationale}`);
  return lines.join('\n');
}

export function why(dir, { path: target }) {
  if (!target) throw new Error('path is required');
  const { anchors } = load(dir);
  const relative = normalise(target);
  const found = anchorsFor(anchors, relative, { statuses: ['ACTIVE'] });

  if (found.length === 0) return `Nothing in this repository governs ${relative}.`;

  const scoped = found.filter((a) => a.scope !== 'global');
  const universal = found.filter((a) => a.scope === 'global');
  const out = [`Anchors governing ${relative}. These are binding.`, ''];

  for (const anchor of scoped) out.push(describe(anchor), '');
  if (universal.length) {
    out.push('Project-wide:', '');
    for (const anchor of universal) out.push(describe(anchor), '');
  }
  return out.join('\n').trim();
}

export function context(dir, { scope } = {}) {
  const { anchors } = load(dir);
  const active = scope
    ? anchorsFor(anchors, normalise(scope), { statuses: ['ACTIVE'] })
    : anchors.filter((a) => a.status === 'ACTIVE');

  if (active.length === 0) return 'This repository has no active anchors.';

  const out = [scope ? `Active anchors governing ${scope}:` : 'Active anchors:', ''];
  for (const anchor of active) out.push(describe(anchor), '');
  return out.join('\n').trim();
}

export function show(dir, { id }) {
  if (!id) throw new Error('id is required');
  const { anchors } = load(dir);
  const anchor = anchors.find((a) => a.id === String(id).toUpperCase());
  if (!anchor) throw new Error(`no anchor with id ${id}`);

  const out = [describe(anchor), `  status: ${anchor.status}`, `  recorded: ${anchor.created_at}`];
  if (anchor.superseded_by) out.push(`  superseded by: ${anchor.superseded_by}`);
  if (anchor.evidence?.length) out.push(`  evidence: ${anchor.evidence.join(', ')}`);
  if (anchor.body) out.push('', anchor.body);
  return out.join('\n');
}

export function timeline(dir, { scope } = {}) {
  const { anchors } = load(dir);
  const selected = scope ? anchorsFor(anchors, normalise(scope), {
    statuses: ['ACTIVE', 'PROPOSED', 'SUPERSEDED', 'INVALIDATED', 'RETIRED'],
  }) : anchors;

  if (selected.length === 0) return 'No anchors yet.';

  return byDate(selected).map((anchor) =>
    `${anchor.created_at.slice(0, 10)}  ${anchor.id}  ${anchor.type}  ${anchor.title}  [${anchor.status}]` +
    (anchor.supersedes?.length ? `\n            supersedes ${anchor.supersedes.join(', ')}` : ''),
  ).join('\n');
}

/**
 * Record a new anchor.
 *
 * Always PROPOSED, never ACTIVE, and the tool description says so. An agent
 * drafting a rule that immediately binds the repository would put the whole
 * governance model in the hands of whatever was most recently plausible.
 */
export function record(dir, args) {
  const { schema } = load(dir);
  const id = nextId(dir);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const claims = Array.isArray(args.claims) ? args.claims : [args.claims].filter(Boolean);
  if (claims.length === 0) throw new Error('at least one claim is required');
  if (!args.title) throw new Error('title is required');
  if (!args.rationale) throw new Error('rationale is required');

  const anchor = {
    id,
    title: args.title,
    type: String(args.type || 'DECISION').toUpperCase(),
    status: 'PROPOSED',
    created_at: now,
    scope: args.scope || 'global',
    claims,
    rationale: args.rationale,
    body: '',
  };
  if (Array.isArray(args.alternatives) && args.alternatives.length) {
    anchor.alternatives = args.alternatives;
  }
  if (args.revisit_if) anchor.revisit_if = args.revisit_if;

  const errors = validate(
    Object.fromEntries(Object.entries(anchor).filter(([k]) => k !== 'body')),
    schema,
  );
  if (errors.length) {
    throw new Error(errors.map((e) => `${e.path || '(root)'} ${e.message}`).join('; '));
  }

  const file = `${id}-${slugify(anchor.title)}.md`;
  fs.writeFileSync(path.join(dir, file), serializeAnchor(anchor), 'utf8');

  const indexFile = path.join(dir, 'INDEX.md');
  const { anchors } = load(dir);
  fs.writeFileSync(indexFile, renderIndex(readIndex(indexFile), anchors), 'utf8');

  return `Recorded ${id} as PROPOSED in ${file}.\n` +
    `It is not binding until a person promotes it: cairn status ${id} ACTIVE`;
}
