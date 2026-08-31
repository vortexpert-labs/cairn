import fs from 'node:fs';
import path from 'node:path';

export const DECLINED_FILE = 'declined.json';

/**
 * Drafts a person looked at and turned down.
 *
 * This is not a sixth status. A declined draft is not settled knowledge — it is
 * a suggestion that was considered and rejected — so it does not belong in the
 * anchor set, and inventing a status for it would put it there. What it needs is
 * somewhere an agent can check before proposing, so the same suggestion does not
 * arrive again next week. A detector that repeats itself trains people to stop
 * reading proposals, which costs more than the occasional missed decision.
 *
 * The ledger is committed rather than ignored. Suppression that lives on one
 * machine means a teammate's agent re-proposes what you already rejected, and
 * the annoyance it exists to prevent comes back through the side door.
 */
export function declinedPath(dir) {
  return path.join(dir, DECLINED_FILE);
}

export function readDeclined(dir) {
  const file = declinedPath(dir);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.declined) ? parsed.declined : [];
  } catch {
    // A corrupt ledger must not stop anyone working. Suppression is a
    // convenience; losing it costs a duplicate proposal, not correctness.
    return [];
  }
}

export function recordDeclined(dir, entry) {
  const existing = readDeclined(dir);
  existing.push({
    title: entry.title,
    type: entry.type,
    scope: entry.scope,
    claims: entry.claims,
    declined_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...(entry.reason ? { reason: entry.reason } : {}),
  });
  const body = {
    comment:
      'Drafts that were proposed and turned down. Agents read this before ' +
      'proposing, so the same suggestion is not made twice. These are not anchors.',
    declined: existing,
  };
  fs.writeFileSync(declinedPath(dir), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return existing.length;
}
