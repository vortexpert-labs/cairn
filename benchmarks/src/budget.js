// Spend control for Tier 3.
//
// Four layers, in decreasing order of how much they can be trusted:
//
//   1. The provider-side credit limit on the key itself. Enforced by OpenRouter,
//      not by this file, which is the only reason it is trustworthy — everything
//      below depends on this code being correct, and this code could be wrong.
//   2. Pre-flight. Refuse to start if the key carries no limit, or if what
//      remains on it is below what the run is estimated to cost.
//   3. In-run accounting. Every response's real cost is added to a ledger that
//      is written to disk after each call, and the run aborts the moment the
//      running total crosses the soft ceiling. Persisting after every call is
//      what makes a crash or a Ctrl-C leave an accurate record rather than an
//      optimistic one.
//   4. The dry run, which prices the whole matrix from live model pricing and
//      spends nothing.
//
// The soft ceiling sits below the key's cap deliberately. If the two were equal,
// the first layer would never get a chance to matter, and a bug here would spend
// the difference before anything noticed.

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export const SOFT_CEILING_USD = 0.9;

// No single request in this design should cost anything close to this. If one
// does, something is wrong — a runaway loop, a model priced differently than we
// think — and stopping is better than continuing on an assumption.
export const PER_CALL_SANITY_USD = 0.05;

export class BudgetExceeded extends Error {}

export async function preflight({ apiKey, estimatedUsd, fetchImpl = fetch }) {
  const res = await fetchImpl('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`pre-flight failed: key endpoint returned ${res.status}. ${body.slice(0, 200)}`);
  }
  const { data } = await res.json();

  if (data.limit === null || data.limit === undefined) {
    throw new Error(
      'pre-flight refused: this key has no credit limit set. Create a key with an ' +
        'explicit limit so the provider enforces the ceiling rather than this script.',
    );
  }
  if (data.expires_at) {
    const msLeft = new Date(data.expires_at).getTime() - Date.now();
    if (msLeft <= 0) throw new Error(`pre-flight refused: key expired at ${data.expires_at}.`);
    const hoursLeft = msLeft / 3_600_000;
    if (hoursLeft < 1) {
      throw new Error(
        `pre-flight refused: key expires in ${hoursLeft.toFixed(1)}h, which is not enough ` +
          'headroom for a run. Issue a fresh key.',
      );
    }
  }
  if (estimatedUsd !== undefined && data.limit_remaining < estimatedUsd) {
    throw new Error(
      `pre-flight refused: $${data.limit_remaining.toFixed(4)} remains on the key but the run ` +
        `is estimated at $${estimatedUsd.toFixed(4)}. Reduce --tasks or raise the key limit.`,
    );
  }

  return {
    limit: data.limit,
    remaining: data.limit_remaining,
    used: data.usage,
    expires_at: data.expires_at ?? null,
  };
}

export class Ledger {
  #path;
  #ceiling;
  #state;

  constructor(path, { ceiling = SOFT_CEILING_USD } = {}) {
    this.#path = path;
    this.#ceiling = ceiling;
    this.#state = existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8'))
      : { started_at: new Date().toISOString(), ceiling_usd: ceiling, total_usd: 0, calls: [] };
    // A ledger carried over from an earlier run keeps its history, so resuming
    // cannot silently reset the total back to zero.
    this.#state.ceiling_usd = ceiling;
  }

  get total() {
    return this.#state.total_usd;
  }

  get calls() {
    return this.#state.calls.length;
  }

  remaining() {
    return this.#ceiling - this.#state.total_usd;
  }

  // The provider's own usage figure is authoritative, and ours can only be an
  // undercount: a request we abandon on timeout is still completed and billed,
  // but never returns a response for us to record. Enforcing a ceiling against
  // our own optimistic total would let real spend drift past it, so the ledger
  // adopts the provider's number whenever it is higher.
  reconcile(providerUsageUsd) {
    if (typeof providerUsageUsd !== 'number' || providerUsageUsd <= this.#state.total_usd) return null;
    const delta = round(providerUsageUsd - this.#state.total_usd);
    this.#state.calls.push({
      at: new Date().toISOString(),
      kind: 'reconciliation',
      note: 'unrecorded spend billed by the provider, most likely abandoned timeouts',
      cost_usd: delta,
    });
    this.#state.total_usd = round(providerUsageUsd);
    this.#persist();
    return delta;
  }

  // Called before a request. Refuses when what is left could not cover a call of
  // typical size, so the ceiling is not crossed mid-flight.
  assertRoomFor(expectedUsd) {
    if (this.#state.total_usd + expectedUsd > this.#ceiling) {
      throw new BudgetExceeded(
        `stopping: $${this.#state.total_usd.toFixed(4)} spent, next call estimated at ` +
          `$${expectedUsd.toFixed(4)}, ceiling is $${this.#ceiling.toFixed(2)}.`,
      );
    }
  }

  record(entry) {
    const cost = Number(entry.cost_usd) || 0;
    if (cost > PER_CALL_SANITY_USD) {
      this.#state.calls.push({ ...entry, at: new Date().toISOString(), flagged: 'per_call_sanity' });
      this.#state.total_usd = round(this.#state.total_usd + cost);
      this.#persist();
      throw new BudgetExceeded(
        `stopping: a single call cost $${cost.toFixed(4)}, above the $${PER_CALL_SANITY_USD} ` +
          'per-call sanity limit. Investigate before continuing.',
      );
    }

    this.#state.calls.push({ ...entry, at: new Date().toISOString() });
    this.#state.total_usd = round(this.#state.total_usd + cost);
    this.#persist();

    if (this.#state.total_usd > this.#ceiling) {
      throw new BudgetExceeded(
        `stopping: $${this.#state.total_usd.toFixed(4)} spent, ceiling is $${this.#ceiling.toFixed(2)}.`,
      );
    }
    return this.#state.total_usd;
  }

  #persist() {
    mkdirSync(dirname(this.#path), { recursive: true });
    this.#state.updated_at = new Date().toISOString();
    // Written to a temporary file and renamed, because rename is atomic: a power
    // cut can leave the old ledger or the new one, never a half-written file.
    // A corrupt ledger would be unparseable on restart and would take the budget
    // guard down with it.
    const tmp = `${this.#path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#state, null, 2) + '\n');
    renameSync(tmp, this.#path);
  }
}

function round(x) {
  return Number(x.toFixed(6));
}

// Live pricing, used by the dry run so estimates track what the provider
// actually charges today rather than a number written down once and left to rot.
export async function fetchPricing(modelId, fetchImpl = fetch) {
  const res = await fetchImpl('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`could not fetch model pricing: ${res.status}`);
  const { data } = await res.json();
  const model = data.find((m) => m.id === modelId);
  if (!model) throw new Error(`model not found on OpenRouter: ${modelId}`);
  return {
    id: model.id,
    prompt_usd_per_token: Number(model.pricing.prompt),
    completion_usd_per_token: Number(model.pricing.completion),
    context_length: model.context_length,
    supports_tools: (model.supported_parameters ?? []).includes('tools'),
  };
}
