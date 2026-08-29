# Migrating from Anchor Protocol

Cairn is the successor to `@vortexpert-labs/anchor-protocol`. That package is deprecated and its repository archived.

The file format is close enough that migration is mechanical. `cairn migrate` performs all of it.

## What changed

| v1 (`anchor-protocol`) | Cairn 1.0 | Why |
|---|---|---|
| `.anchors/` | `.cairn/` | Directory named for the tool, as with `.github/` |
| `authority:` field | *removed* | Redundant with `status`; `git blame` on the status line answers who and when |
| `BOUNDARY` type | merged into `CONSTRAINT` | The two could not be told apart in one sentence, so they were filed inconsistently |
| `DISCOVERY` type | `FINDING` | Plainer; "discovery" overstated what it labels |
| — | `alternatives:` | Records the fork, so a decision can be reopened later |
| — | `revisit_if:` | An anchor names the condition that would make it wrong |
| — | `verify:` | Optional machine check for a `CONSTRAINT` |
| — | `cairnFormatVersion` in `schema.json` | The repository states the format it uses |
| `anchor` CLI | `cairn` CLI | |

Unchanged: anchor ids (`ANC-NNNN`), filename convention, the five statuses, and `claims`, `rationale`, `scope`, `evidence`, `supersedes`, `superseded_by`, `invalidated_by`, `depends_on`.

## Migrating

```bash
npx @vortexpert-labs/cairn migrate --from anchor-protocol
```

This moves `.anchors/` to `.cairn/`, drops `authority` from every anchor, rewrites `BOUNDARY` to `CONSTRAINT` and `DISCOVERY` to `FINDING`, writes the current `schema.json`, and regenerates the index. It does not invent `alternatives`, `revisit_if`, or `verify` values — those are judgement calls and are added by hand as decisions come up for review.

Then remove the old package and its adapter blocks:

```bash
npm uninstall @vortexpert-labs/anchor-protocol
npx @vortexpert-labs/cairn adapters --write
```

## Behaviour changes to expect

Three checks are stricter than they were, so a repository that passed `anchor lint --strict` may report problems on its first `cairn check`. Each of these is a real problem being surfaced rather than a new rule being imposed.

**Anchors that fail to parse are errors.** Previously they were skipped with a warning, which meant a malformed anchor quietly left the index while the check still succeeded. Fix or remove the file.

**Field values are validated against the committed schema.** `type`, `status`, lengths, timestamp formats and unknown fields are all enforced at creation and at check time.

**`index` only rewrites the anchor table.** Regeneration happens between the `CAIRN-REGISTRY` markers; the stage, goals and any prose you have written around them are preserved exactly. Add the markers to your index if it does not have them yet.
