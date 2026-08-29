import fs from 'node:fs';

/**
 * Status changes, applied as surgical line edits.
 *
 * The file is not re-serialised. Only `status`, `updated_at`, `superseded_by`
 * and `invalidated_by` may change on an existing anchor, so touching anything
 * else — even reflowing the rationale — would both violate the format and
 * produce a diff that hides the one line that actually changed.
 */

// Frontmatter key order, so an inserted key lands where the serialiser would put it.
const ORDER = [
  'id', 'title', 'type', 'status', 'created_at', 'updated_at', 'scope',
  'supersedes', 'superseded_by', 'invalidated_by', 'depends_on',
  'claims', 'rationale', 'alternatives', 'revisit_if', 'verify', 'evidence',
];

export const TRANSITIONS = {
  PROPOSED: ['ACTIVE', 'INVALIDATED'],
  ACTIVE: ['SUPERSEDED', 'INVALIDATED', 'RETIRED'],
  SUPERSEDED: [],
  INVALIDATED: [],
  RETIRED: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function frontmatterBounds(lines) {
  if (lines[0]?.trim() !== '---') throw new Error("document does not begin with '---'");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return [1, i];
  }
  throw new Error("frontmatter is never closed with '---'");
}

/** Set a scalar key inside the frontmatter, replacing or inserting in order. */
function setKey(lines, key, value) {
  const [start, end] = frontmatterBounds(lines);
  const line = `${key}: ${value}`;
  const at = lines.findIndex(
    (l, i) => i > start - 1 && i < end && new RegExp(`^${key}:`).test(l),
  );

  if (at !== -1) {
    lines[at] = line;
    return lines;
  }

  const rank = ORDER.indexOf(key);
  let insertAt = end;
  for (let i = start; i < end; i++) {
    const existing = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(lines[i]);
    if (!existing) continue;
    const existingRank = ORDER.indexOf(existing[1]);
    if (existingRank > rank) {
      insertAt = i;
      break;
    }
  }
  lines.splice(insertAt, 0, line);
  return lines;
}

/**
 * Apply a status change to an anchor file in place.
 * @param {{status: string, superseded_by?: string, invalidated_by?: string}} change
 */
export function applyTransition(file, change) {
  const original = fs.readFileSync(file, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let lines = original.split(/\r?\n/);

  lines = setKey(lines, 'status', change.status);
  lines = setKey(lines, 'updated_at', new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  if (change.superseded_by) lines = setKey(lines, 'superseded_by', change.superseded_by);
  if (change.invalidated_by) lines = setKey(lines, 'invalidated_by', change.invalidated_by);

  fs.writeFileSync(file, lines.join(eol), 'utf8');
}
