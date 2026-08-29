import fs from 'node:fs';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { byDate } from '../graph/timeline.js';
import { anchorsFor, normalise } from '../graph/scope.js';
import { toMermaid } from '../render/mermaid.js';
import { statusTag } from '../render/anchor.js';
import { style } from '../render/terminal.js';

/**
 * The project's history, reconstructed rather than written.
 *
 * Nobody authors a narrative. The dates, the types and the supersession links
 * are already in the anchors; arranging them is all that is needed, which is
 * what keeps the format terse and the story readable at the same time.
 */
export function timeline({ dir, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }

  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);

  const statuses = ['ACTIVE', 'PROPOSED', 'SUPERSEDED', 'INVALIDATED', 'RETIRED'];
  let selected = options.scope
    ? anchorsFor(anchors, normalise(options.scope), { statuses })
    : anchors;
  selected = byDate(selected);

  const format = options.format || 'text';

  if (format === 'mermaid') {
    console.log(toMermaid(selected));
    return 0;
  }
  if (format === 'json') {
    console.log(JSON.stringify(selected, null, 2));
    return 0;
  }
  if (format !== 'text') {
    console.error(`unknown --format '${format}'. Expected text, mermaid or json.`);
    return 2;
  }

  if (selected.length === 0) {
    console.log('No anchors yet.');
    return 0;
  }

  for (const anchor of selected) {
    console.log(
      `${style.dim(anchor.created_at.slice(0, 7))}  ${style.bold(anchor.id)}  ` +
        `${style.cyan(String(anchor.type).padEnd(15))}${anchor.title}  ${statusTag(anchor.status)}`,
    );
    if (anchor.supersedes?.length) {
      console.log(`${' '.repeat(19)}${style.dim('supersedes ' + anchor.supersedes.join(', '))}`);
    }
    for (const alternative of anchor.alternatives || []) {
      console.log(`${' '.repeat(19)}${style.dim('ruled out: ' + alternative.option)}`);
    }
  }
  return 0;
}
