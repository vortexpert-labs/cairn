# Tier 3 pre-registration

Written and committed before the first paid API call. Arms, tasks, metrics, and
the analysis are fixed here so that none of them can be adjusted after seeing a
result. Where this document and a later write-up disagree, this document is what
was actually planned.

## Why this is pre-registered at all

Arm C — the same rule buried in a long instructions file — has tunable knobs.
How long the file is, and where in it the rule sits, can be adjusted until arm C
performs however the author would like. A benchmark whose control arm is tunable
after the fact can produce any conclusion, so its parameters are fixed below and
the values are in version control before the run.

## The open question

Cairn's premise is that an agent given a scoped, explicitly retrieved constraint
obeys it more reliably than one given the same constraint through the usual
channels. That premise has not been demonstrated, and there is published work
pointing the other way.

Gloaguen, Mündler, Müller, Raychev and Vechev (ETH Zurich) evaluated agent
instruction files across real repository tasks and found LLM-generated
`AGENTS.md` files reduced success and raised cost, with human-written files
raising success slightly at a similar cost premium. Agents followed the
instructions and did more work as a result, and the extra work was frequently
unnecessary. Every figure from that paper must be checked against the paper
itself before it is cited anywhere in this repository; the summary here is a
paraphrase written from notes and is not a citable source.

Two consequences are already binding on this design:

- **Cost is behavioural.** Token count is not cost. The harness therefore
  measures turns and total spend per task, not prompt size.
- **The hypothesis may fail.** The instructions that hurt in that study were
  procedural — they told agents to do more. Anchors are prohibitive; they prune a
  branch. Whether that inverts the cost profile is the question, not a
  foregone conclusion.

## Arms

Every arm sees the same task, the same workspace and the same tool loop. Only
the context differs.

| Arm | Context given to the model |
|---|---|
| **A** | No project rules at all. Floor. |
| **B** | The output of `cairn context --scope <task scope>`: the governing constraint and its rationale, and nothing else. |
| **C** | The identical constraint text, embedded in a long generic instructions file. |
| **D** | The identical constraint text, retrieved by embedding top-k from a pool of all constraints in the corpus. |

**A vs B** only shows that telling a model something helps, which is not in
doubt. **B vs C** and **B vs D** are the comparisons this tier exists to answer:
whether scoped retrieval beats the two things a team would otherwise do.

### Arm C parameters, fixed now

- The instructions file is assembled from the constraints of all other tasks in
  the corpus plus generic engineering guidance, to a target of **2,000–2,500
  o200k tokens**.
- The task's own constraint is placed at a **fixed relative position of 0.5**
  (the midpoint), chosen before running anything because middle placement is the
  documented weak spot for long-context recall. Placing it at the start would
  flatter arm C and placing it at the end would flatter arm B.
- The same assembled file is used for every task, with only the target
  constraint's position held at the midpoint.

### Arm D parameters, fixed now

- Model: `Xenova/all-MiniLM-L6-v2`, the same encoder measured in Tier 2.
- Pool: the `constraint` text of every task in the corpus.
- Query: the task request text.
- k = 3, injected in rank order.
- No reranker. This arm is naive semantic retrieval on purpose; it is the thing
  Tier 2 measured, now placed in front of an agent.

## Tasks and grading

Each task is a small workspace, a feature request that does not mention the rule,
and one project rule. **The seeded files already violate the rule**, so following
local convention breaks it. Without that property every arm passes and the
experiment measures nothing.

Grading is mechanical, by regular expression over the files the agent wrote:

- **Adherence** — the violation pattern is absent from written files (or, for
  positively-graded tasks, the required pattern is present).
- **Task success** — the requested change is actually present.
- **Cost** — turns, tool calls, tokens and dollars, taken from the provider's own
  usage figures.

No model grades another model's output. An LLM judge would make the headline
number impossible for a reader to recompute, which defeats the purpose of
publishing the harness.

Adherence and success are scored separately and reported separately. An agent
that obeys the rule by doing nothing has adhered and failed, and collapsing the
two would hide that.

## Sample size, and its limit

The corpus holds **20 tasks**. The main run is 20 tasks × 4 arms × 1 sample =
**80 agent runs**. A separate noise probe repeats **8 tasks × 4 arms × 3 samples**
to estimate run-to-run variance at temperature 0, since providers are not
reliably deterministic even there.

**This is underpowered and the write-up must say so.** With 20 paired
observations, only a large difference is detectable — roughly 35 percentage
points or more at conventional power. A null result therefore means "this run
could not detect a difference", never "there is no difference". Any published
summary that states the second thing from this data is wrong.

