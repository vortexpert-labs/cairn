import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the installed package, used to find the schema we ship. */
export const packageRoot = path.resolve(here, '..');

export function bundledSchemaPath() {
  return path.join(packageRoot, '.cairn', 'schema.json');
}

/** Nearest ancestor containing .git, else the starting directory. */
export function repoRoot(from = process.cwd()) {
  let dir = path.resolve(from);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(from);
    dir = parent;
  }
}
