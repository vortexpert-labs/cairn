#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CAIRN_DIR } from '../src/anchor/load.js';
import { repoRoot } from '../src/paths.js';
import { init } from '../src/commands/init.js';
import { newAnchor } from '../src/commands/new.js';
import { check } from '../src/commands/check.js';
import { indexCommand } from '../src/commands/index-cmd.js';
import { migrate } from '../src/commands/migrate.js';
import { doctor } from '../src/commands/doctor.js';

const HELP = `cairn — the decisions and constraints your project runs on

Usage: cairn <command> [options]

  init              Create .cairn/ with a schema, an index, and a stage anchor
    --stage         PROTOTYPE | ALPHA | BETA | PRODUCTION | MAINTENANCE

  new               Record an anchor (drafted as PROPOSED by default)
    --title         Short name for the anchor                        (required)
    --claim         The anchor's content; repeat for several claims  (required)
    --rationale     Why it holds — the part not visible in the code  (required)
    --type          GOAL | STAGE | DECISION | CONSTRAINT | FINDING | REJECTED_PATH
    --status        PROPOSED | ACTIVE | SUPERSEDED | INVALIDATED | RETIRED
    --scope         Path or glob this anchor governs
    --alternative   "option :: why it was rejected"; repeat for several
    --revisit-if    The condition that would make this anchor wrong
    --verify        Shell check for a CONSTRAINT; exit 0 means it holds

  check             Validate everything and report problems
    --strict        Treat warnings as errors
    --json          Machine-readable output

  index             Compare INDEX.md against the anchors on disk
    --write         Regenerate the table between the registry markers

  migrate           Move a v1 .anchors/ directory to .cairn/
    --dry-run       Show what would change without touching anything

  doctor            Diagnose the setup rather than the content

Exit codes: 0 clean · 1 problems found · 2 usage error · 3 nothing to act on
`;

const SHARED = { 'no-color': { type: 'boolean' } };

function parse(args, options) {
  try {
    return parseArgs({ args, options: { ...options, ...SHARED }, allowPositionals: true });
  } catch (error) {
    console.error(`${error.message}\n\nRun 'cairn --help' for usage.`);
    return null;
  }
}

export function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const rest = argv.slice(1);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    console.log('1.0.0');
    return 0;
  }

  const root = repoRoot();
  const dir = path.join(root, CAIRN_DIR);

  switch (command) {
    case 'init': {
      const parsed = parse(rest, { stage: { type: 'string' } });
      return parsed ? init({ root, stage: parsed.values.stage }) : 2;
    }
    case 'new': {
      const parsed = parse(rest, {
        title: { type: 'string' },
        claim: { type: 'string', multiple: true },
        rationale: { type: 'string' },
        type: { type: 'string' },
        status: { type: 'string' },
        scope: { type: 'string' },
        alternative: { type: 'string', multiple: true },
        'revisit-if': { type: 'string' },
        verify: { type: 'string' },
      });
      if (!parsed) return 2;
      const v = parsed.values;
      return newAnchor({ dir, options: { ...v, revisit_if: v['revisit-if'] } });
    }
    case 'check': {
      const parsed = parse(rest, { strict: { type: 'boolean' }, json: { type: 'boolean' } });
      return parsed ? check({ dir, root, options: parsed.values }) : 2;
    }
    case 'lint': {
      // Kept as an alias so existing muscle memory and CI scripts keep working.
      const parsed = parse(rest, { strict: { type: 'boolean' }, json: { type: 'boolean' } });
      return parsed ? check({ dir, root, options: parsed.values }) : 2;
    }
    case 'index': {
      const parsed = parse(rest, { write: { type: 'boolean' }, sync: { type: 'boolean' } });
      if (!parsed) return 2;
      return indexCommand({ dir, options: { write: parsed.values.write || parsed.values.sync } });
    }
    case 'migrate': {
      const parsed = parse(rest, { 'dry-run': { type: 'boolean' } });
      return parsed ? migrate({ root, options: { dryRun: parsed.values['dry-run'] } }) : 2;
    }
    case 'doctor':
      return doctor({ dir, root });
    default:
      console.error(`unknown command '${command}'. Run 'cairn --help' for usage.`);
      return 2;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly || process.env.CAIRN_FORCE_MAIN) {
  process.exit(main());
}
