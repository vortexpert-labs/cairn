#!/usr/bin/env node
// Benchmark entry point.
//
//   node run.js tokens               Tier 1 — context overhead (free)
//   node run.js deontic              Tier 2 — deontic similarity (free, local)
//   node run.js adherence --estimate Tier 3 — priced dry run, spends nothing
//   node run.js adherence            Tier 3 — the paid run
//
// Tiers 1 and 2 need no API key and no account. Tier 3 does, and every guard
// around its spending lives in src/budget.js.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');

const [, , command, ...rest] = process.argv;

const flags = {
  estimate: rest.includes('--estimate'),
  fresh: rest.includes('--fresh'),
  longHandbook: rest.includes('--long-handbook'),
  concurrency: valueOf('--concurrency') ? Number(valueOf('--concurrency')) : undefined,
  models: valueOf('--models')?.split(','),
  model: valueOf('--model'),
  tasks: valueOf('--tasks') ? Number(valueOf('--tasks')) : undefined,
  limit: valueOf('--limit') ? Number(valueOf('--limit')) : undefined,
  arms: valueOf('--arms')?.split(','),
};

function valueOf(name) {
  const i = rest.indexOf(name);
  if (i === -1) return undefined;
  const v = rest[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}

try {
  switch (command) {
    case 'tokens': {
      const { runTokens } = await import('./src/tokens.js');
      runTokens({ root, repoRoot });
      break;
    }
    case 'deontic': {
      const { runDeontic } = await import('./src/deontic.js');
      await runDeontic({ root, only: flags.models });
      break;
    }
    case 'adherence': {
      const { runAdherence } = await import('./src/adherence.js');
      await runAdherence({ root, repoRoot, ...flags });
      break;
    }
    default:
      console.error(`usage: node run.js <tokens|deontic|adherence> [flags]

  tokens                          count tokens for anchors, index and context output
  deontic [--models a,b]          embedding polarity study, runs locally
  adherence --estimate            price the paid run without spending
  adherence [--model X] [--tasks N] [--arms A,B,C,D]
            [--concurrency N] [--fresh] [--long-handbook]
                                  the paid run, guarded by src/budget.js
                                  resumes from results/runs-<model>.jsonl
`);
      process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(`\n${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}
