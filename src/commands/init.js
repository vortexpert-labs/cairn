import fs from 'node:fs';
import path from 'node:path';
import { CAIRN_DIR, SEPARATE_PROJECT_DIRS } from '../anchor/load.js';
import { bundledSchemaPath } from '../paths.js';
import { serializeAnchor } from '../anchor/serialize.js';
import { renderIndex } from '../render/index.js';
import { style, symbol } from '../render/terminal.js';

const STAGES = ['PROTOTYPE', 'ALPHA', 'BETA', 'PRODUCTION', 'MAINTENANCE'];

/** An ancestor already holding `.cairn/` means this would be a nested set. */
function enclosingProject(from) {
  let dir = path.resolve(from);
  while (true) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    // Crossing into examples/ or fixtures/ means this is a separate project.
    if (SEPARATE_PROJECT_DIRS.has(path.basename(dir))) return null;
    if (fs.existsSync(path.join(parent, CAIRN_DIR))) return parent;
    dir = parent;
  }
}

export function init({ root, stage = 'PROTOTYPE' }) {
  const enclosing = enclosingProject(root);
  if (enclosing) {
    console.error(
      `${path.relative(root, enclosing) || enclosing} already has a ${CAIRN_DIR}/ directory.\n` +
        `Anchors live in one directory at the project root; use the scope field to ` +
        `distinguish areas within it.`,
    );
    return 2;
  }

  const chosen = String(stage).toUpperCase();
  if (!STAGES.includes(chosen)) {
    console.error(`unknown stage '${stage}'. Expected one of: ${STAGES.join(', ')}`);
    return 2;
  }

  const dir = path.join(root, CAIRN_DIR);
  const created = [];

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const schemaFile = path.join(dir, 'schema.json');
  if (!fs.existsSync(schemaFile)) {
    fs.copyFileSync(bundledSchemaPath(), schemaFile);
    created.push(`${CAIRN_DIR}/schema.json`);
  }

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const genesisFile = path.join(dir, 'ANC-0001-project-stage.md');
  const anchors = [];
  const genesis = {
    id: 'ANC-0001',
    title: `Project stage: ${chosen}`,
    type: 'STAGE',
    status: 'ACTIVE',
    created_at: now,
    scope: 'global',
    claims: [`The project is in the ${chosen} stage.`],
    rationale:
      `Recorded so that people and coding agents can tell which trade-offs are currently ` +
      `acceptable. What counts as acceptable in ${chosen} would not be acceptable later, ` +
      `and the reverse. Supersede this anchor when the stage changes.`,
    body: '',
  };

  if (!fs.existsSync(genesisFile)) {
    fs.writeFileSync(genesisFile, serializeAnchor(genesis), 'utf8');
    created.push(`${CAIRN_DIR}/ANC-0001-project-stage.md`);
  }
  anchors.push({ ...genesis, file: 'ANC-0001-project-stage.md' });

  const indexFile = path.join(dir, 'INDEX.md');
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, renderIndex(null, anchors).replace('`PROTOTYPE`', `\`${chosen}\``), 'utf8');
    created.push(`${CAIRN_DIR}/INDEX.md`);
  }

  if (created.length === 0) {
    console.log(`${CAIRN_DIR}/ already exists. Nothing to do.`);
    return 0;
  }

  for (const file of created) console.log(`${style.green(symbol.ok)} ${file}`);
  console.log(`\nNext: describe what this project is trying to do in ${CAIRN_DIR}/INDEX.md,`);
  console.log(`then record your first constraint with ${style.bold('cairn new')}.`);
  return 0;
}
