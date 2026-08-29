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
export function status({ dir, id, target, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }
  if (!id || !target) {
    console.error(`usage: cairn status <id> <STATUS>\nFor example: cairn status ANC-0007 ACTIVE`);
    return 2;
  }

  const wanted = String(id).toUpperCase();
  const next = String(target).toUpperCase();
  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);
  const anchor = anchors.find((a) => a.id === wanted);

  if (!anchor) {
    console.error(`no anchor with id ${wanted}.`);
    return 3;
  }
  if (!(next in TRANSITIONS)) {
    console.error(`unknown status '${target}'. Expected one of: ${Object.keys(TRANSITIONS).join(', ')}`);
    return 2;
  }
  if (anchor.status === next) {
    console.log(`${wanted} is already ${next}.`);
    return 0;
  }
  if (!canTransition(anchor.status, next)) {
    const allowed = TRANSITIONS[anchor.status];
    console.error(
      allowed.length
        ? `${wanted} is ${anchor.status}; it can only become ${allowed.join(' or ')}.`
        : `${wanted} is ${anchor.status}, which is final. Record the change in a new anchor instead.`,
    );
    return 2;
  }
  if (next === 'SUPERSEDED' && !options.by) {
    console.error(
      `superseding needs the anchor that replaces this one.\n` +
        `Use 'cairn new --supersedes ${wanted} ...', which writes both sides.`,
    );
    return 2;
  }

  applyTransition(anchor.path, {
    status: next,
    superseded_by: next === 'SUPERSEDED' ? options.by : undefined,
    invalidated_by: next === 'INVALIDATED' ? options.by : undefined,
  });
  console.log(`${style.green(symbol.ok)} ${wanted}  ${anchor.status} → ${next}`);

  const indexPath = path.join(dir, 'INDEX.md');
  const reloaded = loadAnchors(dir, schema).anchors;
  fs.writeFileSync(indexPath, renderIndex(readIndex(indexPath), reloaded), 'utf8');
  console.log(`${style.green(symbol.ok)} INDEX.md updated`);
  return 0;
}
