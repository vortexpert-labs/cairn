import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { applyTransition, canTransition, TRANSITIONS } from '../anchor/transition.js';
import { renderIndex, readIndex } from '../render/index.js';
import { style, symbol } from '../render/terminal.js';

/**
 * Move an anchor through its lifecycle.
 *
 * Without this the governance model — an agent drafts PROPOSED, a person
 * promotes to ACTIVE — would require hand-editing YAML, which is exactly the
 * friction that stops people maintaining a decision record at all.
 */
export function status({ dir, ids, target, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }
  const wanted = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map((i) => String(i).toUpperCase());
  if (wanted.length === 0 || !target) {
    console.error(`usage: cairn status <id...> <STATUS>\nFor example: cairn status ANC-0007 ACTIVE`);
    return 2;
  }

  const next = String(target).toUpperCase();
  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);

  if (!(next in TRANSITIONS)) {
    console.error(`unknown status '${target}'. Expected one of: ${Object.keys(TRANSITIONS).join(', ')}`);
    return 2;
  }

  // Every id is validated before any file is written. Ratifying three anchors
  // and failing on the fourth would leave the batch half-applied, which is worse
  // than refusing outright — the person would have to work out which took.
  const pending = [];
  for (const id of wanted) {
    const anchor = anchors.find((a) => a.id === id);
    if (!anchor) {
      console.error(`no anchor with id ${id}.`);
      return 3;
    }
    if (anchor.status === next) {
      console.log(`${id} is already ${next}.`);
      continue;
    }
    if (!canTransition(anchor.status, next)) {
      const allowed = TRANSITIONS[anchor.status];
      console.error(
        allowed.length
          ? `${id} is ${anchor.status}; it can only become ${allowed.join(' or ')}.`
          : `${id} is ${anchor.status}, which is final. Record the change in a new anchor instead.`,
      );
      return 2;
    }
    if (next === 'SUPERSEDED' && !options.by) {
      console.error(
        `superseding needs the anchor that replaces this one.\n` +
          `Use 'cairn new --supersedes ${id} ...', which writes both sides.`,
      );
      return 2;
    }
    pending.push(anchor);
  }

  if (pending.length === 0) return 0;

  for (const anchor of pending) {
    applyTransition(anchor.path, {
      status: next,
      superseded_by: next === 'SUPERSEDED' ? options.by : undefined,
      invalidated_by: next === 'INVALIDATED' ? options.by : undefined,
    });
    console.log(`${style.green(symbol.ok)} ${anchor.id}  ${anchor.status} → ${next}`);

    // A draft that replaces something retires it here, at the moment a person
    // agrees, rather than when the draft was written. Until then both sides are
    // untouched, so a scope is never left ungoverned by an unreviewed draft.
    if (next === 'ACTIVE' && anchor.supersedes?.length) {
      for (const id of anchor.supersedes) {
        const target = anchors.find((a) => a.id === id);
        if (!target || target.status !== 'ACTIVE') continue;
        applyTransition(target.path, { status: 'SUPERSEDED', superseded_by: anchor.id });
        console.log(`${style.green(symbol.ok)} ${target.id}  ACTIVE → SUPERSEDED`);
      }
    }
  }

  const indexPath = path.join(dir, 'INDEX.md');
  const reloaded = loadAnchors(dir, schema).anchors;
  fs.writeFileSync(indexPath, renderIndex(readIndex(indexPath), reloaded), 'utf8');
  console.log(`${style.green(symbol.ok)} INDEX.md updated`);
  return 0;
}
