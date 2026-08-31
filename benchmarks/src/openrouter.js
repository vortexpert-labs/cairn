// Minimal OpenRouter client for Tier 3.
//
// Cost is taken from the provider's own `usage.cost` when it is present, because
// that is the authoritative number and matches what the key's limit is measured
// against. When it is absent the cost is computed from live pricing and marked
// as such in the ledger, so a reader can tell which figures were reported and
// which were derived. Never silently treat a derived number as a measured one.

import { fetchPricing } from './budget.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export class OpenRouterClient {
  // A reasoning model asked to think at length can legitimately take minutes on
  // a single call, and aborting early does not stop the provider completing and
  // billing it — it only stops us recording the result. At 120s this censored
  // the arm with the longest prompts hardest, which is the same asymmetric loss
  // that truncation caused, arriving by a different route.
  constructor({ apiKey, model, pricing, timeoutMs = 600_000, maxRetries = 3 }) {
    this.apiKey = apiKey;
    this.model = model;
    this.pricing = pricing;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
  }

  static async create({ apiKey, model, timeoutMs }) {
    const pricing = await fetchPricing(model);
    if (!pricing.supports_tools) {
      throw new Error(`${model} does not advertise tool support, which the agent loop requires.`);
    }
    return new OpenRouterClient({ apiKey, model, pricing, timeoutMs });
  }

  async chat({ messages, tools, temperature = 0, maxTokens = 1024 }) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'cairn-benchmarks',
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            ...(tools ? { tools } : {}),
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          if (RETRYABLE.has(res.status) && attempt < this.maxRetries) {
            lastError = new Error(`${res.status}: ${body.slice(0, 200)}`);
            continue;
          }
          throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
        }

        const json = await res.json();
        if (json.error) throw new Error(`OpenRouter error: ${JSON.stringify(json.error).slice(0, 300)}`);

        const usage = json.usage ?? {};
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;

        let costUsd;
        let costSource;
        if (typeof usage.cost === 'number') {
          costUsd = usage.cost;
          costSource = 'provider';
        } else {
          costUsd =
            promptTokens * this.pricing.prompt_usd_per_token +
            completionTokens * this.pricing.completion_usd_per_token;
          costSource = 'computed';
        }

        return {
          message: json.choices?.[0]?.message ?? null,
          finishReason: json.choices?.[0]?.finish_reason ?? null,
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            cost_usd: costUsd,
            cost_source: costSource,
          },
          raw_id: json.id,
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          lastError = new Error(`request timed out after ${this.timeoutMs}ms`);
          if (attempt < this.maxRetries) continue;
          throw lastError;
        }
        if (attempt < this.maxRetries && RETRYABLE.has(Number(err.message?.slice(0, 3)))) {
          lastError = err;
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new Error('request failed');
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
