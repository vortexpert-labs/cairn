import fs from 'node:fs';

export const START = '<!-- CAIRN-REGISTRY: START -->';
export const END = '<!-- CAIRN-REGISTRY: END -->';

const SCAFFOLD = `# Project Orientation

**Stage:** \`PROTOTYPE\`

## Goals

<!-- Written and maintained by you. Cairn never edits outside the markers below. -->

- 

## Anchors

${START}
${END}
`;

function table(rows) {
  const lines = ['| ID | Type | Title | Scope |', '|---|---|---|---|'];
  for (const a of rows) {
    const title = String(a.title).replace(/\|/g, '\\|');
    lines.push(`| [${a.id}](${a.file}) | ${a.type} | ${title} | \`${a.scope}\` |`);
  }
  return lines.join('\n');
}

/**
 * The generated block. Active and proposed anchors are listed separately:
 * a proposed anchor is not binding, and mixing them under one heading is
 * exactly what makes the distinction meaningless.
 */
export function registryBlock(anchors) {
  const byId = (a, b) => a.id.localeCompare(b.id);
  const active = anchors.filter((a) => a.status === 'ACTIVE').sort(byId);
  const proposed = anchors.filter((a) => a.status === 'PROPOSED').sort(byId);

  const parts = ['### Active', ''];
  parts.push(active.length ? table(active) : '_None yet._');

  if (proposed.length) {
    parts.push('', '### Proposed', '', '_Drafted, not yet approved. Not binding._', '');
    parts.push(table(proposed));
  }

  return parts.join('\n');
}

/**
 * Replace only the managed region, preserving every other byte of the file.
 *
 * The predecessor regenerated the whole index from a template, silently
 * destroying any goals the user had written. That is the bug this exists to
 * make structurally impossible.
 */
export function renderIndex(existing, anchors) {
  const block = registryBlock(anchors);

  if (existing === null || existing === undefined) {
    return SCAFFOLD.replace(`${START}\n${END}`, `${START}\n${block}\n${END}`);
  }

  const start = existing.indexOf(START);
  const end = existing.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `INDEX.md is missing the ${START} / ${END} markers; cairn will not guess where the registry belongs`,
    );
  }

  return existing.slice(0, start + START.length) + '\n' + block + '\n' + existing.slice(end);
}

export function readIndex(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
