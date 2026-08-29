import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '../anchor/parse.js';
import { serializeAnchor } from '../anchor/serialize.js';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { renderIndex, readIndex } from '../render/index.js';
import { bundledSchemaPath } from '../paths.js';
import { style, symbol } from '../render/terminal.js';

const LEGACY_DIR = '.anchors';

// Renames between anchor-protocol v1 and cairn 1.0.
const TYPE_RENAMES = { BOUNDARY: 'CONSTRAINT', DISCOVERY: 'FINDING', REJECTED_PATH: 'REJECTED_PATH' };
const DROPPED_FIELDS = ['authority'];

export function migrate({ root, options }) {
  const legacy = path.join(root, LEGACY_DIR);
  const target = path.join(root, CAIRN_DIR);

  if (!fs.existsSync(legacy)) {
    console.error(`no ${LEGACY_DIR}/ directory found; nothing to migrate.`);
    return 3;
  }
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    console.error(`${CAIRN_DIR}/ already exists and is not empty; refusing to overwrite it.`);
    return 1;
  }

  const plan = [];
  for (const file of fs.readdirSync(legacy)) {
    if (!/^ANC-\d{4}.*\.md$/.test(file)) continue;
    const raw = fs.readFileSync(path.join(legacy, file), 'utf8');
    let parsed;
    try {
      parsed = parseFrontmatter(raw);
    } catch (error) {
      console.error(`${style.red(symbol.error)} ${file}: ${error.message}`);
      return 1;
    }

    const data = { ...parsed.data };
    const changes = [];

    for (const field of DROPPED_FIELDS) {
      if (data[field] !== undefined) {
        delete data[field];
        changes.push(`dropped ${field}`);
      }
    }
    if (TYPE_RENAMES[data.type] && TYPE_RENAMES[data.type] !== data.type) {
      changes.push(`type ${data.type} -> ${TYPE_RENAMES[data.type]}`);
      data.type = TYPE_RENAMES[data.type];
    }

    plan.push({
      file,
      changes,
      anchor: {
        ...data,
        scope: data.scope || 'global',
        claims: data.claims || [],
        supersedes: data.supersedes || [],
        depends_on: data.depends_on || [],
        evidence: data.evidence || [],
        body: parsed.body,
      },
    });
  }

  if (options.dryRun) {
    console.log(`${style.bold('Would migrate')} ${plan.length} anchors from ${LEGACY_DIR}/ to ${CAIRN_DIR}/:\n`);
    for (const item of plan) {
      const detail = item.changes.length ? ` ${style.dim('(' + item.changes.join(', ') + ')')}` : '';
      console.log(`  ${item.file}${detail}`);
    }
    console.log(`\nRun without --dry-run to apply.`);
    return 0;
  }

  fs.mkdirSync(target, { recursive: true });
  for (const item of plan) {
    fs.writeFileSync(path.join(target, item.file), serializeAnchor(item.anchor), 'utf8');
  }
  fs.copyFileSync(bundledSchemaPath(), path.join(target, 'schema.json'));

  // Carry the human-written part of the old index across, if it had one.
  const legacyIndex = path.join(legacy, 'INDEX.md');
  const targetIndex = path.join(target, 'INDEX.md');
  if (fs.existsSync(legacyIndex)) {
    const old = fs.readFileSync(legacyIndex, 'utf8');
    const head = old.split(/^##\s+Active Anchor Registry/m)[0].trimEnd();
    fs.writeFileSync(
      targetIndex,
      `${head}\n\n## Anchors\n\n<!-- CAIRN-REGISTRY: START -->\n<!-- CAIRN-REGISTRY: END -->\n`,
      'utf8',
    );
  }

  const schema = readSchema(target);
  const { anchors } = loadAnchors(target, schema);
  fs.writeFileSync(targetIndex, renderIndex(readIndex(targetIndex), anchors), 'utf8');

  // Remove the old directory through git when possible so the move is one rename in history.
  try {
    execFileSync('git', ['rm', '-r', '-q', '--', LEGACY_DIR], { cwd: root, stdio: 'pipe' });
  } catch {
    fs.rmSync(legacy, { recursive: true, force: true });
  }

  console.log(`${style.green(symbol.ok)} migrated ${plan.length} anchors to ${CAIRN_DIR}/`);
  const touched = plan.filter((p) => p.changes.length);
  for (const item of touched) {
    console.log(`  ${item.file} ${style.dim('(' + item.changes.join(', ') + ')')}`);
  }
  console.log(`\n${style.dim("Review the result, then run 'cairn check'.")}`);
  return 0;
}
