// Tier 1 — context overhead.
//
// Counts tokens for the artifacts Cairn actually puts in front of a model: the
// anchor files, the generated index, the per-platform instruction files, and the
// scoped output of `cairn context`, which is what the hooks and the MCP server
// inject.
//
// These counts are a floor, not a cost. A token count says what the context
// costs to *send*; it says nothing about what it costs to *act on*, which is
// where the real expense of an instruction file shows up. Tier 3 measures that.
// Any documentation citing this tier has to carry the distinction, because
// quoting a token count as "the overhead" would be measuring the wrong quantity.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { encode as encodeCl100k } from 'gpt-tokenizer/encoding/cl100k_base';
import { encode as encodeO200k } from 'gpt-tokenizer/encoding/o200k_base';

const INSTRUCTION_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  '.clinerules',
  '.windsurfrules',
];

const INSTRUCTION_DIRS = ['.cursor', '.devin', '.agents/rules', '.agents/skills'];

export function runTokens({ root, repoRoot }) {
  const cli = join(repoRoot, 'bin', 'cairn.js');
  const measure = (label, text, kind) => ({
    label,
    kind,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text.split('\n').length,
    cl100k: encodeCl100k(text).length,
    o200k: encodeO200k(text).length,
  });

  const rows = [];

  // ---- the anchors themselves ---------------------------------------------
  const cairnDir = join(repoRoot, '.cairn');
  const anchorFiles = readdirSync(cairnDir)
    .filter((f) => /^ANC-\d+.*\.md$/.test(f))
    .sort();
  for (const f of anchorFiles) {
    rows.push(measure(join('.cairn', f), readFileSync(join(cairnDir, f), 'utf8'), 'anchor'));
  }
  rows.push(measure('.cairn/INDEX.md', readFileSync(join(cairnDir, 'INDEX.md'), 'utf8'), 'index'));

  // ---- what an agent is actually given ------------------------------------
  // `cairn context` is the injection point for hooks and MCP, so its output is
  // the number that matters for per-session overhead.
  const scopes = discoverScopes(cairnDir, anchorFiles);
  for (const scope of scopes) {
    const args = scope === 'global' ? ['context'] : ['context', '--scope', scope];
    const out = execFileSync('node', [cli, ...args], { cwd: repoRoot, encoding: 'utf8' });
    rows.push(measure(`cairn ${args.join(' ')}`, out, 'context'));
  }

  // ---- generated per-platform instruction files ---------------------------
  for (const rel of INSTRUCTION_FILES) {
    const p = join(repoRoot, rel);
    if (existsSync(p)) rows.push(measure(rel, readFileSync(p, 'utf8'), 'instructions'));
  }
  for (const dir of INSTRUCTION_DIRS) {
    const p = join(repoRoot, dir);
    if (!existsSync(p)) continue;
    for (const file of walk(p)) {
      rows.push(measure(relative(repoRoot, file), readFileSync(file, 'utf8'), 'instructions'));
    }
  }

  const byKind = {};
  for (const row of rows) {
    byKind[row.kind] ??= { files: 0, cl100k: 0, o200k: 0 };
    byKind[row.kind].files += 1;
    byKind[row.kind].cl100k += row.cl100k;
    byKind[row.kind].o200k += row.o200k;
  }

  const results = {
    generated_at: new Date().toISOString(),
    caveat:
      'Token counts are a floor on context cost, not a measure of what the context costs to act on. See Tier 3.',
    tokenizers: ['cl100k_base', 'o200k_base'],
    by_kind: byKind,
    files: rows,
  };

  const outDir = join(root, 'results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'tokens.json'), JSON.stringify(results, null, 2) + '\n');

  report(rows, byKind);
  console.log(`\nwrote ${join(outDir, 'tokens.json')}`);
  return results;
}

function discoverScopes(cairnDir, anchorFiles) {
  const scopes = new Set(['global']);
  for (const f of anchorFiles) {
    const text = readFileSync(join(cairnDir, f), 'utf8');
    const m = text.match(/^scope:\s*(.+)$/m);
    if (m) scopes.add(m[1].trim().replace(/^["']|["']$/g, ''));
  }
  return [...scopes];
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(md|mdc|json|txt)$/.test(entry)) out.push(p);
  }
  return out;
}

function report(rows, byKind) {
  const w = Math.max(...rows.map((r) => r.label.length));
  console.log(`\n  ${'artifact'.padEnd(w)}  ${'kind'.padEnd(12)}  ${'cl100k'.padStart(7)}  ${'o200k'.padStart(7)}`);
  console.log(`  ${'-'.repeat(w)}  ${'-'.repeat(12)}  ${'-'.repeat(7)}  ${'-'.repeat(7)}`);
  for (const r of rows) {
    console.log(
      `  ${r.label.padEnd(w)}  ${r.kind.padEnd(12)}  ${String(r.cl100k).padStart(7)}  ${String(r.o200k).padStart(7)}`,
    );
  }
  console.log(`\n  totals by kind:`);
  for (const [kind, v] of Object.entries(byKind)) {
    console.log(`    ${kind.padEnd(14)} ${String(v.files).padStart(3)} files  ${String(v.o200k).padStart(7)} tokens (o200k)`);
  }
}
