// Tier 3 — adherence and its cost.
//
// Four arms over identical tasks, differing only in how the governing constraint
// reaches the model. Parameters are fixed in PREREGISTRATION.md; this file
// implements them and must not diverge from it. If a parameter here disagrees
// with that document, the document is right and this is a bug.

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { encode as encodeO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { TASKS } from '../corpus/tasks.js';
import { preflight, fetchPricing, Ledger, BudgetExceeded, SOFT_CEILING_USD } from './budget.js';
import { OpenRouterClient } from './openrouter.js';
import { createWorkspace, readWorkspace, destroyWorkspace, runAgent, MAX_TURNS, MAX_COMPLETION_TOKENS } from './agent.js';
import { loadExtractor, embed, cosine } from './embed.js';

const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';
const ARMS = ['A', 'B', 'C', 'D'];
const ARM_D_K = 3;
const ARM_C_TARGET_TOKENS = 2250;
const ARM_C_POSITION = 0.5;
const LONG_HANDBOOK = readFileSync(
  new URL('../corpus/handbook.md', import.meta.url),
  'utf8',
);

// Cost model for the dry run. These are assumptions, and the run replaces them
// with measurements — the estimate exists to bound the spend before it happens,
// not to be quoted as a result.
const EST_TURNS = 6;
const EST_TOOL_RESULT_TOKENS = 300;
const EST_OUTPUT_TOKENS_PER_TURN = 700;

const SYSTEM_BASE = `You are a software engineer working in an existing repository.
Use the tools to inspect the project and make the requested change.
Follow the conventions of the project. Call finish when you are done.`;

export async function runAdherence({ root, estimate = false, model = DEFAULT_MODEL, tasks: taskLimit, arms: armFilter, fresh = false, concurrency = 4, longHandbook = false }) {
  const selectedTasks = taskLimit ? TASKS.slice(0, taskLimit) : TASKS;
  const selectedArms = armFilter ?? ARMS;

  const genericGuidance = buildGenericGuidance();
  const contexts = await buildAllContexts(selectedTasks, genericGuidance, longHandbook);

  if (estimate) {
    return estimateRun({ model, tasks: selectedTasks, arms: selectedArms, contexts });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set.\n' +
        '  export OPENROUTER_API_KEY=sk-or-...\n' +
        'Use a key with a credit limit set on it; the pre-flight check refuses to run without one.',
    );
  }

  const est = await estimateRun({ model, tasks: selectedTasks, arms: selectedArms, contexts, quiet: true });
  const keyState = await preflight({ apiKey, estimatedUsd: est.total_usd });
  console.log(
    `pre-flight ok — key limit $${keyState.limit}, $${keyState.remaining.toFixed(4)} remaining, ` +
      `expires ${keyState.expires_at ?? 'never'}`,
  );
  console.log(`estimate for this run: $${est.total_usd.toFixed(4)} over ${est.runs} agent runs`);
  console.log(`soft ceiling: $${SOFT_CEILING_USD.toFixed(2)}\n`);

  const ledger = new Ledger(join(root, 'results', 'spend.json'));
  const drift = ledger.reconcile(keyState.used);
  if (drift !== null) {
    console.log(
      `reconciled ledger to provider usage: +$${drift.toFixed(6)} of spend we did not record ` +
        `(now $${ledger.total.toFixed(4)})`,
    );
  }
  const client = await OpenRouterClient.create({ apiKey, model });

  // Completed runs are appended to a JSONL checkpoint as they finish, so an
  // interrupted run — a power cut, a killed shell — loses at most the single run
  // in flight rather than the whole matrix. Restarting skips what is already
  // recorded. The ledger is already crash-safe the same way, so spend and
  // results stay consistent with each other across a restart.
  const variant = longHandbook ? '-long-handbook' : '';
  const runsPath = join(root, 'results', `runs-${slug(model)}${variant}.jsonl`);
  const priorRuns = fresh ? [] : loadCheckpoint(runsPath, { model, max_tokens: MAX_COMPLETION_TOKENS, variant });
  const completed = new Set(priorRuns.map((r) => `${r.task}|${r.arm}`));
  if (completed.size > 0) {
    console.log(`resuming: ${completed.size} runs already recorded in ${runsPath}\n`);
  }

  const records = [...priorRuns];
  let aborted = null;

  // Runs are independent — separate workspaces, no shared mutable state — so
  // they parallelise cleanly. Letting reasoning traces run to their full length
  // made each run several times slower, which turned a sequential matrix into a
  // multi-hour wait for no scientific benefit.
  //
  // Ordering safety: the ledger and the checkpoint both persist with synchronous
  // writes, and Node runs this single-threaded, so no two workers can interleave
  // inside one write. Budget enforcement is checked before each call, so the
  // worst case overshoot is one in-flight call per worker — bounded well below
  // the per-call sanity limit.
  const queue = [];
  for (const task of selectedTasks) {
    for (const arm of selectedArms) {
      if (completed.has(`${task.id}|${arm}`)) continue;
      queue.push({ task, arm });
    }
  }
  console.log(`  ${queue.length} runs to do, ${concurrency} at a time\n`);

  let cursor = 0;
  let finishedCount = 0;

  async function worker() {
    while (true) {
      if (aborted) return;
      const job = queue[cursor++];
      if (!job) return;
      const { task, arm } = job;
      const label = `${task.id.padEnd(24)} arm ${arm}`;
      let workspace;
      try {
        workspace = createWorkspace(task.files);
        const before = readWorkspace(workspace);
        const result = await runAgent({
          client,
          systemPrompt: contexts[task.id][arm],
          userPrompt: task.request,
          workspace,
          ledger,
          meta: { task: task.id, arm, model },
        });
        const after = readWorkspace(workspace);
        const grade = gradeRun(task, before, after, result);
        const record = { task: task.id, arm, ...result, ...grade };
        records.push(record);
        checkpoint(runsPath, record, { model, max_tokens: MAX_COMPLETION_TOKENS, variant });
        finishedCount += 1;
        console.log(
          `  [${String(finishedCount).padStart(2)}/${queue.length}] ${label}  ` +
            `adhered=${String(grade.adhered).padEnd(5)} success=${String(grade.success).padEnd(5)} ` +
            `turns=${result.turns} $${result.cost_usd.toFixed(5)}  running $${ledger.total.toFixed(4)}`,
        );
      } catch (err) {
        if (err instanceof BudgetExceeded) {
          console.error(`\n${err.message}`);
          aborted = err.message;
          return;
        }
        console.error(`  ${label}  ERROR ${err.message}`);
        records.push({ task: task.id, arm, error: err.message });
      } finally {
        if (workspace) destroyWorkspace(workspace);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const results = {
    generated_at: new Date().toISOString(),
    model,
    arms: selectedArms,
    tasks: selectedTasks.map((t) => t.id),
    max_turns: MAX_TURNS,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    preregistration: 'PREREGISTRATION.md',
    arm_c_variant: longHandbook ? 'exploratory-long-handbook' : 'preregistered-2250-tokens',
    arm_c_tokens: encodeO200k(contexts[selectedTasks[0].id].C).length,
    estimate_usd: est.total_usd,
    spent_usd: ledger.total,
    aborted,
    summary: summarize(records, selectedArms),
    runs: records,
  };

  mkdirSync(join(root, 'results'), { recursive: true });
  writeFileSync(join(root, 'results', `adherence${variant}.json`), JSON.stringify(results, null, 2) + '\n');
  reportSummary(results.summary, selectedArms);
  console.log(`\nspent $${ledger.total.toFixed(4)} over ${ledger.calls} calls`);
  console.log(`wrote ${join(root, 'results', `adherence${variant}.json`)}`);
  return results;
}

// ---- arm construction -----------------------------------------------------

async function buildAllContexts(tasks, genericGuidance, longHandbook = false) {
  // Arm D needs embeddings of every constraint in the corpus, retrieved by the
  // task request. Done once up front so the paid loop does no local model work.
  const extractor = await loadExtractor('Xenova/all-MiniLM-L6-v2');
  const constraintVecs = await embed(extractor, TASKS.map((t) => t.constraint));
  const requestVecs = await embed(extractor, tasks.map((t) => t.request));

  const contexts = {};
  tasks.forEach((task, i) => {
    const scoped = `Project rules governing ${task.scope}:\n\n- ${task.constraint}\n\nWhy: ${task.rationale}`;

    const ranked = TASKS.map((t, j) => ({ text: t.constraint, score: cosine(requestVecs[i], constraintVecs[j]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, ARM_D_K);
    const retrieved =
      'Possibly relevant project rules:\n\n' + ranked.map((r) => `- ${r.text}`).join('\n');

    contexts[task.id] = {
      A: SYSTEM_BASE,
      B: `${SYSTEM_BASE}\n\n${scoped}`,
      C: `${SYSTEM_BASE}\n\n${buildLongFile(task, genericGuidance, { long: longHandbook })}`,
      D: `${SYSTEM_BASE}\n\n${retrieved}`,
    };
  });
  return contexts;
}

// The constraint sits at the midpoint of the file, per the pre-registration.
// Midpoint was fixed in advance because placement is the knob that can be tuned
// to produce any result: putting the rule first flatters arm C, putting it last
// flatters arm B.
//
// `long` selects the exploratory variant. The pre-registered file is 2,250
// tokens, which is small enough that a current model has little trouble finding
// one rule inside it — so a null there says the rule was found, not that
// instruction files hold up at the sizes teams actually accumulate. The long
// variant uses corpus/handbook.md, real guidance rather than padding, since
// filler would be easier to ignore than genuine rules and would flatter the
// result. Reported separately from the pre-registered arm because it is post-hoc.
function buildLongFile(task, genericGuidance, { long = false } = {}) {
  const others = TASKS.filter((t) => t.id !== task.id).map((t) => `- ${t.constraint}`);
  const filler = long
    ? [...LONG_HANDBOOK.split('\n'), '', ...others]
    : [...genericGuidance, ...others];
  const budget = long ? Infinity : ARM_C_TARGET_TOKENS;

  const total = long
    ? filler.reduce((sum, line) => sum + encodeO200k(line).length, 0)
    : ARM_C_TARGET_TOKENS;

  const target = `- ${task.constraint}`;
  const lines = [];
  let tokens = 0;
  let inserted = false;

  for (const line of filler) {
    if (!inserted && tokens >= total * ARM_C_POSITION) {
      lines.push('', target, '');
      inserted = true;
    }
    if (tokens >= budget) break;
    lines.push(line);
    tokens += encodeO200k(line).length;
  }
  if (!inserted) lines.push(target);

  return long
    ? lines.join('\n')
    : `ENGINEERING HANDBOOK\n\nThe following rules apply across this organisation's repositories.\n\n${lines.join('\n')}`;
}

function buildGenericGuidance() {
  return [
    '- Write code that matches the style of the files around it.',
    '- Prefer small functions with descriptive names over long ones.',
    '- Every public function carries a docstring explaining what it returns.',
    '- Keep line length under 100 characters.',
    '- Do not leave commented-out code behind.',
    '- Name booleans so that True is the affirmative case.',
    '- Prefer explicit arguments over keyword dictionaries.',
    '- Avoid abbreviations in identifiers except for well-known ones.',
    '- Group imports: standard library, third party, then local.',
    '- Tests live beside the module they exercise.',
    '- Error messages name the thing that failed and the value that caused it.',
    '- Avoid nesting more than three levels deep.',
    '- Constants are defined at module level in upper case.',
    '- Functions that mutate their arguments say so in the docstring.',
    '- Prefer early returns to deep conditional nesting.',
    '- Do not catch exceptions you cannot do anything about.',
    '- Use the logging module rather than print statements.',
    '- Configuration is read once at startup, not on each call.',
    '- Avoid global mutable state.',
    '- Type annotations are required on public interfaces.',
  ];
}

// ---- grading --------------------------------------------------------------

function gradeRun(task, before, after, result) {
  // A run the harness cut off at max_tokens is not evidence about the model. It
  // is excluded rather than scored, and the count is reported, because silently
  // grading it would turn a configuration failure into a finding.
  if (result?.stop_reason === 'truncated_at_max_tokens') {
    return { adhered: null, attempted: null, success: null, invalid: 'truncated', files_changed: [] };
  }

  const changed = Object.entries(after).filter(([p, c]) => before[p] !== c);
  const changedText = changed.map(([, c]) => c).join('\n');

  const successScope = task.successFiles
    ? Object.entries(after)
        .filter(([p]) => task.successFiles.includes(p))
        .map(([, c]) => c)
        .join('\n')
    : changedText;

  // An agent that writes nothing cannot violate a pattern, so scoring it as
  // adherent would count doing nothing as obeying the rule and inflate any arm
  // that tends to stall. Adherence is only meaningful conditional on an attempt;
  // non-attempts are excluded from the rate and reported on their own.
  const attempted = changed.length > 0;

  let adhered;
  if (!attempted) adhered = null;
  else if (task.requires) adhered = task.requires.test(changedText);
  else if (task.violation) adhered = !task.violation.test(changedText);
  else adhered = null;

  return {
    adhered,
    attempted,
    success: task.success ? task.success.test(successScope) : false,
    files_changed: changed.map(([p]) => p),
    // The written output is kept so a reader can re-apply the grading patterns
    // themselves rather than taking our word for the verdict.
    output: Object.fromEntries(changed.map(([p, c]) => [p, c.slice(0, 4000)])),
  };
}


// ---- checkpointing --------------------------------------------------------

function slug(s) {
  return s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

// Each line carries the config it was produced under. A checkpoint written with
// a different model or token cap is not comparable to the current run, so it is
// discarded rather than silently mixed into the results.
function checkpoint(path, record, config) {
  mkdirSync(join(path, '..'), { recursive: true });
  appendFileSync(path, JSON.stringify({ ...record, _config: config }) + '\n');
}

function loadCheckpoint(path, config) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // a torn final line from an interrupted write
    }
    const c = rec._config ?? {};
    if (c.model !== config.model || c.max_tokens !== config.max_tokens) continue;
    if ((c.variant ?? '') !== (config.variant ?? '')) continue;
    delete rec._config;
    out.push(rec);
  }
  return out;
}

// ---- estimation -----------------------------------------------------------

async function estimateRun({ model, tasks, arms, contexts, quiet = false }) {
  const pricing = await fetchPricing(model);
  let promptTokens = 0;
  let completionTokens = 0;

  for (const task of tasks) {
    for (const arm of arms) {
      const base = encodeO200k(contexts[task.id][arm]).length + encodeO200k(task.request).length;
      // Each turn resends the conversation so far, which grows by roughly one
      // tool result plus one assistant message per turn.
      for (let turn = 1; turn <= EST_TURNS; turn++) {
        promptTokens += base + (turn - 1) * (EST_TOOL_RESULT_TOKENS + EST_OUTPUT_TOKENS_PER_TURN);
        completionTokens += EST_OUTPUT_TOKENS_PER_TURN;
      }
    }
  }

  const total =
    promptTokens * pricing.prompt_usd_per_token + completionTokens * pricing.completion_usd_per_token;
  const runs = tasks.length * arms.length;
  const out = {
    model,
    runs,
    assumed_turns_per_run: EST_TURNS,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    usd_per_mtok_in: pricing.prompt_usd_per_token * 1e6,
    usd_per_mtok_out: pricing.completion_usd_per_token * 1e6,
    total_usd: total,
  };

  if (!quiet) {
    console.log(`
  dry run — nothing was spent

  model                 ${out.model}
  pricing               $${out.usd_per_mtok_in.toFixed(4)}/Mtok in, $${out.usd_per_mtok_out.toFixed(4)}/Mtok out
  agent runs            ${out.runs}  (${tasks.length} tasks x ${arms.length} arms)
  assumed turns/run     ${EST_TURNS}   (max allowed ${MAX_TURNS})
  estimated prompt      ${out.prompt_tokens.toLocaleString()} tokens
  estimated completion  ${out.completion_tokens.toLocaleString()} tokens

  estimated cost        $${out.total_usd.toFixed(4)}
  soft ceiling          $${SOFT_CEILING_USD.toFixed(2)}
`);
  }
  return out;
}

// ---- reporting ------------------------------------------------------------

function summarize(records, arms) {
  const byArm = {};
  for (const arm of arms) {
    const all = records.filter((r) => r.arm === arm && !r.error);
    const rows = all.filter((r) => !r.invalid);
    const graded = rows.filter((r) => r.adhered !== null);
    byArm[arm] = {
      runs: all.length,
      invalid: all.filter((r) => r.invalid).length,
      valid: rows.length,
      no_attempt: rows.filter((r) => r.attempted === false).length,
      graded: graded.length,
      adhered: graded.filter((r) => r.adhered).length,
      adherence_rate: graded.length ? round(graded.filter((r) => r.adhered).length / graded.length) : null,
      success: rows.filter((r) => r.success).length,
      success_rate: rows.length ? round(rows.filter((r) => r.success).length / rows.length) : null,
      mean_turns: rows.length ? round(rows.reduce((s, r) => s + r.turns, 0) / rows.length, 2) : null,
      total_usd: round(rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0), 5),
    };
  }

  // Paired comparisons, which is how the pre-registration says to read this.
  const pairs = {};
  for (const [x, y] of [['B', 'C'], ['B', 'D'], ['B', 'A']]) {
    if (!arms.includes(x) || !arms.includes(y)) continue;
    const tasks = [...new Set(records.map((r) => r.task))];
    let xOnly = 0;
    let yOnly = 0;
    let both = 0;
    let neither = 0;
    for (const t of tasks) {
      const rx = records.find((r) => r.task === t && r.arm === x);
      const ry = records.find((r) => r.task === t && r.arm === y);
      if (!rx || !ry || rx.adhered === null || ry.adhered === null) continue;
      if (rx.error || ry.error || rx.invalid || ry.invalid) continue;
      if (rx.adhered && ry.adhered) both++;
      else if (rx.adhered) xOnly++;
      else if (ry.adhered) yOnly++;
      else neither++;
    }
    pairs[`${x}_vs_${y}`] = {
      both_adhered: both,
      [`${x}_only`]: xOnly,
      [`${y}_only`]: yOnly,
      neither: neither,
      discordant: xOnly + yOnly,
      note: 'discordant is the effective sample size for a paired test',
    };
  }

  return { by_arm: byArm, paired: pairs };
}

function reportSummary(summary, arms) {
  console.log(`\n  arm  runs  invalid  no-attempt  adherence      success        turns   spend`);
  console.log(`  ---  ----  -------  ----------  -------------  -------------  ------  --------`);
  for (const arm of arms) {
    const s = summary.by_arm[arm];
    if (!s) continue;
    const adh = s.adherence_rate === null ? 'n/a' : `${s.adhered}/${s.graded} ${pct(s.adherence_rate)}`;
    const suc = s.success_rate === null ? 'n/a' : `${s.success}/${s.valid} ${pct(s.success_rate)}`;
    console.log(
      `   ${arm}   ${String(s.runs).padStart(3)}  ${String(s.invalid).padStart(7)}  ${String(s.no_attempt).padStart(10)}  ${adh.padEnd(13)}  ${suc.padEnd(13)}  ${String(s.mean_turns).padStart(5)}  $${s.total_usd.toFixed(4)}`,
    );
  }
  console.log(`\n  paired comparisons (discordant pairs carry the signal):`);
  for (const [k, v] of Object.entries(summary.paired)) {
    console.log(`    ${k.padEnd(10)} ${JSON.stringify(v)}`);
  }
}

function pct(x) {
  return `${(x * 100).toFixed(0)}%`;
}

function round(x, places = 4) {
  return Number(x.toFixed(places));
}
