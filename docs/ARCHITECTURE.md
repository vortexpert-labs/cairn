# Architecture

Cairn is a CLI over a directory of markdown files. There is no server, no
database and no runtime dependency; the whole thing is roughly 3,800 lines of
JavaScript that reads and writes files in a git repository.

## Layout

```
bin/cairn.js            argument parsing and dispatch, nothing else
src/
  schema/validator.js   a JSON Schema subset, written in-tree
  anchor/               parse · serialize · load · transition · declined
  graph/                dag · scope · timeline · churn
  render/               index · mermaid · terminal · anchor
  commands/             one file per command
  verify/runner.js      runs a constraint's shell check, opt-in only
  adapters/             per-platform instruction files, generated
  mcp/                  Model Context Protocol server
  checks.js             every rule `cairn check` enforces
  paths.js              repository root discovery
.cairn/                 this project's own anchors, dogfooded
examples/ledger-service a worked project, exercised in CI
benchmarks/             measurements, excluded from the published package
```

## The rules that shape it

**No runtime dependencies.** Cairn is installed with `npx` into repositories
whose contents nobody has audited, and every transitive dependency is
supply-chain surface. This is why `src/schema/validator.js` implements a JSON
Schema subset rather than importing one, and why the frontmatter parser is
hand-written. Development and benchmark dependencies are fine; they never reach
the published files. → `ANC-0002`

**The committed schema is the single source of truth.** `.cairn/schema.json`
ships with the package and is what the validator loads at runtime. Validation
rules are not duplicated in code — the previous version's hand-rolled checks
duplicated the schema and had already drifted apart from it. → `ANC-0005`

**A strict YAML subset, not a YAML library.** Anchor frontmatter accepts scalars,
block scalars, and lists of scalars or flat maps. Anything outside that is an
error with a line number rather than a surprise. Full YAML would mean a
dependency, and would accept documents the format does not intend. → `ANC-0004`

**Verify never runs by default.** A `CONSTRAINT` may carry a shell command that
proves it still holds. Cloning an untrusted repository and running `cairn check`
must not execute that repository's code, so the opt-in has to come from outside
the repository — a CLI flag or uncommitted local config — and a committed file
can never enable it. → `ANC-0003`

**One adapter file per platform, generated.** Instruction blocks were hand-copied
into eight files and drifted. They are now generated from a single source, and
`cairn adapters` fails CI when a generated file has been edited. → `ANC-0007`

## Reading

`cairn context` is the retrieval primitive. `why`, the editor hooks and the MCP
server all resolve to the same thing: given a path, which anchors govern it.

Scope matching lives in `src/graph/scope.js` — an anchor's `scope` is a path or
glob, and a path is governed by every anchor whose scope contains it, plus
everything scoped `global`.

**`context` emits `ACTIVE` anchors only.** This is load-bearing rather than
incidental. Agents draft anchors as `PROPOSED`, and if a draft could reach the
injected context then unratified machine-written text would be steering work —
which is the condition the human review gate exists to prevent. → `ANC-0009`

## Writing

Anchors are created by `cairn new` as `PROPOSED` and promoted by a person.
Detection — noticing that something worth recording just happened — lives in the
agent, not here, because Cairn cannot observe a conversation and an agent can.
The detection guidance is carried in `src/adapters/skills.js` and generated to
every platform. → `ANC-0008`

Status changes are applied as surgical line edits in
`src/anchor/transition.js` rather than by re-serialising the file. Only `status`,
`updated_at`, `superseded_by` and `invalidated_by` may change on an existing
anchor, so rewriting the whole document would both violate the format and produce
a diff that buries the one line that actually changed.

Declining a draft removes it and records it in `.cairn/declined.json`. That is
detector state, not an anchor — a suggestion someone turned down is not settled
knowledge — but the id it held is never reissued, because ids leak into pull
requests and commit messages and reusing one silently repoints them.

## Checking

`src/checks.js` holds every rule, and the specification's conformance section
maps each `MUST` to one of them. The ones that need explaining:

- **Unparseable anchors are errors, not warnings.** In the previous version a
  corrupt anchor was silently skipped, vanished from the index, and `check`
  still exited 0 — so a governing constraint could disappear while CI reported
  the repository healthy.
- **Immutability and transitions read git history.** `check` compares each anchor
  against its committed form to catch edits to anchors that were already ACTIVE,
  and to catch illegal status moves. This is why the CI job checks out with full
  history.
- **Supersession has two sides.** If A supersedes B, then B must be `SUPERSEDED`
  and must point back at A. A draft is exempt, because a proposal has not
  replaced anything yet.
- **`SUSPECT` is derived, not stored.** Anchors transitively depending on an
  `INVALIDATED` ancestor are reported at check time rather than carrying a status
  that would need maintaining.

## The index

`.cairn/INDEX.md` has managed regions marked by `<!-- CAIRN-REGISTRY: START/END -->`.
Everything outside them — the stage, the policy, the goals you wrote — is
preserved byte for byte. The previous version regenerated the whole file, which
destroyed hand-written content and then failed CI forever after, with a
documented fix that deleted the user's work.

## Adding a platform

`src/adapters/platforms.js` is a list. Each entry names the target path, the
delivery mode (`file` or `block`), a first-party documentation URL, and an
optional character limit. Support is only claimed where a vendor's own
documentation confirms the path; blog posts do not count, and one was already
found wrong during design.

Anything with `mode: 'block'` gets an injected, marker-delimited section in an
existing file, so `cairn uninstall` can remove it cleanly and leave the rest of
the file alone.
