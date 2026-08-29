import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, CAIRN_DIR } from '../anchor/load.js';
import { SUPPORTED_FORMAT_VERSION } from '../checks.js';
import { style, symbol } from '../render/terminal.js';

/** Reports on the setup itself rather than on anchor content. */
export function doctor({ dir, root }) {
  const notes = [];
  const add = (ok, message, hint) => notes.push({ ok, message, hint });

  const inGit = fs.existsSync(path.join(root, '.git'));
  add(inGit, inGit ? 'inside a git repository' : 'not a git repository',
    inGit ? null : 'anchors are meant to be versioned and reviewed; run git init');

  const legacy = fs.existsSync(path.join(root, '.anchors'));
  if (legacy) add(false, 'found a legacy .anchors/ directory', "run 'cairn migrate'");

  const hasDir = fs.existsSync(dir);
  add(hasDir, hasDir ? `${CAIRN_DIR}/ present` : `${CAIRN_DIR}/ missing`,
    hasDir ? null : "run 'cairn init'");
  if (!hasDir) return report(notes);

  const schemaFile = path.join(dir, 'schema.json');
  let schema = null;
  if (!fs.existsSync(schemaFile)) {
    add(false, 'schema.json missing', "run 'cairn init' to restore it");
  } else {
    try {
      schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
      const version = schema.cairnFormatVersion;
      add(version === SUPPORTED_FORMAT_VERSION,
        `schema format version ${version ?? '(absent)'}`,
        version === SUPPORTED_FORMAT_VERSION ? null : `this cairn expects ${SUPPORTED_FORMAT_VERSION}; run 'cairn migrate'`);
    } catch (error) {
      add(false, `schema.json is not valid JSON: ${error.message}`, null);
    }
  }

  const indexFile = path.join(dir, 'INDEX.md');
  if (!fs.existsSync(indexFile)) {
    add(false, 'INDEX.md missing', "run 'cairn index --write'");
  } else {
    const content = fs.readFileSync(indexFile, 'utf8');
    const hasMarkers = content.includes('<!-- CAIRN-REGISTRY: START -->');
    add(hasMarkers, hasMarkers ? 'INDEX.md has the registry markers' : 'INDEX.md is missing the registry markers',
      hasMarkers ? null : 'add the CAIRN-REGISTRY START/END markers where the table belongs');
  }

  if (schema) {
    const { anchors, failures } = loadAnchors(dir, schema);
    add(failures.length === 0,
      `${anchors.length} anchors readable, ${failures.length} unreadable`,
      failures.length ? "run 'cairn check' for detail" : null);

    const verifying = anchors.filter((a) => a.verify).length;
    if (verifying) {
      add(true, `${verifying} anchor(s) carry a verify command`,
        'this version records verify commands but does not execute them');
    }
  }

  return report(notes);
}

function report(notes) {
  for (const note of notes) {
    const mark = note.ok ? style.green(symbol.ok) : style.red(symbol.error);
    console.log(`${mark} ${note.message}`);
    if (note.hint) console.log(`  ${style.dim(symbol.arrow + ' ' + note.hint)}`);
  }
  const bad = notes.filter((n) => !n.ok).length;
  console.log('');
  if (bad === 0) {
    console.log(`${style.green('Setup looks healthy.')}`);
    return 0;
  }
  console.log(`${style.yellow(`${bad} thing(s) need attention.`)}`);
  return 1;
}
