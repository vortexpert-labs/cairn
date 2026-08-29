import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { renderIndex, readIndex } from '../render/index.js';
import { style, symbol } from '../render/terminal.js';

export function indexCommand({ dir, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }

  const schema = readSchema(dir);
  const { anchors, failures } = loadAnchors(dir, schema);

  if (failures.length) {
    console.error(`${style.red(symbol.error)} refusing to touch INDEX.md while anchors are unreadable:`);
    for (const failure of failures) console.error(`  ${failure.file}  ${failure.message}`);
    return 1;
  }

  const indexPath = path.join(dir, 'INDEX.md');
  const existing = readIndex(indexPath);
  let expected;
  try {
    expected = renderIndex(existing, anchors);
  } catch (error) {
    console.error(`${style.red(symbol.error)} ${error.message}`);
    return 1;
  }

  if (options.write) {
    fs.writeFileSync(indexPath, expected, 'utf8');
    console.log(`${style.green(symbol.ok)} INDEX.md updated (${anchors.length} anchors)`);
    return 0;
  }

  const normalise = (s) => (s ?? '').replace(/\r\n/g, '\n').trimEnd();
  if (normalise(existing) !== normalise(expected)) {
    console.error(`${style.red(symbol.error)} INDEX.md is out of date. Run 'cairn index --write'.`);
    return 1;
  }

  console.log(`${style.green(symbol.ok)} INDEX.md matches the anchors on disk.`);
  return 0;
}
