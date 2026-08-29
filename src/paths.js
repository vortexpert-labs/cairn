import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the installed package, used to find the schema we ship. */
export const packageRoot = path.resolve(here, '..');

export function bundledSchemaPath() {
  return path.join(packageRoot, '.cairn', 'schema.json');
}

/**
 * The project root: the nearest ancestor holding a `.cairn/` directory, or
 * failing that the nearest holding `.git`.
 *
 * `.cairn/` wins because it marks the project a set of anchors belongs to.
 * Looking only for `.git` means a sample project bundled inside a repository
 * resolves to the outer repository and reports the wrong anchors entirely.
 */
export function repoRoot(from = process.cwd()) {
  let dir = path.resolve(from);
  let gitRoot = null;

  while (true) {
    if (fs.existsSync(path.join(dir, '.cairn'))) return dir;
    if (gitRoot === null && fs.existsSync(path.join(dir, '.git'))) gitRoot = dir;

    const parent = path.dirname(dir);
    if (parent === dir) return gitRoot ?? path.resolve(from);
    dir = parent;
  }
}
