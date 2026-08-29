/**
 * Mermaid rendering of the anchor graph.
 *
 * GitHub renders mermaid natively inside Markdown, so this produces a diagram
 * that stays current in a README with no build step, no JavaScript and no
 * dependency. It is text.
 */

const CLASSES = {
  ACTIVE: 'active',
  PROPOSED: 'proposed',
  SUPERSEDED: 'closed',
  INVALIDATED: 'closed',
  RETIRED: 'closed',
};

const nodeId = (id) => id.replace(/-/g, '');

function label(anchor) {
  // Quotes and brackets would end the label early; Mermaid takes HTML entities.
  const title = String(anchor.title)
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;');
  return `${anchor.id}<br/>${title}`;
}

export function toMermaid(anchors, { direction = 'TD' } = {}) {
  if (anchors.length === 0) return 'graph TD\n  empty["No anchors yet"]\n';

  const known = new Set(anchors.map((a) => a.id));
  const lines = [`graph ${direction}`];

  for (const anchor of anchors) {
    lines.push(`  ${nodeId(anchor.id)}["${label(anchor)}"]`);
  }

  for (const anchor of anchors) {
    for (const dep of anchor.depends_on || []) {
      if (known.has(dep)) lines.push(`  ${nodeId(dep)} --> ${nodeId(anchor.id)}`);
    }
    if (anchor.superseded_by && known.has(anchor.superseded_by)) {
      lines.push(`  ${nodeId(anchor.id)} -.->|superseded by| ${nodeId(anchor.superseded_by)}`);
    }
  }

  // Muted, readable in both GitHub themes.
  lines.push('  classDef active fill:#dcfce7,stroke:#16a34a,color:#14532d;');
  lines.push('  classDef proposed fill:#fef9c3,stroke:#ca8a04,color:#713f12,stroke-dasharray:4 3;');
  lines.push('  classDef closed fill:#f1f5f9,stroke:#94a3b8,color:#475569;');

  for (const [status, className] of Object.entries(CLASSES)) {
    const members = anchors.filter((a) => a.status === status).map((a) => nodeId(a.id));
    if (members.length) lines.push(`  class ${members.join(',')} ${className};`);
  }

  return lines.join('\n') + '\n';
}
