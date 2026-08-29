import { style } from './terminal.js';

// Wide enough that the longest value in each column still leaves a gap.
// `REJECTED_PATH` is 13 characters and `ANC-0000` is 8; both need slack.
const ID_WIDTH = 10;
const TYPE_WIDTH = 15;

const pad = (text, width) => String(text).padEnd(width);

function terminalWidth() {
  return Math.min(Math.max(process.stdout.columns || 100, 60), 110);
}

/** Wrap prose to the terminal, keeping the hanging indent of a detail line. */
export function wrap(text, indent) {
  const limit = terminalWidth() - indent.length;
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > limit) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l);
}

/** One anchor as a headline plus its claims and any qualifying detail. */
export function anchorLines(anchor, { showScope = true, indent = '  ' } = {}) {
  const lines = [];
  const scope = showScope && anchor.scope !== 'global' ? '  ' + style.dim(anchor.scope) : '';

  lines.push(
    `${indent}${style.bold(pad(anchor.id, ID_WIDTH))}${style.cyan(pad(anchor.type, TYPE_WIDTH))}` +
      `${anchor.title}${scope}`,
  );

  const detail = `${indent}${' '.repeat(ID_WIDTH)}`;
  for (const claim of anchor.claims || []) {
    lines.push(...wrap(claim, detail));
  }
  // The label is wrapped with the text so the first line respects the width too.
  const labelled = (label, text) => {
    const lines = wrap(`${label} ${text}`, detail);
    lines[0] = lines[0].replace(label, style.dim(label));
    return lines;
  };

  for (const alternative of anchor.alternatives || []) {
    lines.push(...labelled('ruled out:', `${alternative.option} — ${alternative.rejected_because}`));
  }
  if (anchor.revisit_if) {
    lines.push(...labelled('revisit if:', anchor.revisit_if));
  }
  if (anchor.superseded_by) {
    lines.push(`${detail}${style.dim('superseded by')} ${anchor.superseded_by}`);
  }
  if (anchor.supersedes?.length) {
    lines.push(`${detail}${style.dim('supersedes')} ${anchor.supersedes.join(', ')}`);
  }

  return lines;
}

export function statusTag(status) {
  if (status === 'ACTIVE') return style.green(status);
  if (status === 'PROPOSED') return style.yellow(status);
  return style.dim(status);
}

export { ID_WIDTH, TYPE_WIDTH };
