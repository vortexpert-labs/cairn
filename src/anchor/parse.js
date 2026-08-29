/**
 * Parser for the small YAML subset Cairn frontmatter is allowed to use.
 *
 * This is not a YAML parser and does not try to be. It accepts exactly the
 * constructs the anchor format needs and raises a descriptive error on
 * anything else. That is a deliberate trade: full YAML carries well-known
 * ambiguities, and a format meant to be read by both people and tools is
 * better off being predictable than being expressive.
 *
 * Supported:
 *   key: scalar                  (bare, 'single' or "double" quoted)
 *   key: []                      (empty inline list)
 *   key: >                       (folded block; continuation lines indented)
 *   key: |                       (literal block; newlines preserved)
 *   key:                         followed by an indented list of scalars
 *   key:                         followed by an indented list of objects
 *   key:                         followed by an indented mapping
 *   # comments and blank lines
 */

export class FrontmatterError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = 'FrontmatterError';
    this.line = line;
  }
}

const KEY = /^([A-Za-z_][A-Za-z0-9_]*):(?:[ \t]+(.*))?$/;

/** Count the backslashes immediately before a position. */
function precedingEscapes(text, index) {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) count++;
  return count;
}

function unquote(raw) {
  const value = raw.trim();
  if (value.length < 2) return value;

  const first = value[0];
  const last = value[value.length - 1];

  // A trailing backslash-escaped quote does not close the string.
  if (first === '"' && last === '"' && precedingEscapes(value, value.length - 1) % 2 === 0) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (first === "'" && last === "'") {
    return value.slice(1, -1).replace(/''/g, "'"); // YAML doubles a literal single quote
  }
  return value;
}

function scan(text) {
  return text.split(/\r?\n/).map((raw, i) => {
    const content = raw.trim();
    return {
      no: i + 1,
      indent: raw.length - raw.trimStart().length,
      content,
      raw,
      blank: content === '' || content.startsWith('#'),
    };
  });
}

function nextMeaningful(lines, from) {
  for (let i = from; i < lines.length; i++) {
    if (!lines[i].blank) return lines[i];
  }
  return null;
}

/** Collect an indented block scalar; `fold` joins lines with spaces. */
function readBlock(lines, start, parentIndent, fold) {
  const parts = [];
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.blank) {
      if (nextMeaningful(lines, i + 1)?.indent > parentIndent) parts.push('');
      continue;
    }
    if (line.indent <= parentIndent) break;
    parts.push(line.content);
  }
  const value = fold ? parts.join(' ').replace(/\s+/g, ' ').trim() : parts.join('\n');
  return { value, next: i };
}

function readMapping(lines, start, indent) {
  const result = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.blank) { i++; continue; }
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new FrontmatterError(`unexpected indentation`, line.no);
    }

    const match = KEY.exec(line.content);
    if (!match) {
      throw new FrontmatterError(`expected 'key: value', got '${line.content}'`, line.no);
    }
    const [, key, rawValue] = match;
    const value = rawValue === undefined ? '' : rawValue.trim();
    i++;

    if (value === '>' || value === '|') {
      const block = readBlock(lines, i, indent, value === '>');
      result[key] = block.value;
      i = block.next;
      continue;
    }

    if (value === '[]') { result[key] = []; continue; }

    if (value !== '') {
      if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim();
        result[key] = inner === '' ? [] : inner.split(',').map(unquote).filter((s) => s !== '');
      } else {
        result[key] = unquote(value);
      }
      continue;
    }

    // Bare `key:` — the value is whatever is indented beneath it.
    const child = nextMeaningful(lines, i);
    if (!child || child.indent <= indent) { result[key] = ''; continue; }

    if (child.content.startsWith('- ') || child.content === '-') {
      const seq = readSequence(lines, i, child.indent);
      result[key] = seq.value;
      i = seq.next;
    } else {
      const map = readMapping(lines, i, child.indent);
      result[key] = map.value;
      i = map.next;
    }
  }

  return { value: result, next: i };
}

function readSequence(lines, start, indent) {
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.blank) { i++; continue; }
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new FrontmatterError(`unexpected indentation in list`, line.no);
    }
    if (!line.content.startsWith('- ') && line.content !== '-') break;

    const rest = line.content === '-' ? '' : line.content.slice(2).trim();
    i++;

    // `- key: value` starts an object whose remaining keys are indented further.
    if (rest !== '' && KEY.test(rest)) {
      const [, key, rawValue] = KEY.exec(rest);
      const obj = { [key]: rawValue === undefined ? '' : unquote(rawValue) };
      const child = nextMeaningful(lines, i);
      if (child && child.indent > indent) {
        const map = readMapping(lines, i, child.indent);
        Object.assign(obj, map.value);
        i = map.next;
      }
      items.push(obj);
      continue;
    }

    if (rest === '') {
      throw new FrontmatterError('list item has no value', line.no);
    }
    items.push(unquote(rest));
  }

  return { value: items, next: i };
}

/**
 * Split a document into frontmatter and body, then parse the frontmatter.
 *
 * Delimiters must be a line that is exactly `---`, which is why this does not
 * use a naive split: a `---` inside a value or a horizontal rule in the body
 * would break that, and did in the predecessor implementation.
 *
 * @throws {FrontmatterError}
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);

  if (lines[0]?.trim() !== '---') {
    throw new FrontmatterError("document does not begin with '---'");
  }

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { close = i; break; }
  }
  if (close === -1) {
    throw new FrontmatterError("frontmatter is never closed with '---'");
  }

  const scanned = scan(lines.slice(1, close).join('\n'));
  const { value: data } = readMapping(scanned, 0, 0);
  const body = lines.slice(close + 1).join('\n').trim();

  return { data, body };
}
