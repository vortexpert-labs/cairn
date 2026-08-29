import { execFileSync } from 'node:child_process';
import { scopePrefix } from './scope.js';

/**
 * How much a scope has changed since its anchor was written.
 *
 * Staleness is the failure mode that killed decision records: nobody notices
 * the document stopped matching the code. Git already knows, so this asks it
 * rather than asking a person to remember.
 */
export function churnSince(root, scope, since) {
  const pathspec = scopePrefix(scope);
  if (!pathspec || !since) return null;

  try {
    const output = execFileSync(
      'git',
      ['log', '--oneline', `--since=${since}`, '--', pathspec],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString().trim();
    return { path: pathspec, commits: output === '' ? 0 : output.split('\n').length };
  } catch {
    return null; // not a git repository, or the path has never existed
  }
}
