# Project Orientation

**Stage:** `PROTOTYPE`

## Goals

<!-- Written and maintained by you. Cairn never edits outside the markers below. -->

- **Ship a checker people trust.** Every rule in the specification maps to a check that
  actually runs. A tool that claims to validate and does not is worse than no tool.
- **Stay adoptable in ten minutes.** Install, init, one anchor, one CI line. If adoption
  needs a tutorial, the design is wrong.
- **Publish measurements, not assertions.** Every number in the documentation links to a
  benchmark in this repository that anyone can rerun. No claim ships without one.

## Anchors

<!-- CAIRN-REGISTRY: START -->
### Active

| ID | Type | Title | Scope |
|---|---|---|---|
| [ANC-0001](ANC-0001-project-stage.md) | STAGE | Project stage: PROTOTYPE | `global` |
| [ANC-0002](ANC-0002-no-runtime-dependencies.md) | CONSTRAINT | No runtime dependencies | `global` |
| [ANC-0003](ANC-0003-verify-commands-never-run-without-external-opt-in.md) | CONSTRAINT | Verify commands never run without external opt-in | `src/verify` |
| [ANC-0004](ANC-0004-strict-yaml-subset-instead-of-a-yaml-library.md) | DECISION | Strict YAML subset instead of a YAML library | `src/anchor` |
| [ANC-0005](ANC-0005-the-committed-schema-is-the-single-source-of-truth.md) | DECISION | The committed schema is the single source of truth | `src/schema` |
| [ANC-0006](ANC-0006-the-name-anchor-protocol-was-abandoned.md) | REJECTED_PATH | The name Anchor Protocol was abandoned | `global` |
<!-- CAIRN-REGISTRY: END -->
