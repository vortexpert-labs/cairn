import fs from 'node:fs';
import path from 'node:path';
import { PLATFORMS } from '../adapters/platforms.js';
import { removeBlock, extractBlock } from '../adapters/render.js';
import { style, symbol } from '../render/terminal.js';

/**
 * Drop directories the removal emptied, but never one that still holds
 * anything: `.github/` in particular usually has workflows in it.
 */
function pruneEmptyDirs(from, root) {
  let dir = path.dirname(from);
  while (dir.startsWith(root) && dir !== root) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    if (entries.length > 0) return;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

/**
 * Take the adapters back out.
 *
 * Being easy to remove is part of being safe to try. This touches only the
 * files Cairn generated and only the regions it owns; `.cairn/` and the
 * anchors themselves are left alone, because they are the user's record and
 * deleting them is not a decision a tool should make.
 */
export function uninstall({ root, options }) {
  const removed = [];
  const kept = [];

  for (const platform of PLATFORMS) {
    const file = path.join(root, platform.target);
    if (!fs.existsSync(file)) continue;
    const current = fs.readFileSync(file, 'utf8');

    if (platform.mode === 'file') {
      removed.push({ target: platform.target, action: 'delete' });
      if (!options.dryRun) {
        fs.rmSync(file);
        pruneEmptyDirs(file, root);
      }
      continue;
    }

    if (!extractBlock(current)) {
      kept.push(platform.target);
      continue;
    }
    const next = removeBlock(current);
    removed.push({ target: platform.target, action: next.trim() === '' ? 'delete' : 'clear region' });
    if (!options.dryRun) {
      if (next.trim() === '') {
        fs.rmSync(file);
        pruneEmptyDirs(file, root);
      } else {
        fs.writeFileSync(file, next, 'utf8');
      }
    }
  }

  if (removed.length === 0) {
    console.log('No Cairn adapters found.');
    return 0;
  }

  const verb = options.dryRun ? 'Would remove' : 'Removed';
  console.log(`${style.bold(verb)}:`);
  for (const item of removed) {
    console.log(`  ${item.target}  ${style.dim(item.action)}`);
  }
  for (const target of kept) {
    console.log(`  ${style.dim(`${target} left alone — no Cairn region`)}`);
  }

  console.log(
    `\n${style.dim('.cairn/ and your anchors are untouched. Delete that directory yourself if you want it gone.')}`,
  );
  return 0;
}
