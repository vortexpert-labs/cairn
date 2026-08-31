// Tier 2 — deontic similarity.
//
// The question: can embedding similarity distinguish a constraint from its own
// negation? If it cannot, then retrieving project rules by semantic search can
// hand an agent the opposite of the rule that actually governs, which is the
// argument for Cairn addressing anchors by scope rather than by similarity.
//
// Two measurements, both deterministic:
//
//   1. Pairwise separation. For every item, compare sim(rule, negation) against
//      sim(rule, paraphrase). A paraphrase means the same thing in different
//      words and is what retrieval should rank highly; a negation means the
//      opposite and is what retrieval must rank lower. An inversion is an item
//      where the negation scores at least as high as the paraphrase.
//
//   2. Retrieval simulation. Pool every rule and every negation, issue the
//      natural-language query for each item, and inspect the ranking. This is
//      the operational form of the same question.
//
// Scope of the claim: this measures single-vector cosine retrieval, which is
// what lightweight memory tooling typically does. A cross-encoder reranker or an
// LLM filter over the candidates could recover polarity, and this tier does not
// test those. The finding is about naive semantic search, and the write-up must
// say so.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS, loadExtractor, embed, cosine, describe, round } from './embed.js';

const TOP_K = 3;

export async function runDeontic({ root, only = null }) {
  const corpusPath = join(root, 'corpus', 'constraints.json');
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
  const items = corpus.items;

  const models = only ? MODELS.filter((m) => only.includes(m.label)) : MODELS;
  if (models.length === 0) throw new Error(`no models matched: ${only}`);

  const results = { generated_at: new Date().toISOString(), corpus_size: items.length, models: [] };

  for (const model of models) {
    process.stdout.write(`\n${model.label} (${model.params}) — loading… `);
    let extractor;
    try {
      extractor = await loadExtractor(model.id);
    } catch (err) {
      console.log(`unavailable, skipped (${err.message.split('\n')[0]})`);
      continue;
    }
    process.stdout.write('embedding… ');

    const rules = await embed(extractor, items.map((i) => i.rule));
    const negations = await embed(extractor, items.map((i) => i.negation));
    const paraphrases = await embed(extractor, items.map((i) => i.paraphrase));
    const queries = await embed(extractor, items.map((i) => model.queryPrefix + i.query));
    console.log('done');

    // ---- 1. pairwise separation -------------------------------------------
    const perItem = items.map((item, i) => {
      const vsNegation = cosine(rules[i], negations[i]);
      const vsParaphrase = cosine(rules[i], paraphrases[i]);
      const others = items
        .map((_, j) => (j === i ? null : cosine(rules[i], rules[j])))
        .filter((x) => x !== null);
      const unrelated = others.reduce((s, x) => s + x, 0) / others.length;
      return {
        id: item.id,
        domain: item.domain,
        rule_vs_negation: round(vsNegation),
        rule_vs_paraphrase: round(vsParaphrase),
        rule_vs_unrelated_mean: round(unrelated),
        inverted: vsNegation >= vsParaphrase,
      };
    });

    const inversions = perItem.filter((p) => p.inverted);

    // ---- 2. retrieval simulation ------------------------------------------
    // Pool holds both polarities of every rule, which is the situation a
    // decision log lands in once a rule has been reversed or debated.
    const pool = [];
    items.forEach((item, i) => {
      pool.push({ item: i, polarity: 'rule', vec: rules[i] });
      pool.push({ item: i, polarity: 'negation', vec: negations[i] });
    });

    const retrieval = items.map((item, i) => {
      const ranked = pool
        .map((entry, idx) => ({ idx, item: entry.item, polarity: entry.polarity, score: cosine(queries[i], entry.vec) }))
        .sort((a, b) => b.score - a.score);

      const top = ranked[0];
      const topK = ranked.slice(0, TOP_K);
      const ownRuleRank = ranked.findIndex((r) => r.item === i && r.polarity === 'rule') + 1;
      const ownNegationRank = ranked.findIndex((r) => r.item === i && r.polarity === 'negation') + 1;

      let outcome;
      if (top.item !== i) outcome = 'wrong_subject';
      else if (top.polarity === 'rule') outcome = 'correct';
      else outcome = 'negation';

      return {
        id: item.id,
        outcome,
        own_rule_rank: ownRuleRank,
        own_negation_rank: ownNegationRank,
        negation_outranks_rule: ownNegationRank < ownRuleRank,
        both_polarities_in_top_k: topK.some((r) => r.item === i && r.polarity === 'rule')
          && topK.some((r) => r.item === i && r.polarity === 'negation'),
        top_score: round(top.score),
        margin_rule_over_negation: round(
          ranked[ownRuleRank - 1].score - ranked[ownNegationRank - 1].score,
        ),
      };
    });

    const count = (fn) => retrieval.filter(fn).length;
    const summary = {
      model: model.label,
      model_id: model.id,
      params: model.params,
      note: model.note,
      separation: {
        rule_vs_negation: describe(perItem.map((p) => p.rule_vs_negation)),
        rule_vs_paraphrase: describe(perItem.map((p) => p.rule_vs_paraphrase)),
        rule_vs_unrelated: describe(perItem.map((p) => p.rule_vs_unrelated_mean)),
        inversions: inversions.length,
        inversion_rate: round(inversions.length / items.length),
        inverted_ids: inversions.map((p) => p.id),
      },
      retrieval: {
        top_k: TOP_K,
        pool_size: pool.length,
        correct: count((r) => r.outcome === 'correct'),
        negation_at_top1: count((r) => r.outcome === 'negation'),
        wrong_subject: count((r) => r.outcome === 'wrong_subject'),
        negation_outranks_rule: count((r) => r.negation_outranks_rule),
        negation_outranks_rule_rate: round(count((r) => r.negation_outranks_rule) / items.length),
        both_polarities_in_top_k: count((r) => r.both_polarities_in_top_k),
        both_polarities_in_top_k_rate: round(count((r) => r.both_polarities_in_top_k) / items.length),
        margin: describe(retrieval.map((r) => r.margin_rule_over_negation)),
      },
      per_item: perItem,
      per_query: retrieval,
    };

    results.models.push(summary);
    report(summary);
  }

  const outDir = join(root, 'results');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'deontic.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nwrote ${outPath}`);
  return results;
}

