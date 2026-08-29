import fs from 'node:fs';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { supersessionChain } from '../graph/timeline.js';
import { statusTag } from '../render/anchor.js';
import { style } from '../render/terminal.js';

export function show({ dir, id, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }
  if (!id) {
    console.error(`which anchor? For example: cairn show ANC-0007`);
    return 2;
  }

  const wanted = String(id).toUpperCase();
  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);
  const anchor = anchors.find((a) => a.id === wanted);

  if (!anchor) {
    console.error(`no anchor with id ${wanted}.`);
    return 3;
  }

  if (options.json) {
    console.log(JSON.stringify(anchor, null, 2));
    return 0;
  }

  console.log(`${style.bold(anchor.id)}  ${anchor.title}`);
  console.log(
    `${anchor.type}  ${statusTag(anchor.status)}  ${style.dim(`scope ${anchor.scope}`)}  ` +
      `${style.dim(anchor.created_at.slice(0, 10))}\n`,
  );

  for (const claim of anchor.claims) console.log(`  ${claim}`);

  if (anchor.alternatives?.length) {
    console.log(`\n  ${style.bold('Ruled out at the time')}`);
    for (const alternative of anchor.alternatives) {
      console.log(`    ${alternative.option}`);
      console.log(`      ${style.dim(alternative.rejected_because)}`);
    }
  }

  if (options.fork && !anchor.alternatives?.length) {
    console.log(
      `\n  ${style.yellow('No alternatives were recorded, so there is no fork to reopen.')}`,
    );
  }

  if (anchor.revisit_if) console.log(`\n  ${style.dim('Revisit if:')} ${anchor.revisit_if}`);
  if (anchor.rationale) console.log(`\n  ${anchor.rationale}`);

  const chain = supersessionChain(anchors, anchor.id);
  if (chain.length > 1) {
    console.log(`\n  ${style.dim('Superseded by:')} ${chain.slice(1).join(' → ')}`);
  }
  if (anchor.supersedes?.length) {
    console.log(`  ${style.dim('Supersedes:')} ${anchor.supersedes.join(', ')}`);
  }
  if (anchor.evidence?.length) {
    console.log(`\n  ${style.dim('Evidence')}`);
    for (const item of anchor.evidence) console.log(`    ${item}`);
  }
  if (anchor.body) console.log(`\n${anchor.body}`);

  return 0;
}
