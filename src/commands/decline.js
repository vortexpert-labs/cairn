import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { recordDeclined } from '../anchor/declined.js';
import { renderIndex, readIndex } from '../render/index.js';
import { style, symbol } from '../render/terminal.js';

/**
 * Turn down a draft.
 *
 * Declining has to be cheap and expected, because the drafting bar is set lower
 * than the promotion bar on purpose: a draft that should not have been written
 * costs a few seconds to reject, while a decision that was never recorded is
 * gone. That asymmetry only works if saying no is easy.
 *
 * Only a PROPOSED anchor can be declined. Anything already ACTIVE has governed
 * work and its removal is a lifecycle event, not a rejection — that goes through
 * `cairn status` to SUPERSEDED, INVALIDATED or RETIRED, which leaves a record.
 */
export function decline({ dir, ids, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }
  const wanted = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map((i) => String(i).toUpperCase());
  if (wanted.length === 0) {
    console.error(`usage: cairn decline <id...>\nFor example: cairn decline ANC-0012`);
    return 2;
  }

  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);

  const targets = [];
  for (const id of wanted) {
    const anchor = anchors.find((a) => a.id === id);
    if (!anchor) {
      console.error(`no anchor with id ${id}.`);
      return 3;
    }
    if (anchor.status !== 'PROPOSED') {
      console.error(
        `${id} is ${anchor.status}, not PROPOSED. Only a draft can be declined; ` +
          `an anchor that has governed work is retired through 'cairn status'.`,
      );
      return 2;
    }
    // Removing an anchor something else rests on would leave a dangling
    // reference that `check` would then report against the survivor.
    const dependents = anchors.filter(
      (a) => a.id !== id && (a.depends_on?.includes(id) || a.supersedes?.includes(id)),
    );
    if (dependents.length) {
      console.error(
        `${id} is referenced by ${dependents.map((d) => d.id).join(', ')}. ` +
          `Resolve those first.`,
      );
      return 2;
    }
    targets.push(anchor);
  }

  for (const anchor of targets) {
    recordDeclined(dir, {
      title: anchor.title,
      type: anchor.type,
      scope: anchor.scope,
      claims: anchor.claims,
      reason: options.reason,
    });
    fs.rmSync(anchor.path);
    console.log(`${style.green(symbol.ok)} ${anchor.id}  declined  ${style.dim(anchor.title)}`);
  }

  const indexPath = path.join(dir, 'INDEX.md');
  const reloaded = loadAnchors(dir, schema).anchors;
  fs.writeFileSync(indexPath, renderIndex(readIndex(indexPath), reloaded), 'utf8');
  console.log(`${style.green(symbol.ok)} INDEX.md updated`);
  console.log(
    style.dim(`Recorded in ${CAIRN_DIR}/declined.json so it will not be proposed again.`),
  );
  return 0;
}
