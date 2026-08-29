/**
 * The conformance checks from SPECIFICATION.md.
 *
 * Numbering follows the spec's Conformance section so that a reported problem
 * can be traced back to the requirement that motivates it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from './anchor/parse.js';
import { referenceErrors, cycles, suspects } from './graph/dag.js';
import { CAIRN_DIR } from './anchor/load.js';

export const SUPPORTED_FORMAT_VERSION = '1.0';

const IMMUTABLE = ['claims', 'rationale', 'created_at'];

const NOISE = [
  /\btoday we\b/i,
  /\bsession (log|transcript)\b/i,
  /^\s*(human|assistant|user):/im,
  /Traceback \(most recent call last\)/,
  /^\s*at [\w$.<>]+ \(.*:\d+:\d+\)$/m,
];

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '.next']);

/** 5b — a repository has one .cairn/, at the root. */
function nestedDirs(root) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === CAIRN_DIR) {
        if (path.resolve(full) !== path.resolve(root, CAIRN_DIR)) {
          found.push(path.relative(root, full));
        }
        continue;
      }
      walk(full, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/** 12b — immutable fields of an anchor that was ACTIVE in HEAD must not change. */
function immutabilityErrors(anchors, root) {
  const errors = [];

  let tracked = true;
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, stdio: 'pipe' });
  } catch {
    tracked = false; // no commits yet, or not a git repo — nothing to compare against
  }
  if (!tracked) return errors;

  for (const anchor of anchors) {
    const rel = path.relative(root, anchor.path).split(path.sep).join('/');
    let previous;
    try {
      previous = execFileSync('git', ['show', `HEAD:${rel}`], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString();
    } catch {
      continue; // new file, not yet committed
    }

    let old;
    try {
      old = parseFrontmatter(previous).data;
    } catch {
      continue; // the committed version was unparseable; nothing meaningful to compare
    }
    if (old.status !== 'ACTIVE') continue;

    for (const field of IMMUTABLE) {
      const before = JSON.stringify(old[field] ?? null);
      const after = JSON.stringify(anchor[field] ?? null);
      if (before !== after) {
        errors.push({
          file: anchor.file,
          message:
            `${field} changed on an anchor that is ACTIVE in HEAD. ` +
            `Record the change by superseding it with a new anchor instead of editing this one.`,
        });
      }
    }
  }

  return errors;
}

/**
 * @returns {{errors: object[], warnings: object[], suspect: Map<string,string>}}
 */
export function runChecks({ anchors, failures, schema, dir, root, indexPath }) {
  const errors = [];
  const warnings = [];

  // 1-5 — parsing, naming, identity and schema, surfaced by the loader.
  for (const failure of failures) {
    errors.push({ file: failure.file, message: failure.message });
  }

  // 14b — an unrecognised format version is fatal, never a best-effort parse.
  const version = schema?.cairnFormatVersion;
  if (version !== SUPPORTED_FORMAT_VERSION) {
    errors.push({
      file: 'schema.json',
      message:
        `format version ${version ?? '(absent)'} is not supported by this version of cairn ` +
        `(expects ${SUPPORTED_FORMAT_VERSION}). Run 'cairn migrate'.`,
    });
  }

  // 3 — ids are unique.
  const seen = new Map();
  for (const anchor of anchors) {
    if (seen.has(anchor.id)) {
      errors.push({
        file: anchor.file,
        message: `duplicate id ${anchor.id}, already used by ${seen.get(anchor.id)}`,
      });
    }
    seen.set(anchor.id, anchor.file);
  }

  // 5b — no nested .cairn/ directories.
  for (const nested of nestedDirs(root)) {
    errors.push({
      file: nested,
      message: `nested ${CAIRN_DIR}/ directory; anchors live in one directory at the repository root`,
    });
  }

  // 7 — at most one ACTIVE STAGE.
  const stages = anchors.filter((a) => a.type === 'STAGE' && a.status === 'ACTIVE');
  if (stages.length > 1) {
    errors.push({
      file: stages.map((s) => s.file).join(', '),
      message: `${stages.length} ACTIVE STAGE anchors; a project is in one stage at a time`,
    });
  }

  // 8 — SUPERSEDED requires superseded_by.
  for (const anchor of anchors) {
    if (anchor.status === 'SUPERSEDED' && !anchor.superseded_by) {
      errors.push({
        file: anchor.file,
        message: `status is SUPERSEDED but superseded_by is not set`,
      });
    }
  }

  // 9 — references resolve.
  for (const error of referenceErrors(anchors)) {
    errors.push({ file: error.file, message: error.message });
  }

  // 10 — the dependency graph is acyclic.
  for (const cycle of cycles(anchors)) {
    errors.push({ file: '(graph)', message: `dependency cycle: ${cycle.join(' -> ')}` });
  }

  // 11 — verify is a CONSTRAINT-only field.
  for (const anchor of anchors) {
    if (anchor.verify && anchor.type !== 'CONSTRAINT') {
      errors.push({
        file: anchor.file,
        message: `verify is only permitted on CONSTRAINT anchors, not ${anchor.type}`,
      });
    }
  }

  // 12b — immutability of ACTIVE anchors.
  errors.push(...immutabilityErrors(anchors, root));

  // 12 — suspect anchors resting on an invalidated ancestor.
  const suspect = suspects(anchors);
  for (const [id, ancestor] of suspect) {
    const anchor = anchors.find((a) => a.id === id);
    warnings.push({
      file: anchor.file,
      message: `depends on ${ancestor}, which is INVALIDATED; review whether this still holds`,
    });
  }

  // 16 — a DECISION with no recorded fork cannot be reopened later.
  for (const anchor of anchors) {
    if (anchor.type === 'DECISION' && !anchor.alternatives?.length) {
      warnings.push({
        file: anchor.file,
        message: `DECISION has no alternatives; nothing is recorded to reconsider if it is revisited`,
      });
    }
  }

  // 17 — text that looks like a session log.
  for (const anchor of anchors) {
    const text = `${anchor.rationale}\n${anchor.body || ''}`;
    if (NOISE.some((pattern) => pattern.test(text))) {
      warnings.push({
        file: anchor.file,
        message: `reads like a session log or stack trace; anchors record what was settled, not what happened`,
      });
    }
  }

  // 13 — the index must carry the markers the generator writes between.
  if (indexPath && fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    if (!content.includes('<!-- CAIRN-REGISTRY: START -->')) {
      errors.push({
        file: 'INDEX.md',
        message: `missing the CAIRN-REGISTRY markers; run 'cairn index --write'`,
      });
    }
  } else if (indexPath) {
    errors.push({ file: 'INDEX.md', message: `missing; run 'cairn init' or 'cairn index --write'` });
  }

  return { errors, warnings, suspect };
}
