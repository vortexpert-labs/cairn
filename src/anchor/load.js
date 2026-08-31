import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './parse.js';
import { validate } from '../schema/validator.js';

export const ANCHOR_FILE = /^ANC-(\d{4})-([a-z0-9-]+)\.md$/;
export const CAIRN_DIR = '.cairn';

/**
 * Directory names conventionally holding sample or fixture projects.
 *
 * A project inside one of these is a separate project, so it may carry its own
 * anchors. The nested-directory check and the guard on `init` both consult
 * this, because two rules disagreeing about what counts as one project would
 * make one of them wrong.
 */
export const SEPARATE_PROJECT_DIRS = new Set(['examples', 'example', 'fixtures', 'testdata']);

/**
 * Fill in the values the format leaves implicit.
 *
 * Anything comparing two versions of an anchor must apply this to both sides,
 * or an absent optional field will look like a change when only the default
 * was being omitted.
 */
export function applyDefaults(data) {
  return {
    ...data,
    scope: data.scope || 'global',
    claims: data.claims || [],
    supersedes: data.supersedes || [],
    depends_on: data.depends_on || [],
    evidence: data.evidence || [],
    alternatives: data.alternatives || [],
  };
}

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
      ...applyDefaults(parsed.data),
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
    // Declined drafts no longer have a file, but their ids were still issued and
    // may have been quoted in a pull request or a commit message. Reusing one
    // would silently point an existing reference at a different anchor, so ids
    // are never handed out twice even when nothing on disk holds them.
    for (const entry of readDeclinedIds(dir)) {
      max = Math.max(max, entry);
    }
  }
  return `ANC-${String(max + 1).padStart(4, '0')}`;
}

function readDeclinedIds(dir) {
  const file = path.join(dir, 'declined.json');
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (parsed.declined ?? [])
      .map((entry) => /^ANC-(\d{4})/.exec(entry.id ?? '')?.[1])
      .filter(Boolean)
      .map((n) => parseInt(n, 10));
  } catch {
    return [];
  }
}
