# Benchmarks

Every number in this repository's documentation comes from here and can be
recomputed by running it. Tiers 1 and 2 need no API key and no account. Tier 3
costs about ten cents against a rate-limited key.

```console
cd benchmarks && npm install
npm run tokens      # tier 1, free
npm run deontic     # tier 2, free, runs locally on CPU
npm run estimate    # tier 3, prices the run without spending
npm run adherence   # tier 3, the paid run
```

## What this does not show

Read this first, because the honest summary is narrower than the pitch.

- **Cairn is not measurably better at making agents follow rules** than the
  alternatives we tested. We looked, with a pre-registered comparison, and found
  nothing. What we found instead was a large cost difference.
- **The instructions file we tested against was 2,250 tokens.** Real
  repositories accumulate files several times that size, and long-context recall
  degrades with length. Our null result for "delivery mechanism does not matter"
  may not survive against a realistic file. **This is untested.** The harness for
  it is built and unused; see *Deferred* below.
- **Portability is not measured at all.** The argument that one in-repo file
  beats per-vendor memory silos is structural, not behavioural. No benchmark here
  supports it, and none could.
- **20 paired tasks, one model, one sample per cell.** This detects large
  differences and nothing subtle.

## Prior work

Gloaguen, Mündler, Müller, Raychev and Vechev, *"Evaluating AGENTS.md: Are
Repository-Level Context Files Helpful for Coding Agents?"*,
[arXiv:2602.11988](https://arxiv.org/abs/2602.11988), ICLR 2026 Workshop on
Memory for LLM-Based Agentic Systems.

Their abstract reports that context files "do not generally improve task success
rates, while increasing inference cost by over 20% on average", and — the finding
that matters most for a tool like this one — that **instructions in context files
were followed, while repository overviews were ineffective.**

Anchors are instructions, not overviews. That is the category their work found
effective, which is a reason to build this and not a proof that it works. Their
result was the reason our own hypothesis was pre-registered as genuinely open.

We do not quote their per-benchmark percentages. Several figures circulating in
secondary coverage do not match the paper, and we got two of them wrong before
checking.

## Tier 1 — what the context costs to send

| Artifact | tokens (o200k) |
|---|---|
| `cairn context --scope src/verify` | 437 |
| `cairn context` (all 7 anchors) | 1,009 |
| One generated instruction file | ~343 |
| All 7 anchor files | 1,390 |

**This is a floor, not a cost.** A token count says what context costs to send.
It says nothing about what it costs to act on, which is where the real expense
sits. Tier 3 measures that, and the two numbers do not resemble each other. Any
claim citing this tier has to carry the distinction.

→ [`results/tokens.json`](../benchmarks/results/tokens.json)

## Tier 2 — embeddings cannot tell a rule from its negation

40 engineering constraints, each written four ways: the rule, a plausible
negation, a paraphrase preserving meaning, and a natural query an agent might
issue. Runs locally on CPU through transformers.js, so anyone can reproduce it.

| Encoder | rule vs own negation | rule vs paraphrase | inversions | top-1 was the negation |
|---|---|---|---|---|
| all-MiniLM-L6-v2 | 0.856 | 0.546 | 38/40 (95%) | 19/40 |
| all-mpnet-base-v2 | 0.845 | 0.585 | 38/40 (95%) | 14/40 |
| bge-base-en-v1.5 | 0.865 | 0.733 | 35/40 (88%) | **28/40** |
| gte-base | 0.938 | 0.870 | 36/40 (90%) | 26/40 |

An *inversion* is an item where the rule scores at least as close to its own
negation as to a restatement of itself. Across every encoder that is the common
case, not the exception. In a retrieval pool holding both polarities, both
appeared in the top 3 for 77–85% of queries — so the ranking cannot be used to
tell which one governs.

The retrieval-*tuned* encoders were the worst at polarity. They optimise topical
relevance, and "use X" and "never use X" are maximally on-topic with each other.

**Scope of the claim.** This measures single-vector cosine retrieval, which is
what lightweight memory tooling typically does. A cross-encoder reranker or an
LLM filter over the candidates could recover polarity; those are untested here.
The corpus is ours, and the negations are minimal edits of the rules by design,
which is the hard case.

→ [`results/deontic.json`](../benchmarks/results/deontic.json)

## Tier 3 — adherence, and what it costs

Four arms over identical tasks in a sandboxed agent loop with real tools.
Parameters were fixed in
[`PREREGISTRATION.md`](../benchmarks/PREREGISTRATION.md) before the first paid
call, because arm C has knobs — the length of the file and where the rule sits
inside it — that can be tuned until the control performs however the author
wants.

Each task seeds a small repository where **the existing files already violate the
rule**, so an agent following local convention breaks it. Without that property
every arm passes and the experiment measures nothing.

| Arm | Context given | adherence | task success | turns | $/run | Δ cost vs A |
|---|---|---|---|---|---|---|
| **A** | none | 8/20 · 40% | 18/20 | 4.55 | $0.00103 | — |
| **B** | scoped anchor | 18/20 · 90% | 20/20 | 4.35 | $0.00112 | **+9%** |
| **C** | rule buried in a 2,250-token file | 18/19 · 95% | 19/19 | 4.47 | $0.00260 | **+152%** |
| **D** | embedding top-3 | 18/20 · 90% | 20/20 | 4.50 | $0.00123 | +19% |

Paired sign tests, within task:

```
B vs A   B-only=10  A-only=0   discordant=10   p=0.002   significant
B vs C   B-only=0   C-only=1   discordant=1    p=1.0     no detectable difference
B vs D   B-only=1   D-only=1   discordant=2    p=1.0     no detectable difference
```

**Zero regressions.** On no task, in no arm, did adding the rule cause a failure
the baseline did not have. Given that the prior work above found context files
reducing success, that is worth stating plainly.

Grading is mechanical — a pattern over the files the agent wrote. No model judges
another model's output, because a judged headline number cannot be checked by a
reader. The patterns are themselves tested against hand-written violating and
compliant fixtures for all 20 tasks
([`test/graders.test.js`](../benchmarks/test/graders.test.js)), since a wrong
pattern produces a wrong number that re-running cannot fix.

→ [`results/adherence.json`](../benchmarks/results/adherence.json), with raw
per-run records in
[`runs-z-ai-glm-5-3-flash.jsonl`](../benchmarks/results/runs-z-ai-glm-5-3-flash.jsonl)

### The instrument was wrong twice

Both caught before publication, both recorded rather than quietly fixed.

**Vacuous adherence.** An agent that wrote nothing scored as adherent — no code,
so no pattern to violate. Non-attempts are now excluded from the rate and counted
separately.

**Truncation biased against arm C.** At a 4,096-token completion limit, 55% of
arm C's runs were cut off mid-reasoning, because a longer prompt induces longer
deliberation. The surviving runs were the ones where the model happened to think
less. Left unfixed this would have published "long instruction files break
agents", which was purely our configuration. The discarded dataset is kept as
[`adherence-truncated-maxtokens-bug.json`](../benchmarks/results/adherence-truncated-maxtokens-bug.json).

## Budget

Tier 3 spends real money, so the guard is four layers deep, in decreasing order
of how much each can be trusted: a provider-side credit limit on the key; a
pre-flight check that refuses to start without one; a ledger written after every
call that aborts at a ceiling below that limit; and a dry run that prices the
whole matrix without spending.

The ledger reconciles against the provider's own usage figure, because a request
abandoned on timeout is still billed but never returns a response to record — we
found ours under-counting by about 3% that way.

The published run cost **$0.2469** in total.
→ [`results/spend.json`](../benchmarks/results/spend.json)

## Deferred

An exploratory arm C at 6,084 tokens — a realistic 35-section engineering
handbook rather than a short list — is built and **not run**: `corpus/handbook.md`,
behind `--long-handbook`, writing to separate result files so it can never
overwrite the pre-registered comparison. Any result from it will be reported as
post-hoc and kept apart from the pre-registered numbers.

Also not run, deliberately: a wrong-anchor experiment measuring the damage an
*incorrect* anchor does. It is the natural counterpart to measuring the benefit
of a correct one, and it belongs in a later iteration.

## Rerun it against your own model

The binding constraint on all of this was a $2 key. The harness takes `--model`
and `--tasks`, so the interesting version of this experiment — a frontier model,
more tasks, repeated samples — is a command away for anyone who wants to run it.

```console
node run.js adherence --model <any tool-calling model on OpenRouter> --tasks 20
```
