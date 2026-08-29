# The Cairn Specification

**Version 1.0** · Status: draft, unreleased

Cairn is a format and a checker for the decisions and constraints a software project runs on: the things that are settled, but are not visible from the code. What the project is aiming at, which rules hold and why, which choices were made and what they beat, what was learned along the way, and which approaches were tried and abandoned.

It exists because that information currently has nowhere to live. Git records what changed. Code records what is. Issue trackers record what is being worked on. The reasoning behind a decision — especially the reasoning behind rejecting something — survives only in the heads of whoever was present, and is re-derived at cost by every new contributor and every AI coding agent that touches the repository afterward.

Anchors are stored as Markdown files in the repository, so they are versioned, reviewable in a pull request, and readable by any tool that can read a file. No service, no database, no vendor.

## What Cairn is not

- **Not a memory system.** It does not record what happened in a session. It records what was settled.
- **Not a replacement for a linter.** If a rule can be enforced mechanically by ESLint, dependency-cruiser, ArchUnit, or a type checker, write that instead — it is strictly stronger. Anchors are for the constraints that cannot be expressed that way. Where a constraint *can* be partially checked, an anchor MAY carry the check (see `verify`).
- **Not documentation.** Documentation explains how to use or build the software. Anchors record why it is shaped the way it is and what is off-limits.
- **Not a task tracker.**

## Requirement levels

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **MAY**, and **OPTIONAL** are to be interpreted as described in RFC 2119 and RFC 8174.

Requirements here fall into two groups, and the difference matters.

