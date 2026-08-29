/**
 * Render an anchor back to Markdown.
 *
 * Field order is fixed so that a status change produces a one-line diff rather
 * than a reshuffled file: identity, then lifecycle, then relations, then content.
 */

const WRAP = 92;

function quote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Fold prose to a width so `git diff` stays readable; `parse` folds it back. */
function foldBlock(text, indent = '  ') {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > WRAP - indent.length) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join('\n');
}

export function serializeAnchor(anchor) {
  const out = ['---'];

  out.push(`id: ${anchor.id}`);
  out.push(`title: ${quote(anchor.title)}`);
  out.push(`type: ${anchor.type}`);
  out.push(`status: ${anchor.status}`);
  out.push(`created_at: ${anchor.created_at}`);
  if (anchor.updated_at) out.push(`updated_at: ${anchor.updated_at}`);
  if (anchor.scope && anchor.scope !== 'global') out.push(`scope: ${quote(anchor.scope)}`);

  if (anchor.supersedes?.length) {
    out.push(`supersedes: [${anchor.supersedes.map(quote).join(', ')}]`);
  }
  if (anchor.superseded_by) out.push(`superseded_by: ${anchor.superseded_by}`);
  if (anchor.invalidated_by) out.push(`invalidated_by: ${anchor.invalidated_by}`);
  if (anchor.depends_on?.length) {
    out.push(`depends_on: [${anchor.depends_on.map(quote).join(', ')}]`);
  }

  out.push('claims:');
  for (const claim of anchor.claims) out.push(`  - ${quote(claim)}`);

  out.push('rationale: >');
  out.push(foldBlock(anchor.rationale));

  if (anchor.alternatives?.length) {
    out.push('alternatives:');
    for (const alt of anchor.alternatives) {
      out.push(`  - option: ${quote(alt.option)}`);
      out.push(`    rejected_because: ${quote(alt.rejected_because)}`);
    }
  }

  if (anchor.revisit_if) out.push(`revisit_if: ${quote(anchor.revisit_if)}`);

  if (anchor.verify) {
    out.push('verify:');
    out.push(`  command: ${quote(anchor.verify.command)}`);
    if (anchor.verify.description) {
      out.push(`  description: ${quote(anchor.verify.description)}`);
    }
  }

  if (anchor.evidence?.length) {
    out.push('evidence:');
    for (const item of anchor.evidence) out.push(`  - ${quote(item)}`);
  }

  out.push('---');

  const body = (anchor.body || '').trim();
  return out.join('\n') + (body ? `\n\n${body}\n` : '\n');
}

export function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/, '') || 'anchor'
  );
}
