import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { anchorsFor, normalise } from '../graph/scope.js';

/**
 * The orientation payload an agent should load.
 *
 * Plain Markdown, no colour, no decoration: this is what editor hooks inject
 * and what the MCP server returns, so it must be identical everywhere and
 * cheap enough to include on every session.
 */
export function context({ dir, root, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }

  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);

  const target = options.scope ? normalise(options.scope) : null;
  const selected = target
    ? anchorsFor(anchors, target, { statuses: ['ACTIVE'] })
    : anchors.filter((a) => a.status === 'ACTIVE');

  if (options.json) {
    console.log(JSON.stringify({ scope: target ?? 'global', anchors: selected }, null, 2));
    return 0;
  }

  const out = [];
  const indexPath = path.join(dir, 'INDEX.md');
  if (fs.existsSync(indexPath)) {
    const head = fs.readFileSync(indexPath, 'utf8').split('<!-- CAIRN-REGISTRY: START -->')[0];
    const stage = /\*\*Stage:\*\*\s*`?([A-Z_]+)`?/.exec(head);
    if (stage) out.push(`Project stage: ${stage[1]}`, '');
  }

  out.push(target ? `## Anchors governing ${target}` : '## Active anchors', '');

  if (selected.length === 0) {
    out.push('_None._');
  }

  for (const anchor of selected) {
    out.push(`### ${anchor.id} — ${anchor.title} (${anchor.type}, scope: ${anchor.scope})`);
    for (const claim of anchor.claims) out.push(`- ${claim}`);
    if (!options.brief && anchor.rationale) out.push('', `Why: ${anchor.rationale}`);
    for (const alternative of anchor.alternatives || []) {
      out.push(`- Ruled out: ${alternative.option} — ${alternative.rejected_because}`);
    }
    if (anchor.revisit_if) out.push(`- Revisit if: ${anchor.revisit_if}`);
    out.push('');
  }

  console.log(out.join('\n').trimEnd());
  return 0;
}