The binding constraint is a $2 key. The mitigation is not to overclaim: the
harness takes `--model` and `--tasks`, so a reader with their own key can rerun
it at any scale, on any model, including the frontier models this budget cannot
reach.

## Analysis

- Arms are compared **paired within task**, since every arm sees identical tasks.
- Primary comparisons: **B vs C** and **B vs D**, on adherence.
- Secondary: B vs A on adherence; all arms on task success; all arms on turns and
  cost.
- Discordant-pair counts are reported alongside every proportion, because with
  20 tasks the discordant count is the real sample size for a paired test.
- Exact per-run records go in `results/adherence.json`. Every published figure
  must be recomputable from that file.

## Budget

- Provider-side credit limit on the key is the real ceiling.
- Pre-flight refuses to start without a limit set, or with less remaining than
  the estimate, or with under an hour before key expiry.
- The run aborts at a **$1.50** soft ceiling, below the key's cap so that a bug
  in this code still leaves room.
- Per-call sanity limit of $0.05; a single call above it stops the run.
- The ledger at `results/spend.json` is written after every call.

## Committed before seeing results

The outcome is published either way, including "B is no better than C", "B is no
better than D", or "B costs more". The reason for saying so in advance is that
the project's other claims rest on this directory being run honestly, and a
benchmark only published when favourable is worth nothing.

---

# Amendments

Recorded after the fact. The document above is what was planned; this section is
what actually happened where it differed. Nothing above has been edited, because
a pre-registration that is rewritten to match its results is not one.

## 2026-08-31 — the cited study was checked, and two figures were wrong

The plan required verifying every figure attributed to the ETH Zurich work before
citing it. That check has now been done against the paper rather than against
secondary coverage.

The study is real: Gloaguen, Mündler, Müller, Raychev and Vechev, *"Evaluating
AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?"*,
arXiv [2602.11988](https://arxiv.org/abs/2602.11988), ICLR 2026 Workshop on
Memory for LLM-Based Agentic Systems.

Corrections to the summary written above:

- The figures given as "−3% success" and "+19% cost" came from blog coverage, not
  from the paper, and must not be repeated. The paper's own abstract states that
  context files "do not generally improve task success rates, while increasing
  inference cost by over 20% on average."
- The scope was understated. The work spans SWE-bench Lite as well as AGENTbench,
  not the 138-task benchmark alone.
- One finding that was missed, and which bears directly on this tier: the paper
  reports that **instructions in context files were followed, while repository
  overviews were ineffective**. Anchors are instructions, not overviews, so the
  paper separates the category Cairn occupies from the category that failed. This
  was not known when the arms were designed, and did not influence them.

## 2026-08-31 — deviations from the plan as written

- **The noise probe was not run.** The plan specified 8 tasks × 4 arms × 3
  samples to estimate run-to-run variance at temperature 0. It was dropped. Every
  cell in the published result is therefore a single sample, and no measurement of
  within-cell variance exists. Read the per-arm rates accordingly.
- **The completion-token limit was raised twice during execution**, from 1,024 to
  4,096 and then to 16,384. At both lower values the model was being cut off
  mid-reasoning, and because a longer prompt induces longer deliberation, the
  truncation fell hardest on arm C — 55% of its runs at 4,096. That censored arm C
  to a biased surviving subsample. Runs cut off at the limit are excluded from all
  rates and reported separately as invalid. The discarded 4,096 dataset is kept as
  `results/adherence-truncated-maxtokens-bug.json`.
- **The request timeout was raised from 120s to 600s** for the same reason: eight
  runs, five of them arm C, were abandoned client-side while still being billed.
- **Runs were parallelised** four at a time after the token limit made sequential
  execution impractically slow. Runs share no state and each gets its own
  workspace.
- **A ledger reconciliation step was added.** Abandoned timeouts are billed by the
  provider but never recorded locally, so the ledger under-counted real spend by
  about 3%. It now adopts the provider's authoritative usage figure at startup.

## 2026-08-31 — the realistic-length arm C is deferred

The pre-registered arm C is 2,250 tokens. That is small enough that a current
model has little difficulty locating one rule inside it, so the null result for
B vs C should be read as "the rule was found", not as "instruction files hold up
at the sizes teams accumulate".

An exploratory variant is built and ready — `corpus/handbook.md`, 6,084 tokens of
ordinary engineering guidance, with the governing rule inserted at the same 0.5
position — behind the `--long-handbook` flag, writing to separate result files so
it cannot overwrite the pre-registered run. It has not been executed. Any result
from it will be reported as exploratory and post-hoc, never folded into the
pre-registered comparison.
