import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema } from '../anchor/load.js';
import { anchorsFor, normalise } from '../graph/scope.js';

/**
 * The endpoint an agent's hook system calls.
 *
 * Editors invoke this with a JSON event on stdin and expect JSON back, in a
 * shape that differs per platform. Its job is to answer one question — what
 * has this repository already settled about the thing you are touching — and
 * to stay quiet when the answer is nothing.
 *
 * It never executes verify commands. Injecting context is safe; running a
 * repository's shell commands because an editor opened a file is not, and
 * routing that through a hook would launder exactly the execution the
 * --allow-verify rule exists to prevent.
 */

const FORMATS = ['claude-code', 'cursor', 'text'];

/** Editors disagree about where the path lives; try the plausible spellings. */
function filePathFrom(event) {
  const candidates = [
    event?.tool_input?.file_path,
    event?.tool_input?.path,
    event?.tool_input?.filePath,
    event?.file_path,
    event?.path,
    event?.filePath,
    event?.arguments?.file_path,
  ];
  return candidates.find((value) => typeof value === 'string' && value.length > 0) || null;
}

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {}; // no stdin, or not JSON: answer for the whole project instead
  }
}

/**
 * @param {string|null} scope  a path, or null for the whole project
 *
 * Project-wide anchors are deliberately excluded when a scope is given. The
 * session hook has already supplied them; repeating them before every edit
 * would put the same paragraph in front of the model dozens of times a
 * session, which is how a context file stops being read.
 */
function orientation(dir, scope) {
  const schema = readSchema(dir);
  const { anchors } = loadAnchors(dir, schema);
  const selected = scope
    ? anchorsFor(anchors, normalise(scope), { statuses: ['ACTIVE'] }).filter(
        (a) => a.scope !== 'global',
      )
    : anchors.filter((a) => a.status === 'ACTIVE');

  if (selected.length === 0) return null;

  const lines = scope
    ? [`Anchors governing ${scope} in this repository. They are binding.`, '']
    : ['This repository records its settled decisions in .cairn/. These are binding.', ''];

  for (const anchor of selected) {
    lines.push(`${anchor.id} (${anchor.type}) ${anchor.title}`);
    for (const claim of anchor.claims) lines.push(`  - ${claim}`);
    for (const alternative of anchor.alternatives || []) {
      lines.push(`  - already ruled out: ${alternative.option} (${alternative.rejected_because})`);
    }
  }

  lines.push('', 'Run `cairn why <path>` for the reasoning behind any of these.');
  return lines.join('\n');
}

function emit(format, event, context) {
  if (context === null) {
    // Saying nothing is the correct answer when nothing is governed.
    console.log(format === 'text' ? '' : '{}');
    return 0;
  }

  if (format === 'claude-code') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event === 'session' ? 'SessionStart' : 'PreToolUse',
        additionalContext: context,
        ...(event === 'edit' ? { permissionDecision: 'allow' } : {}),
      },
    }));
    return 0;
  }

  if (format === 'cursor') {
    console.log(JSON.stringify({ additional_context: context }));
    return 0;
  }

  console.log(context);
  return 0;
}

export function hook({ dir, root, event, options }) {
  // A hook that crashes must not take the editor down with it, so every
  // failure here is an empty answer rather than a non-zero exit.
  if (!fs.existsSync(dir)) return emit(options.format, event, null);

  const format = options.format || 'text';
  if (!FORMATS.includes(format)) {
    console.error(`unknown --format '${format}'. Expected one of: ${FORMATS.join(', ')}`);
    return 2;
  }

  try {
    if (event === 'session') {
      return emit(format, event, orientation(dir, null));
    }
    if (event === 'edit') {
      const payload = readStdin();
      const target = filePathFrom(payload);
      if (!target) return emit(format, event, null);

      const absolute = path.resolve(root, target);
      const relative = normalise(
        absolute.startsWith(root) ? path.relative(root, absolute) : target,
      );
      return emit(format, event, orientation(dir, relative));
    }
    console.error(`unknown hook event '${event}'. Expected 'session' or 'edit'.`);
    return 2;
  } catch {
    return emit(format, event, null);
  }
}
