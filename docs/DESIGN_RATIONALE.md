# Design rationale

What was rejected, and why. Written in the first person because one person made
these calls and the reasoning is worth more than a neutral voice would be.

## The name

The project was called Anchor Protocol and published under that name. I renamed
it. "Anchor Protocol" is the Terra/Luna lending protocol whose collapse was
covered everywhere in 2022, and "Anchor" is Solana's dominant development
framework, which also uses the ⚓ emoji. A developer searching for a developer
tool would find neither of us. The records are still called anchors; only the
project name changed. → `ANC-0006`

I shipped it as a new repository rather than renaming the old one. With two
commits and no users, everything a rename preserves was worthless, while a clean
repository buys a history that reflects deliberate work from the first commit and
honest versioning — `@vortexpert-labs/cairn@1.0.0` is a first release rather than
pretending to be the second version of something never called that. The old
repository is archived read-only with a pointer, not deleted, because deleting
breaks existing links and reads as concealment.

## Rejected: a `SUSPECT` status

An anchor resting on an invalidated ancestor is suspect. Making that a stored
status would mean maintaining it — every invalidation would have to walk the
graph and rewrite files, and any missed update would leave a lie on disk. It is
derived at check time instead. The same reasoning applies anywhere a fact can be
computed from the graph: store the edges, compute the conclusions.

## Rejected: an `authority` field

The first version carried `authority: HUMAN_APPROVED | AGENT_PROPOSED |
SYSTEM_INVARIANT` alongside `status`. It was redundant — the governance rule is
already "agents create PROPOSED, people promote to ACTIVE" — and the two could
contradict each other, since `status: ACTIVE` with `authority: AGENT_PROPOSED`
was legal and meaningless. Who approved an anchor and when comes from `git blame`
on the status line, for free and with a real identity attached.

## Rejected: semantic retrieval of anchors

This was the obvious design. Embed the anchors, embed the agent's intent, return
the top k. I built the measurement instead of the feature, and it does not work:
across four encoders a constraint sits closer to its own negation than to a
paraphrase of itself in 87–95% of cases, and naive retrieval returned the
*opposite* of the governing rule as its top hit in up to 28 of 40 queries.

Cosine similarity encodes topic, and "use X" and "never use X" have identical
topics. Anchors are addressed by scope — a path or a glob — which is exact,
cheap, and cannot invert a prohibition. See
[BENCHMARKS.md](BENCHMARKS.md#tier-2--embeddings-cannot-tell-a-rule-from-its-negation).

## Rejected: promoting an anchor when the user restates it

Approving anchors one at a time is friction, and an appealing shortcut is to
treat repetition as consent: if someone states a rule that matches a pending
draft, promote it. Every implementation of "matches" that is cheap enough to be
worth it is semantic similarity, which is precisely the operation measured above
failing. The feature would promote a constraint at the moment its author said the
opposite of it.

Restatement now raises a draft's rank in review and does nothing else. There is
also a plainer objection: saying a thing is not the same as legislating it, and
people restate preferences casually all the time. → `ANC-0010`

## Rejected: background auto-journaling

The maintenance problem is real — almost nobody records decisions as they happen,
and that is what killed ADRs — so the tempting fix is to have the agent record
everything continuously. Two reasons not to.

The value of the record is inversely proportional to its volume. Twenty anchors
you trust beat five hundred you skim, and an agent recording every choice
produces a session journal, which is exactly what `.cairn/` is specified not to
hold.

And the prior work is discouraging: the ETH Zurich study found LLM-*generated*
context files were the harmful condition. Machine-written context that no person
approved made agents worse.

So the agent drafts on specific, high-signal triggers, and a person accepts.
Detection is silent and non-interrupting; ratification is batched into a review
that was happening anyway, because a process that needs a new ritual is a process
that will be skipped. → `ANC-0008`

## Rejected: a sixth status for declined drafts

When a person turns down a draft it needs to go somewhere, or the agent proposes
it again next week and people learn to stop reading proposals. `INVALIDATED`
means it was true and became false; `RETIRED` means it applied and no longer
does; `SUPERSEDED` needs a replacement. None of them fit.

Rather than add `DECLINED`, declined drafts leave the anchor set entirely and go
to `.cairn/declined.json`. A rejected suggestion is not settled knowledge, and
`.cairn/` holds what was settled. The ledger is committed rather than ignored,
because suppression that only exists on one machine lets a teammate's agent
re-propose what you already rejected.

## Rejected: a `promote` command

The plan called for one. Reading the code, `cairn status <id> ACTIVE` already was
promotion, already validated the transition and already updated the index. A
`promote` command would have been a second name for one operation. `status` now
takes several ids instead, which is what ratifying a batch needs.

## Rejected: a documentation site, and a web viewer

The specification, the platform matrix and the benchmarks are markdown in the
repository, rendered by GitHub. Mermaid renders natively there, so the decision
graph needs no build step, no JavaScript and no hosting. A site is a thing to
maintain and a thing to rot, and there is no audience yet to justify either.
Revisit when there is.

A graph viewer was cut for the same reason, plus a sharper one: it contradicts
the pitch. The claim is markdown, git and a linter. Shipping a dashboard would
mean the claim was not true.

## Rejected: DOT and Graphviz export

Mermaid covers the need and GitHub renders it inline. Every additional renderer
is a format to keep working with no user asking for it.

## Kept, reluctantly: RFC-2119 keywords

I stripped a great deal of ceremony from the specification — a nine-tuple
formalism, a predicate that did no operational work, an invented research report
with confidence percentages attached to nothing. Sophisticated readers correctly
read that as generated rigour and then discount the sound parts along with it.

MUST and SHOULD stayed, because the linter enforces every one of them and the
conformance section maps each to the check that does it. Notation that does work
earns its place; notation that decorates does not.

## Held throughout: publish the unflattering results

Tier 3 was pre-registered before any money was spent, and it committed in advance
to publishing whatever came out. What came out was that Cairn's scoped retrieval
is not measurably better at rule-following than the alternatives — the comparison
the tool most wanted to win.

That is in the README. A benchmark published only when it flatters its author is
worth nothing, and the credibility of every other number here depends on this one
being reported straight.
