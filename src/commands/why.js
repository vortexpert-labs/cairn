import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { anchorsFor, normalise } from '../graph/scope.js';
import { anchorLines } from '../render/anchor.js';
import { style } from '../render/terminal.js';

/**
 * What governs a path.
 *
 * The question a person asks on their first day and an agent asks before it
 * edits: why is this code the way it is, and what am I not allowed to do here.
 */
export function why({ dir, root, target, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }
  if (!target) {
    console.error(`which path? For example: cairn why src/billing`);
    return 2;
  }

  const schema = readSchema(dir);
  const { anchors, failures } = loadAnchors(dir, schema);
  if (failures.length) {
    console.error(`${style.red('!')} ${failures.length} anchor(s) could not be read; run 'cairn check'.`);
  }

  // Accept either a repo-relative path or one relative to the working directory.
  const absolute = path.resolve(target);
  const relative = normalise(
    absolute.startsWith(root) ? path.relative(root, absolute) : target,
  );

  const active = anchorsFor(anchors, relative, { statuses: ['ACTIVE'] });
  const proposed = anchorsFor(anchors, relative, { statuses: ['PROPOSED'] });

  if (options.json) {
    console.log(JSON.stringify({ path: relative, active, proposed }, null, 2));
    return 0;
  }

  if (active.length === 0 && proposed.length === 0) {
    console.log(`Nothing governs ${style.bold(relative)}.`);
    return 0;
  }

  const scoped = active.filter((a) => a.scope !== 'global');
  const universal = active.filter((a) => a.scope === 'global');

  if (scoped.length) {
    const noun = scoped.length === 1 ? 'anchor governs' : 'anchors govern';
    console.log(`${style.bold(relative)} — ${scoped.length} ${noun} this path\n`);
    for (const anchor of scoped) {
      for (const line of anchorLines(anchor)) console.log(line);
      console.log('');
    }
  } else {
    console.log(`Nothing is scoped to ${style.bold(relative)} specifically.\n`);
  }

  if (universal.length) {
    console.log(style.dim(`Also applies project-wide:`));
    for (const anchor of universal) {
      for (const line of anchorLines(anchor)) console.log(line);
    }
    console.log('');
  }

  if (proposed.length) {
    console.log(style.yellow(`${proposed.length} proposed, not yet binding:`));
    for (const anchor of proposed) {
      for (const line of anchorLines(anchor)) console.log(line);
    }
    console.log('');
  }

  return 0;
}