**Implementation requirements** constrain a tool that reads and writes anchors. Every one corresponds to a check listed in [Conformance](#conformance); a requirement on an implementation that cannot be checked does not belong in this specification.

**Agent requirements** constrain how an AI coding agent behaves when it encounters anchors. These cannot be verified by a checker — no tool can observe an agent's reasoning — and they are marked as such where they appear. They are stated because they are the contract an adapter asks an agent to honour, not because they can be enforced.

## Repository layout

Anchors live in a single `.cairn/` directory at the repository root:

```
.cairn/
├── INDEX.md                        the orientation index
├── schema.json                     the anchor schema, versioned with the repository
├── ANC-0001-project-stage.md
├── ANC-0007-no-orm-in-billing.md
└── ANC-0019-pgbouncer.md
```

A repository **MUST** have at most one `.cairn/` directory, at the root. Monorepos use one root directory and distinguish packages through the `scope` field. Nesting `.cairn/` per package is **NOT** supported: it fragments the graph, and cross-package decisions — which are most of the consequential ones — would have no natural home.

Anchor filenames **MUST** match `ANC-NNNN-<slug>.md`, where `NNNN` is the zero-padded id and `<slug>` is lowercase, hyphen-separated, and no longer than 50 characters. The `NNNN` in the filename **MUST** equal the `id` in the file's frontmatter.

Ids are assigned monotonically and are never reused, including after an anchor is invalidated or retired.

## The anchor file

An anchor is a Markdown file with YAML frontmatter. The frontmatter carries the structured record; the body is free-form Markdown for anything that needs more room than `rationale` allows.

```markdown
---
id: ANC-0007
title: No ORM in billing
type: CONSTRAINT
status: ACTIVE
created_at: 2025-11-04T09:12:00Z
scope: src/billing
claims:
  - "Billing code must use hand-written SQL. ORMs and query builders are not permitted under src/billing."
rationale: >
  The billing ledger is audited annually and the auditor requires statement-level
  traceability from a report row back to the exact SQL that produced it. ORM-generated
  queries broke that chain during the 2025 audit and cost three weeks of reconstruction.
verify:
  command: "! rg -q 'from sqlalchemy' src/billing"
evidence:
  - "https://github.com/acme/ledger/pull/812"
---

Applies to reporting queries as well as writes. The read replica is in scope.
```

### The frontmatter subset

Frontmatter is YAML, but only a documented subset of it. A conforming parser accepts:

```
key: scalar                bare, 'single' or "double" quoted
key: []                    an empty list
key: >                     folded block; continuation lines indented
key: |                     literal block; newlines preserved
key:                       followed by an indented list of scalars
key:                       followed by an indented list of objects
key:                       followed by an indented mapping
# comments and blank lines
```

Anything outside that subset **MUST** be reported as an error rather than parsed on a best-effort basis. Full YAML has ambiguities that make a document's meaning depend on subtleties of quoting; for a format read by both people and tools, being predictable is worth more than being expressive. The frontmatter delimiter is a line that is exactly `---`, so a horizontal rule or a `---` inside a value does not terminate it.

### Fields

| Field | Required | Rule |
|---|---|---|
| `id` | yes | `ANC-NNNN`; matches the filename |
| `title` | yes | 1–100 characters |
| `type` | yes | One of the six types below |
| `status` | yes | One of the five statuses below |
| `created_at` | yes | ISO-8601 UTC; set once, never edited |
| `claims` | yes | At least one; each 1–280 characters |
| `rationale` | yes | 1–1500 characters |
| `updated_at` | no | ISO-8601 UTC; set on status transitions |
| `scope` | no | Path or glob; defaults to `global` |
| `alternatives` | no | List of `{option, rejected_because}` |
| `revisit_if` | no | 1–280 characters |
| `verify` | no | `{command, description?}`; `CONSTRAINT` only |
| `supersedes` | no | List of anchor ids |
| `superseded_by` | no | Anchor id |
| `invalidated_by` | no | Anchor id |
| `depends_on` | no | List of anchor ids |
| `evidence` | no | List of pointers: commit SHAs, PR URLs, benchmark paths |

There is deliberately **no `authority` field**. Whether a human approved an anchor is already carried by `status` — agents create `PROPOSED` anchors, humans promote them to `ACTIVE`. Who did it and when is answered by `git blame` on the status line, with an identity and a timestamp, which is both free and consistent with git being authoritative for line history.

### Types

| Type | Means |
|---|---|
| `GOAL` | What the project is trying to achieve. |
| `STAGE` | What phase the project is in, which changes what is acceptable. |
| `DECISION` | We chose X over Y. Carries the fork in `alternatives`. |
| `CONSTRAINT` | A rule that must hold. May be positive or negative. |
| `FINDING` | Something learned empirically that is not visible in the code. |
| `REJECTED_PATH` | We tried it and it failed. |

`REJECTED_PATH` and a `DECISION`'s `alternatives` are different: an alternative was **considered** and passed over; a rejected path was **actually attempted** and abandoned. The second is more expensive knowledge and is why it gets its own type.

A repository **MUST NOT** have more than one `ACTIVE` `STAGE` anchor. A project is in one stage at a time; superseding the old one is how a stage changes, which also leaves the history intact.

A `DECISION` **SHOULD** have `alternatives`. Without them the decision cannot be reopened later — there is nothing recorded to reconsider — so a decision with no alternatives is reported as a warning.

`verify` **MUST NOT** appear on any type other than `CONSTRAINT`.

### Status

| Status | Means | Requires |
|---|---|---|
| `PROPOSED` | Drafted, not yet approved. Not binding. | |
| `ACTIVE` | Approved and binding. | |
| `SUPERSEDED` | Replaced by a newer anchor. The situation changed. | `superseded_by` |
| `INVALIDATED` | Was wrong — its premise turned out to be false. | |
| `RETIRED` | Was right, no longer applies. Scope removed or phase ended. | |

The distinction between `SUPERSEDED`, `INVALIDATED`, and `RETIRED` is worth keeping because a reader wants to know *which* — whether a past decision was mistaken, improved upon, or simply outlived. Collapsing them loses that.

An anchor with `status: SUPERSEDED` **MUST** have `superseded_by` set to an existing anchor id.

Status moves in one direction only:

| From | May become |
|---|---|
| `PROPOSED` | `ACTIVE`, `INVALIDATED` |
| `ACTIVE` | `SUPERSEDED`, `INVALIDATED`, `RETIRED` |
| `SUPERSEDED`, `INVALIDATED`, `RETIRED` | nothing — these are final |

A conforming tool **MUST** refuse any other transition. Reopening a closed anchor would make the record unreadable as history: what a reader wants to know is what was true when, and a status that can move backwards cannot answer that. If a retired constraint becomes relevant again, record it as a new anchor.

Superseding changes two anchors at once — the new one gains `supersedes`, the old one becomes `SUPERSEDED` with `superseded_by` set. A tool **MUST** write both sides together, since writing only the new anchor leaves the old one still claiming to be binding.

What an `ACTIVE` anchor asserts **MUST NOT** be edited: `title`, `type`, `scope`, `created_at`, `claims`, `rationale`, `alternatives` and `revisit_if`. A changed situation is recorded by writing a new anchor that supersedes the old one, not by rewriting history.

The fields that track an anchor rather than state it **MAY** change: `status`, `updated_at`, `superseded_by`, `invalidated_by`, `evidence` and `verify`. Evidence accumulates as more of it turns up, and attaching a machine check to a rule that already existed does not alter the rule.

Anchors that transitively depend on an `INVALIDATED` anchor are reported as **suspect**. This is a derived condition computed at check time, not a stored status — an anchor's own status describes the anchor, not its ancestors.

### Scope

`scope` is a repository-relative path or glob (`src/billing`, `packages/api/**`) or the literal `global`. It is the join key for retrieval: it determines what `cairn why <path>` returns, which anchors a scoped editor rule activates on, and which anchors are checked for staleness against a path's churn.

## The index

`.cairn/INDEX.md` is the entry point. It carries the project stage, the active goals, and a table of anchors.

The anchor table is generated. It lives between the markers `<!-- CAIRN-REGISTRY: START -->` and `<!-- CAIRN-REGISTRY: END -->`, and a conforming tool **MUST NOT** modify anything outside those markers. Everything else in the file is written by humans and is preserved byte-for-byte.

`ACTIVE` and `PROPOSED` anchors **MUST** be listed separately. A proposed anchor is not binding, and listing it under the same heading as approved ones defeats the point of having the distinction.

## When to write an anchor

Write one only if all four are true:

1. It stays true for months, not days.
2. The reason is not visible in the code.
3. It stops someone — a person or an agent — repeating a path that was already closed.
4. It fits in one to three sentences.

If fewer than four hold, it is not an anchor. Most things are not anchors. A project with a hundred anchors has stopped being a set of anchors and become a wiki that nobody reads.

Cairn is designed for tens of anchors, not thousands. Anchors are loaded whole because the count is meant to stay small. If you have thousands, the tool is being used wrong.

## What not to record

- Session transcripts or narratives of what an agent did.
- Bug reports, stack traces, and ordinary fixes.
- Anything restating what the code already says — function signatures, schemas, file layouts.
- Third-party library documentation.
- Task lists and ticket contents.

A conforming tool **SHOULD** warn on text that looks like a session log. This is a heuristic, not a guarantee; it catches obvious cases and will not catch a determined author.

## What is authoritative for what

| Source | Authoritative for |
|---|---|
| Source code and tests | What the software currently does |
| Git | What changed, when, and by whom |
| `.cairn/` | What is settled, what is off-limits, and why |
| Issue tracker | What is being worked on now |

Where an `ACTIVE` anchor contradicts the code, **the code is correct about what the software does.** The anchor is then either stale — and should be superseded or invalidated — or the code is in violation, which is a decision for a person, not an agent. An AI agent **MUST NOT** rewrite working code to satisfy an anchor without explicit human confirmation. *(Agent requirement — not tool-checkable.)*

## `verify`

A `CONSTRAINT` may carry a shell command that determines whether it currently holds. Exit code 0 means it holds.

This is the only part of Cairn that executes anything, and it is a code-execution surface: the command is defined in a repository file, so running it on a repository you do not trust runs that repository's code.

Therefore a conforming tool:

- **MUST NOT** execute `verify` commands by default.
- **MUST** require opt-in given on the command line, or from configuration stored outside the repository being checked.
- **MUST NOT** treat any file inside the repository as opt-in — **including one listed in `.gitignore`**. Ignoring a file does not stop it being committed, so a hostile repository could ship its own permission slip.

Continuous integration is a different trust context and needs no exception: a workflow already runs the repository's code by design, so putting the flag in a workflow file is the operator's decision, not the repository's.

## Format versioning

`.cairn/schema.json` carries a `cairnFormatVersion` and is committed to the repository, so a repository always states the format it uses. A tool encountering a version it does not recognise **MUST** fail rather than guess, and **SHOULD** point at its migration command.

## Conformance

A conforming implementation performs every check below. Each maps to a **MUST** above.

**File and identity**
1. Anchor filenames match `ANC-NNNN-<slug>.md`, slug lowercase and ≤50 characters.
2. Frontmatter `id` equals the filename's id.
3. Ids are unique across the directory.
4. A file that cannot be parsed is an **error**, never a skipped warning. An unreadable anchor must never silently vanish from the index.

**Schema**
5. Frontmatter validates against `.cairn/schema.json`: required fields present, enums respected, lengths within bounds, no unknown fields.
6. The schema is read from disk, not reimplemented in code, so the committed schema is the single source of truth.

**Layout**
5b. No `.cairn/` directory exists below the repository root.
5c. Frontmatter outside the documented subset is an error, not a best-effort parse.

**Semantics**
7. At most one `ACTIVE` `STAGE` anchor.
8. `status: SUPERSEDED` implies `superseded_by` is present and resolves to an existing anchor.
9. `supersedes`, `superseded_by`, `invalidated_by`, and `depends_on` all resolve to existing anchor ids.
10. The `depends_on` graph is acyclic.
11. `verify` appears only on `CONSTRAINT`.
12. Anchors transitively depending on an `INVALIDATED` anchor are reported suspect.
12b. The asserting fields of an anchor that was `ACTIVE` in the previous commit are unchanged in the working tree. Checked against git history; skipped for anchors with no committed ancestor.
12c. Status transitions follow the table above; any other move is refused.
12d. Superseding writes both sides: the new anchor's `supersedes` and the old anchor's `status` and `superseded_by`.

**Index**
13. Content outside the registry markers is preserved byte-for-byte.
14. `ACTIVE` and `PROPOSED` anchors are listed separately.

**Format version**
14b. A `cairnFormatVersion` the tool does not recognise is a fatal error, not a best-effort parse.

**Execution safety**
15. `verify` commands do not execute without opt-in originating outside the checked repository.

**Warnings** (reported, not fatal)
16. A `DECISION` with no `alternatives`.
17. Text resembling a session log.
18. An `ACTIVE` anchor whose `revisit_if` condition may be met, or whose scope has churned substantially since it was written.
