// A deliberately small agent loop for Tier 3.
//
// It exists so the benchmark can measure behaviour rather than a single
// completion: how many turns the model takes, how many files it opens, and what
// it finally writes. A single-shot design would only show whether the final
// answer honoured the rule, and would say nothing about what obeying it cost.
//
// Every run gets a throwaway workspace. Paths from the model are resolved and
// checked to stay inside it — the model is not adversarial here, but a harness
// that executes model-chosen paths without bounding them is a bad habit to have
// written down in a public repository.

import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List every file in the project.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read one file from the project.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Project-relative path.' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a file, creating or replacing it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project-relative path.' },
          content: { type: 'string', description: 'Full contents of the file.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Call when the task is complete.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', description: 'What you changed.' } },
        required: ['summary'],
      },
    },
  },
];

export const MAX_TURNS = 10;
export const MAX_COMPLETION_TOKENS = 16384;

export function createWorkspace(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-bench-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

export function readWorkspace(dir) {
  const out = {};
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

export function destroyWorkspace(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function safeResolve(root, candidate) {
  const full = resolve(root, candidate);
  const rel = relative(root, full);
  if (rel.startsWith('..') || rel.startsWith(sep) || resolve(root, rel) !== full) {
    throw new Error(`path escapes the workspace: ${candidate}`);
  }
  return full;
}

function executeTool(root, name, args) {
  switch (name) {
    case 'list_files':
      return Object.keys(readWorkspace(root)).sort().join('\n') || '(empty)';
    case 'read_file': {
      const p = safeResolve(root, args.path ?? '');
      if (!existsSync(p)) return `error: no such file: ${args.path}`;
      return readFileSync(p, 'utf8');
    }
    case 'write_file': {
      const p = safeResolve(root, args.path ?? '');
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, args.content ?? '');
      return `wrote ${args.path}`;
    }
    case 'finish':
      return 'done';
    default:
      return `error: unknown tool ${name}`;
  }
}

export async function runAgent({ client, systemPrompt, userPrompt, workspace, ledger, meta, maxTurns = MAX_TURNS }) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const trace = [];
  let turns = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let cost = 0;
  let finished = false;
  let stopReason = 'max_turns';
  let lastText = null;
  let lastFinishReason = null;

  while (turns < maxTurns) {
    // Bound the next call against the ceiling before making it, using the most
    // expensive call seen so far as the expectation.
    ledger.assertRoomFor(0.01);

    // Must comfortably exceed the longest reasoning trace any arm produces.
    // At 1024 and again at 4096 the models were cut off mid-reasoning, and the
    // truncation fell hardest on the arm carrying the most context (55% of arm C
    // at 4096), which censored that arm down to a biased surviving subsample.
    // This is a cap rather than a reservation, so raising it costs nothing on
    // runs that do not need the room — and it is what makes completion tokens
    // usable as the behavioural cost metric, since a censored trace cannot be
    // compared across arms.
    const res = await client.chat({ messages, tools: TOOLS, maxTokens: MAX_COMPLETION_TOKENS });
    turns += 1;
    promptTokens += res.usage.prompt_tokens;
    completionTokens += res.usage.completion_tokens;
    cost += res.usage.cost_usd;
    ledger.record({ ...meta, turn: turns, ...res.usage });

    const msg = res.message;
    if (!msg) {
      stopReason = 'empty_response';
      break;
    }
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      // Kept so a stall can be diagnosed from the results file rather than
      // guessed at: a model that answers in prose instead of calling write_file
      // is a different problem from one that refuses or runs out of turns.
      lastText =
        typeof msg.content === 'string'
          ? msg.content.slice(0, 1500)
          : JSON.stringify(msg).slice(0, 1500);
      // finish_reason separates a model that chose to stop from one the harness
      // cut off at max_tokens. Reporting the second as a behavioural finding
      // would be publishing an artifact of our own configuration.
      lastFinishReason = res.finishReason;
      stopReason = res.finishReason === 'length' ? 'truncated_at_max_tokens' : 'no_tool_call';
      break;
    }

    let sawFinish = false;
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      let result;
      try {
        result = executeTool(workspace, call.function.name, args);
      } catch (err) {
        result = `error: ${err.message}`;
      }
      trace.push({ turn: turns, tool: call.function.name, path: args.path });
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result).slice(0, 4000) });
      if (call.function.name === 'finish') sawFinish = true;
    }

    if (sawFinish) {
      finished = true;
      stopReason = 'finish';
      break;
    }
  }

  return {
    turns,
    finished,
    stop_reason: stopReason,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: cost,
    tool_calls: trace.length,
    writes: trace.filter((t) => t.tool === 'write_file').length,
    reads: trace.filter((t) => t.tool === 'read_file').length,
    last_text: lastText,
    finish_reason: lastFinishReason,
    trace,
  };
}
