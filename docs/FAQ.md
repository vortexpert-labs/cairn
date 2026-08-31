# FAQ

## Isn't this just ADRs?

For the `DECISION` type, largely yes, and Architecture Decision Records deserve
the credit. Michael Nygard described them in
[November 2011](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html):
short markdown files in the repository, numbered sequentially with numbers never
reused, moving through proposed → accepted → deprecated or superseded, with a
reversed decision kept and marked rather than deleted. That is the same
lifecycle Cairn uses, and [MADR](https://adr.github.io/) and Zimmermann's
Y-Statement have refined the format since. Anyone claiming to have invented
decision records in 2026 is not being straight with you.

What is actually different:

- **A linter that fails your build.** ADRs are a convention. Cairn is a checker
  with a specification behind it — every MUST maps to a check that runs, the
  transitions are enforced against git history, and an unparseable record is an
  error rather than a file that quietly disappears.
- **Records are addressed to paths.** An anchor carries a `scope`, so
  `cairn why src/billing` returns what governs that directory. ADRs are a
  chronological folder you read start to finish.
- **The audience includes machines.** The same record reaches Claude Code,
  Cursor and Copilot through generated instruction files, editor hooks and an MCP
  server. ADRs assume a human opens the folder.
- **`REJECTED_PATH` is a first-class type.** "We tried this and it failed" is
  distinct from an alternative that was merely considered, and it is the thing
  agents most need and most often re-propose.
- **Constraints can carry a check.** A `CONSTRAINT` may hold a shell command that
  proves it still holds, so a subset of the record is machine-verifiable rather
  than aspirational.

If you already keep ADRs and they work for you, keep them. `cairn migrate` exists
if you want the checking.

## There's a study saying context files make agents worse. Doesn't that sink this?

It is the most relevant prior work and we pre-registered our own experiment
against it rather than around it.

Gloaguen, Mündler, Müller, Raychev and Vechev,
[arXiv:2602.11988](https://arxiv.org/abs/2602.11988), found that repository
context files "do not generally improve task success rates, while increasing
inference cost by over 20% on average". The finding that matters here is the
distinction they draw: **instructions in context files were followed, while
repository overviews were ineffective.**

Anchors are instructions and prohibitions, not overviews. That is the category
their work found effective — which is a reason to build this, not evidence that
it works.

Our own measurement found no regression: across 80 runs, adding a scoped anchor
never caused a failure the baseline did not have, and it added 9% to task cost
rather than the 20%+ they observed for whole context files. That is one small
study on one model and it does not overturn theirs. See
[BENCHMARKS.md](BENCHMARKS.md).

## Does it actually make agents follow rules better?

Better than nothing, clearly: adherence went from 40% to 90% across 20 tasks.

Better than the alternatives — the same rule in an instructions file, or fetched
by embedding search — **no.** We looked with a pre-registered comparison and
found no measurable difference. What we found was a cost difference: the scoped
anchor added 9% against the instructions file's 152%, for the same result.

So the honest case for Cairn is portability, review, and cost — not superior
rule-following. If someone tells you a decision-record tool makes your agent
smarter, ask for their numbers.

## Why not just write a good AGENTS.md?

For getting a rule obeyed, our benchmark says that works about as well. Three
things it does not give you:

It is one file per vendor. Claude Code, Cursor, Copilot, Windsurf and the rest
each read their own, so the same constraints get retyped and then drift apart.
Cairn generates all of them from one source and fails CI when they diverge.

It has no lifecycle. When a rule is reversed, someone edits a paragraph and the
reasoning that produced the old rule is gone. Anchors supersede rather than
overwrite, so the history survives and `cairn timeline` can show it.

It is unscoped. Everything in it is sent for every task, which is where the 152%
came from. `cairn context --scope src/billing` sends the rules for billing.

## Won't this rot like every other documentation system?

Probably, if nobody maintains it. This is the honest risk and no benchmark
addresses it.

The mitigations are structural rather than motivational. The bar for what counts
is deliberately high, so the store stays small enough to read. The agent drafts
so nobody has to remember a command, and it drafts *silently* so it never costs
an interruption. Ratification is batched into pull request review rather than
asking for a new ritual. `cairn review` surfaces anchors whose scope has churned
and anchors whose own `revisit_if` condition may now be met.

None of that guarantees anything. Documentation systems die of neglect and this
one can too.

## Why not semantic search over the anchors?

Because we measured it and it does not work. Across four embedding models, a
constraint sits closer to its own negation than to a paraphrase of itself in
87–95% of cases, and naive retrieval returned the *opposite* of the governing
rule as its top hit in up to 28 of 40 queries. Cosine similarity encodes topic,
and "use X" and "never use X" are the same topic.

Anchors are addressed by scope — a path or a glob — which is exact and cannot
invert a prohibition. Full numbers in
[BENCHMARKS.md](BENCHMARKS.md#tier-2--embeddings-cannot-tell-a-rule-from-its-negation).

## `verify` runs shell commands. Is that safe?

It is off by default and cannot be turned on from inside the repository being
checked. Enabling it requires a CLI flag or an uncommitted local config, so
cloning an untrusted repository and running `cairn check` never executes that
repository's code. A committed file can never authorise its own execution — if it
could, a malicious repository would simply commit one.

Treat enabling it as the same decision as running any other build script from a
repository.

## Does it phone home?

No. There is no telemetry, no version check and no account.

## Does it work in a monorepo?

Yes, with one `.cairn/` at the root. `scope` carries package paths, so
`packages/api/**` governs that package and `cairn why packages/api/src/auth.ts`
resolves correctly. One index, one graph, one timeline.

## What if I don't use coding agents?

`cairn why <path>` and `cairn timeline` are useful to people, and the checker
keeps the record honest. But the portability argument is the strongest one and it
assumes several agents, so if you have none of them an ADR folder is probably
enough.

## How many anchors should a project have?

Tens, not thousands. Anchors are loaded whole, which is a deliberate design limit
rather than an oversight: the discipline of the format is keeping the count low.
If you have a thousand, the record has become a wiki and nobody is reading it.

## Can I remove it?

`cairn uninstall` removes every generated adapter block and leaves `.cairn/`
alone. Delete the directory and nothing remains. Easy to abandon is a reasonable
thing to ask of a convention, and it costs almost nothing to support.
