import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, readSchema, CAIRN_DIR } from '../anchor/load.js';
import { runChecks } from '../checks.js';
import { renderIndex, readIndex } from '../render/index.js';
import { style, symbol } from '../render/terminal.js';

/**
 * Exit codes are part of the interface and are documented in the README:
 *   0 clean · 1 problems found · 2 usage error · 3 nothing to check
 */
export function check({ dir, root, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no ${CAIRN_DIR}/ directory here. Run 'cairn init' first.`);
    return 3;
  }

  let schema;
  try {
    schema = readSchema(dir);
  } catch (error) {
    console.error(`${style.red(symbol.error)} ${error.message}`);
    return 1;
  }

  const indexPath = path.join(dir, 'INDEX.md');
  const { anchors, failures } = loadAnchors(dir, schema);
  const { errors, warnings } = runChecks({ anchors, failures, schema, dir, root, indexPath });

  // The index must also actually match the anchors on disk.
  const existing = readIndex(indexPath);
  if (existing !== null && existing.includes('<!-- CAIRN-REGISTRY: START -->')) {
    const expected = renderIndex(existing, anchors);
    const normalise = (s) => s.replace(/\r\n/g, '\n').trimEnd();
    if (normalise(existing) !== normalise(expected)) {
      errors.push({
        file: 'INDEX.md',
        message: `out of date with the anchors on disk; run 'cairn index --write'`,
      });
    }
  }

  if (options.json) {
    const payload = {
      ok: errors.length === 0 && !(options.strict && warnings.length),
      counts: { anchors: anchors.length, errors: errors.length, warnings: warnings.length },
      errors,
      warnings,
    };
    console.log(JSON.stringify(payload, null, 2));
    return payload.ok ? 0 : 1;
  }

  for (const error of errors) {
    console.error(`${style.red(symbol.error)} ${style.bold(error.file)}  ${error.message}`);
  }
  for (const warning of warnings) {
    console.warn(`${style.yellow(symbol.warn)} ${style.bold(warning.file)}  ${warning.message}`);
  }

  const noun = anchors.length === 1 ? 'anchor' : 'anchors';
  if (errors.length) {
    console.error(
      `\n${style.red(`${errors.length} problem${errors.length === 1 ? '' : 's'}`)} in ${anchors.length} ${noun}.`,
    );
    return 1;
  }
  if (warnings.length && options.strict) {
    console.error(`\n${style.yellow(`${warnings.length} warning(s)`)}, treated as errors by --strict.`);
    return 1;
  }

  const suffix = warnings.length ? ` ${style.dim(`(${warnings.length} warning(s))`)}` : '';
  console.log(`${style.green(symbol.ok)} ${anchors.length} ${noun} check out.${suffix}`);
  return 0;
}