function report(s) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`
  ${s.model} (${s.params}) — ${s.note}

  similarity of a rule to…
    its own negation    mean ${s.separation.rule_vs_negation.mean}   median ${s.separation.rule_vs_negation.median}
    a paraphrase of it  mean ${s.separation.rule_vs_paraphrase.mean}   median ${s.separation.rule_vs_paraphrase.median}
    an unrelated rule   mean ${s.separation.rule_vs_unrelated.mean}   median ${s.separation.rule_vs_unrelated.median}

    inversions (negation scores >= paraphrase): ${s.separation.inversions}/${s.per_item.length}  ${pct(s.separation.inversion_rate)}

  retrieval over ${s.retrieval.pool_size} passages, both polarities present:
    top-1 correct rule        ${s.retrieval.correct}/${s.per_query.length}
    top-1 was the negation    ${s.retrieval.negation_at_top1}/${s.per_query.length}
    top-1 wrong subject       ${s.retrieval.wrong_subject}/${s.per_query.length}
    negation outranks rule    ${s.retrieval.negation_outranks_rule}/${s.per_query.length}  ${pct(s.retrieval.negation_outranks_rule_rate)}
    both polarities in top-${s.retrieval.top_k}   ${s.retrieval.both_polarities_in_top_k}/${s.per_query.length}  ${pct(s.retrieval.both_polarities_in_top_k_rate)}`);
}
