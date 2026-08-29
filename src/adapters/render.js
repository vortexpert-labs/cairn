import { BLOCK_START, BLOCK_END } from './platforms.js';

/**
 * The instructions every agent gets.
 *
 * Deliberately one file per platform rather than one per governed scope.
 * Several platforms can auto-attach a rule by glob, which would give finer
 * disclosure, but it also means a file per scope per platform — and
 * developers already complain about the number of config files in a
 * repository root. Retrieval is the tool's job: the rule tells the agent
 * which command to run.
 */
export function coreInstructions() {
  return `## Project orientation

This repository records its settled decisions and constraints in \`.cairn/\`.
They apply to you.

Before editing files in an area you have not touched yet, run:

    cairn why <path>

It prints the constraints, decisions and abandoned approaches governing that
path, and the reasoning behind each. \`cairn context --scope <path>\` returns
the same as plain Markdown.

While you work:

- Obey every ACTIVE constraint. If a request conflicts with one, say so and
  ask which should give way. Do not quietly work around it.
- Never re-propose anything recorded as a REJECTED_PATH. It was tried and
  abandoned, and the anchor says why.
- A DECISION records what it ruled out. Run \`cairn show <id>\` before
  reopening one, so you argue with the actual reasoning.
- Code is authoritative about what the software does. Where an anchor
  contradicts working code, the anchor is stale — say so rather than changing
  the code to match it.

When something consequential is settled — an architectural decision, a new
constraint, or an approach that was tried and failed — record it:

    cairn new --title "..." --type DECISION \\
      --claim "..." --rationale "..." \\
      --alternative "what you rejected :: why"

Anchors are drafted as PROPOSED. A person promotes them to ACTIVE in review.

Do not write session notes, stack traces, task lists or narrative summaries
into \`.cairn/\`. It holds what was settled, not what happened.`;
}

/** The full text Cairn owns for a platform. */
export function renderAdapter(platform) {
  const body = coreInstructions();

  if (platform.mode === 'block') {
    return `${BLOCK_START}\n${body}\n${BLOCK_END}`;
  }

  const parts = [];
  if (platform.frontmatter) {
    parts.push('---', ...platform.frontmatter, '---', '');
  }
  parts.push(body, '');
  return parts.join('\n');
}

/**
 * Insert or replace the managed region in a file the user also writes in.
 * Everything outside the markers is left exactly as it was.
 */
export function injectBlock(existing, block) {
  if (existing === null || existing === undefined || existing.trim() === '') {
    return `${block}\n`;
  }

  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);

  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
  }
  if (start !== -1 || end !== -1) {
    throw new Error(`only one of ${BLOCK_START} / ${BLOCK_END} is present; refusing to guess`);
  }

  return `${existing.replace(/\s*$/, '')}\n\n${block}\n`;
}

export function extractBlock(existing) {
  if (!existing) return null;
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;
  return existing.slice(start, end + BLOCK_END.length);
}

/** Remove the managed region, leaving the user's own content untouched. */
export function removeBlock(existing) {
  const block = extractBlock(existing);
  if (!block) return existing;
  return existing.replace(block, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '');
}
