import { execSync } from 'node:child_process';

export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LINES = 12;

/**
 * Run the shell checks attached to constraints.
 *
 * This is the only part of Cairn that executes anything, and the command comes
 * from a file in the repository being checked. Nothing here decides whether it
 * is allowed to run: the caller must have been told so from outside the
 * repository, because a repository that could grant itself permission would
 * make cloning one an act of trust.
 *
 * Only ACTIVE anchors are run. A proposed constraint has not been agreed to
 * yet and should not be able to fail anyone's build.
 */
export function runVerifications(anchors, root, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const results = [];

  for (const anchor of anchors) {
    if (!anchor.verify || anchor.status !== 'ACTIVE') continue;

    const started = Date.now();
    try {
      execSync(anchor.verify.command, {
        cwd: root,
        timeout,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      results.push({ anchor, ok: true, ms: Date.now() - started });
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`
        .split('\n')
        .filter(Boolean)
        .slice(0, MAX_OUTPUT_LINES)
        .join('\n');

      results.push({
        anchor,
        ok: false,
        ms: Date.now() - started,
        // A timeout kills the process, which surfaces as a signal rather than
        // an exit code; saying "failed" there would be misleading.
        timedOut: error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT',
        exitCode: typeof error.status === 'number' ? error.status : null,
        output,
      });
    }
  }

  return results;
}

export function countVerifiable(anchors) {
  return anchors.filter((a) => a.verify && a.status === 'ACTIVE').length;
}
