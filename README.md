# Cairn

A checked, versioned record of the decisions and constraints your project runs
on, for the people and the coding agents who work in it.

> A cairn is a stack of stones left by earlier travellers to mark the route for
> whoever comes next — including the paths that don't go anywhere.

```console
$ cairn why src/ledger
src/ledger — 3 anchors govern this path

  ANC-0003  FINDING        Ledger writes saturate above 200 per second  src/ledger
            Sustained ledger writes above roughly 200 per second cause lock contention, and the
            retries are silent.

  ANC-0004  DECISION       Postgres as the ledger store  src/ledger
            Ledger entries are stored in Postgres, with PgBouncer in transaction pooling mode.
            ruled out: Staying on SQLite — Cannot pass the write ceiling measured in ANC-0003.
            ruled out: DynamoDB — The ledger needs multi-row transactions, and nobody here has run
            it in production.
            revisit if: sustained write volume stays under 50 per second for two consecutive
            quarters
            supersedes ANC-0002

  ANC-0005  CONSTRAINT     Ledger rows are append only  src/ledger
            Ledger rows must never be updated or deleted. Corrections are recorded as new,
            offsetting rows.
```

That is a real command against [`examples/ledger-service`](examples/ledger-service).

## Why

Claude Code has memory. Cursor has memories. Copilot has instructions. Every one
of them is a vendor silo: none transfer between tools, none appear in a diff, and
none survive a teammate cloning the repository. So the same constraints get
retyped into each agent, and the reasoning behind them — what was tried, what was
ruled out and why — lives in a chat log nobody can search.

`.cairn/` is a directory of markdown files in your repository. Every agent and
every person reads the same thing, it is reviewed like code because it is in the
diff, and `git blame` says who agreed to each rule and when.

## Install

```console
npm install -D @vortexpert-labs/cairn     # or: npx @vortexpert-labs/cairn init
```

Node 20 or newer. No runtime dependencies — the JSON Schema validator and the
frontmatter parser are written in-tree, because this is installed with `npx` into
repositories nobody has audited.

```console
cairn init                       # create .cairn/ with a schema, index and stage
cairn adapters --write           # generate the instruction files each agent reads
cairn why src/billing            # what governs this path, and why
cairn check --strict             # one line for CI
```

## Anchors

An anchor is one settled thing, in one file, with the reasoning attached.

| Type | What it records |
|---|---|
| `GOAL` | What the project is trying to achieve. |
| `STAGE` | What phase it is in, which changes what is acceptable. |
| `DECISION` | We chose X over Y — and what Y was. |
| `CONSTRAINT` | A rule that must hold. May carry a shell check. |
| `FINDING` | Something learned that the code does not show. |
| `REJECTED_PATH` | We **tried** it and it failed. Distinct from an alternative, which was only considered. |

`REJECTED_PATH` is the one nothing else in this space records, and it is usually
the most expensive knowledge to lose: without it, the next agent proposes the
approach you abandoned in March and you spend the afternoon explaining why not.

Anchors move through `PROPOSED → ACTIVE → SUPERSEDED | INVALIDATED | RETIRED`.
`cairn check` enforces the transitions, reads git history to catch edits to
anchors that were already ACTIVE, and refuses a half-applied supersession.

## Recording

The hard part of a decision record is not writing it. It is noticing that a
decision happened. That is what killed ADRs, and asking people to remember a
command does not fix it.

So the agent drafts. While it works, it watches for the things worth keeping —
you rejecting an approach that was tried, a rule stated with universal scope, a
choice between named options — and writes them as `PROPOSED` without interrupting
you. A draft governs nothing: `cairn context`, which is what hooks and the MCP
server inject, emits `ACTIVE` anchors only.

You decide in batch, where a review is already happening:

```console
cairn review --proposed               # what is waiting, with commands ready to paste
cairn status ANC-0012 ANC-0013 ACTIVE # accept several at once
cairn decline ANC-0014 --reason "..." # reject, and remember not to propose it again
```

The bar for drafting is deliberately lower than the bar for accepting. A draft
you did not want costs seconds to decline; a decision nobody recorded is gone.

## Delivery

| Layer | Guarantee | Where |
|---|---|---|
| `cairn check` in CI | Deterministic | Everywhere |
| Constraint `verify` commands | Deterministic, opt-in, off by default | Everywhere |
| Agent hooks | Deterministic — injects scoped anchors, can block a violating write | Platforms with hooks |
| MCP server | Structured retrieval | Every MCP-capable agent |
| Generated instruction files | Probabilistic | Everywhere |

See [docs/PLATFORMS.md](docs/PLATFORMS.md) for what is verified on each platform,
with a first-party link per claim.

## What the measurements say

Every figure here comes from [`benchmarks/`](benchmarks) and can be recomputed by
running it. Two of the three tiers need no API key.

**Retrieving rules by embedding similarity does not work.** Across four encoders
and 40 constraint sets, a rule sits closer to its own negation than to a
paraphrase of itself in 87–95% of cases. Asking naive semantic search for the
rule governing a subject returned the *opposite* rule as the top hit in up to 28
of 40 queries. Cairn addresses anchors by scope, not by similarity, and this is
why. → [`results/deontic.json`](benchmarks/results/deontic.json)

**Giving an agent the governing rule works.** Adherence went from 40% to 90%
across 20 tasks, four arms, 80 runs. → [`results/adherence.json`](benchmarks/results/adherence.json)

**How you deliver the rule made no measurable difference.** A scoped anchor, the
same rule buried in an instructions file, and embedding retrieval all landed
within noise of each other. We looked for an advantage here and did not find one.

**The difference that does exist is cost.** Against no context at all, the scoped
anchor added 9% to the cost of a task; the same rule inside an instructions file
added 152%. No arm regressed against the baseline on any task.

These runs are small — 20 paired tasks on one model, single-sampled. They detect
large differences and nothing subtle, so read the nulls as "this run could not
find a difference", never as "there is none". The control instructions file was
2,250 tokens, which is smaller than the ones real repositories accumulate; that
limitation is untested and stated in full in
[docs/BENCHMARKS.md](docs/BENCHMARKS.md).

## When not to use Cairn

- **If a linter can check it, write the linter.** A rule a machine can enforce
  deterministically does not belong in a document that asks a model politely.
- **Anchors are context, not a sandbox.** A hook can block a write on a governed
  path; nothing here contains an agent that is determined to do something else.
- **Not for tasks, status, or session notes.** `.cairn/` holds what was settled,
  not what happened. A hundred anchors is a wiki nobody reads.
- **Not for explaining what the code does.** The code is authoritative about
  that. Anchors carry the part the code cannot say: why, and what was ruled out.
- **Small solo projects probably do not need it.** One agent, one person, short
  memory horizon — an instructions file is fine and cheaper.

## No telemetry

The CLI reports nothing, anywhere. There is no analytics, no version ping, and no
account.

## Documentation

- [The Cairn Specification](SPECIFICATION.md) — the normative format
- [Adopting Cairn](docs/ADOPTING.md) — bringing it to an existing repository
- [Platforms](docs/PLATFORMS.md) — verified support, per agent
- [Benchmarks](docs/BENCHMARKS.md) — what was measured, and what it does not show
- [Architecture](docs/ARCHITECTURE.md) — module map and the adapter contract
- [Design rationale](docs/DESIGN_RATIONALE.md) — what was rejected, and why
- [FAQ](docs/FAQ.md)

## License

Apache-2.0.
