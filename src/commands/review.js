import fs from 'node:fs';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { churnSince } from '../graph/churn.js';
import { style, symbol } from '../render/terminal.js';

const DEFAULT_CHURN = 25;

/**
 * What needs a person's attention, from the two signals available without
 * asking anyone to remember anything: a condition the anchor named itself,
 * and a scope that has moved a long way since the anchor was written.
 */
export function review({ dir, root, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }

  const threshold = Number(options.churn ?? DEFAULT_CHURN);
  if (!Number.isFinite(threshold) || threshold < 1) {
    console.error(`--churn expects a positive number of commits.`);
    return 2;
  }

  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);
  const active = anchors.filter((a) => a.status === 'ACTIVE');

  const conditional = active.filter((a) => a.revisit_if);
  const churned = [];
  for (const anchor of active) {
    const result = churnSince(root, anchor.scope, anchor.created_at);
    if (result && result.commits >= threshold) churned.push({ anchor, ...result });
  }
  churned.sort((a, b) => b.commits - a.commits);

  if (options.json) {
    console.log(JSON.stringify({
      threshold,
      revisit: conditional.map((a) => ({ id: a.id, title: a.title, revisit_if: a.revisit_if })),
      churned: churned.map((c) => ({ id: c.anchor.id, title: c.anchor.title, path: c.path, commits: c.commits })),
    }, null, 2));
    return 0;
  }

  if (conditional.length === 0 && churned.length === 0) {
    console.log(`${style.green(symbol.ok)} Nothing is asking for attention.`);
    return 0;
  }

  if (conditional.length) {
    console.log(style.bold('Anchors that named a condition to revisit'));
    for (const anchor of conditional) {
      console.log(`  ${style.bold(anchor.id)}  ${anchor.title}`);
      console.log(`            ${style.dim('revisit if:')} ${anchor.revisit_if}`);
    }
    console.log('');
  }

  if (churned.length) {
    console.log(style.bold(`Scopes that moved a lot since their anchor was written`));
    for (const item of churned) {
      console.log(
        `  ${style.bold(item.anchor.id)}  ${item.anchor.title}\n` +
          `            ${style.dim(`${item.commits} commits to ${item.path} since ${item.anchor.created_at.slice(0, 10)}`)}`,
      );
    }
    console.log('');
  }

  console.log(style.dim('Nothing here is an error. These are anchors worth a second look.'));
  return 0;
}
