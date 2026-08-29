import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { anchorsFor, normalise } from '../graph/scope.js';
import { anchorLines } from '../render/anchor.js';
import { style, symbol } from '../render/terminal.js';

/**
 * Which anchors govern the files a change touches.
 *
 * This is what makes an anchor reviewable at the moment it matters. A
 * constraint recorded a year ago is worth nothing if nobody sees it while
 * approving the pull request that breaks it.
 */
function changedFiles(root, base) {
  const output = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString();
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function affected({ dir, root, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }

  const base = options.base || 'origin/main';
  let files;
  try {
    files = changedFiles(root, base);
  } catch {
    console.error(`could not diff against '${base}'. Is it a ref this clone has?`);
    return 3;
  }

  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);

  const governing = new Map();
  for (const file of files) {
    for (const anchor of anchorsFor(anchors, normalise(file), { statuses: ['ACTIVE'] })) {
      if (anchor.scope === 'global') continue; // true of every change; not news
      if (!governing.has(anchor.id)) governing.set(anchor.id, { anchor, files: [] });
      governing.get(anchor.id).files.push(file);
    }
  }

  const proposed = anchors.filter((a) => a.status === 'PROPOSED');
  const results = [...governing.values()];

  // Rendered here rather than in the workflow: formatting logic embedded in
  // YAML is untestable, and this way the comment is covered by the suite.
  if (options.format === 'markdown') {
    if (results.length === 0 && proposed.length === 0) return 0;

    const out = ['<!-- cairn-comment -->', '### Anchors governing this change', ''];
    for (const { anchor, files: touched } of results) {
      const shown = touched.slice(0, 4).map((f) => `\`${f}\``).join(', ');
      const more = touched.length > 4 ? ` and ${touched.length - 4} more` : '';
      out.push(`- **${anchor.id}** (${anchor.type}) ${anchor.title} — touches ${shown}${more}`);
      for (const alternative of anchor.alternatives || []) {
        out.push(`  - already ruled out: ${alternative.option} — ${alternative.rejected_because}`);
      }
    }
    if (proposed.length) {
      out.push('', '**Awaiting a decision.** Drafted, but not binding:', '');
      for (const anchor of proposed) out.push(`- ${anchor.id} ${anchor.title}`);
      out.push('', 'Promote with `cairn status <id> ACTIVE`, or leave them proposed.');
    }
    console.log(out.join('\n'));
    return 0;
  }

  if (options.json) {
    console.log(JSON.stringify({
      base,
      changed: files.length,
      governing: results.map(({ anchor, files: touched }) => ({
        id: anchor.id, title: anchor.title, type: anchor.type, scope: anchor.scope, files: touched,
      })),
      proposed: proposed.map((a) => ({ id: a.id, title: a.title })),
    }, null, 2));
    return 0;
  }

  if (results.length === 0 && proposed.length === 0) {
    console.log(`${style.green(symbol.ok)} No anchors govern the ${files.length} changed file(s).`);
    return 0;
  }

  if (results.length) {
    console.log(style.bold(`Anchors governing this change\n`));
    for (const { anchor, files: touched } of results) {
      for (const line of anchorLines(anchor)) console.log(line);
      console.log(`            ${style.dim(`touches ${touched.slice(0, 4).join(', ')}` +
        (touched.length > 4 ? ` and ${touched.length - 4} more` : ''))}`);
      console.log('');
    }
  }

  if (proposed.length) {
    console.log(style.yellow(`${proposed.length} anchor(s) awaiting a decision:`));
    for (const anchor of proposed) {
      console.log(`  ${style.bold(anchor.id)}  ${anchor.title}`);
    }
    console.log(style.dim(`\n  Promote with: cairn status <id> ACTIVE`));
  }

  return 0;
}
