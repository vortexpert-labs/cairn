import fs from 'node:fs';
import path from 'node:path';
import { loadAnchors, nextId, readSchema } from '../anchor/load.js';
import { serializeAnchor, slugify } from '../anchor/serialize.js';
import { validate } from '../schema/validator.js';
import { renderIndex, readIndex } from '../render/index.js';
import { style, symbol } from '../render/terminal.js';

export function newAnchor({ dir, options }) {
  if (!fs.existsSync(dir)) {
    console.error(`no .cairn/ directory here. Run 'cairn init' first.`);
    return 3;
  }
  if (!options.title) {
    console.error(`--title is required.`);
    return 2;
  }

  const schema = readSchema(dir);
  const id = nextId(dir);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const anchor = {
    id,
    title: options.title,
    type: String(options.type || 'DECISION').toUpperCase(),
    // Anchors default to PROPOSED: an agent drafts, a person promotes it in review.
    status: String(options.status || 'PROPOSED').toUpperCase(),
    created_at: now,
    scope: options.scope || 'global',
    claims: options.claim || [],
    rationale: options.rationale || '',
    body: '',
  };

  if (anchor.claims.length === 0) {
    console.error(`at least one --claim is required. It is the anchor's actual content.`);
    return 2;
  }
  if (!anchor.rationale) {
    console.error(`--rationale is required. It is the part that is invisible from the code.`);
    return 2;
  }
  if (options.alternative?.length) {
    anchor.alternatives = [];
    for (const raw of options.alternative) {
      const [option, ...reason] = String(raw).split('::');
      const rejected_because = reason.join('::').trim();
      if (!option.trim() || !rejected_because) {
        console.error(
          `--alternative expects "option :: why it was rejected", got '${raw}'.`,
        );
        return 2;
      }
      anchor.alternatives.push({ option: option.trim(), rejected_because });
    }
  }

  if (options.revisit_if) anchor.revisit_if = options.revisit_if;
  if (options.verify) {
    if (anchor.type !== 'CONSTRAINT') {
      console.error(`--verify is only allowed on CONSTRAINT anchors, not ${anchor.type}.`);
      return 2;
    }
    anchor.verify = { command: options.verify };
  }

  // Validate before writing, so an invalid anchor never reaches disk.
  const errors = validate(
    Object.fromEntries(Object.entries(anchor).filter(([k]) => k !== 'body')),
    schema,
  );
  if (errors.length) {
    for (const e of errors) console.error(`${style.red(symbol.error)} ${e.path || '(root)'} ${e.message}`);
    return 2;
  }

  const file = `${id}-${slugify(anchor.title)}.md`;
  fs.writeFileSync(path.join(dir, file), serializeAnchor(anchor), 'utf8');
  console.log(`${style.green(symbol.ok)} ${file}`);

  const indexFile = path.join(dir, 'INDEX.md');
  const { anchors } = loadAnchors(dir, schema);
  fs.writeFileSync(indexFile, renderIndex(readIndex(indexFile), anchors), 'utf8');
  console.log(`${style.green(symbol.ok)} INDEX.md updated`);

  if (anchor.status === 'PROPOSED') {
    console.log(
      `\n${style.dim('Drafted as PROPOSED. Set status to ACTIVE once a person has agreed to it.')}`,
    );
  }
  return 0;
}
