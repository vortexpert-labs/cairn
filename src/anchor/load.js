import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './parse.js';
import { validate } from '../schema/validator.js';

export const ANCHOR_FILE = /^ANC-(\d{4})-([a-z0-9-]+)\.md$/;
export const CAIRN_DIR = '.cairn';

export function cairnDir(root = process.cwd()) {
  return path.join(root, CAIRN_DIR);
}

export function readSchema(dir) {
  const file = path.join(dir, 'schema.json');
  if (!fs.existsSync(file)) {
    throw new Error(`missing ${path.join(CAIRN_DIR, 'schema.json')}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Read every anchor in a directory.
 *
 * A file that cannot be parsed or does not validate is returned as a failure,
 * never skipped. In the predecessor tool an unreadable anchor was warned about
 * and dropped, so a governing constraint could disappear from the index while
 * the checker still exited 0. Callers are expected to treat failures as errors.
 *
 * @returns {{anchors: object[], failures: {file: string, message: string}[]}}
 */
export function loadAnchors(dir, schema) {
  const anchors = [];
  const failures = [];

  if (!fs.existsSync(dir)) return { anchors, failures };

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f.startsWith('ANC-')).sort();

  for (const file of files) {
    const match = ANCHOR_FILE.exec(file);
    if (!match) {
      failures.push({
        file,
        message: `filename must match ANC-NNNN-<slug>.md with a lowercase slug`,
      });
      continue;
    }

    let parsed;
    try {
      parsed = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (error) {
      failures.push({ file, message: error.message });
      continue;
    }

    const errors = schema ? validate(parsed.data, schema) : [];
    if (errors.length) {
      for (const e of errors) {
        failures.push({ file, message: `${e.path || '(root)'} ${e.message}` });
      }
      continue;
    }

    if (parsed.data.id !== `ANC-${match[1]}`) {
      failures.push({
        file,
        message: `frontmatter id ${parsed.data.id} does not match the filename`,
      });
      continue;
    }

    anchors.push({
      ...parsed.data,
      scope: parsed.data.scope || 'global',
      claims: parsed.data.claims || [],
      supersedes: parsed.data.supersedes || [],
      depends_on: parsed.data.depends_on || [],
      evidence: parsed.data.evidence || [],
      alternatives: parsed.data.alternatives || [],
      body: parsed.body,
      file,
      path: path.join(dir, file),
    });
  }

  return { anchors, failures };
}

/**
 * Next free id, derived from filenames rather than parsed anchors so that one
 * unreadable file cannot cause a duplicate id to be handed out.
 */
export function nextId(dir) {
  let max = 0;
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const match = /^ANC-(\d{4})/.exec(file);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
  }
  return `ANC-${String(max + 1).padStart(4, '0')}`;
}
