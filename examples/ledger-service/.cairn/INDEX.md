# Project Orientation

**Stage:** `PRODUCTION`

## Goals

<!-- Written and maintained by you. Cairn never edits outside the markers below. -->

- 

## Anchors

<!-- CAIRN-REGISTRY: START -->
### Active

| ID | Type | Title | Scope |
|---|---|---|---|
| [ANC-0001](ANC-0001-project-stage.md) | STAGE | Project stage: PRODUCTION | `global` |
| [ANC-0003](ANC-0003-ledger-writes-saturate-above-200-per-second.md) | FINDING | Ledger writes saturate above 200 per second | `src/ledger` |
| [ANC-0004](ANC-0004-postgres-as-the-ledger-store.md) | DECISION | Postgres as the ledger store | `src/ledger` |
| [ANC-0005](ANC-0005-ledger-rows-are-append-only.md) | CONSTRAINT | Ledger rows are append only | `src/ledger` |
| [ANC-0006](ANC-0006-kafka-for-the-settlement-event-bus.md) | REJECTED_PATH | Kafka for the settlement event bus | `src/settlement` |
| [ANC-0007](ANC-0007-currency-amounts-are-integer-minor-units.md) | CONSTRAINT | Currency amounts are integer minor units | `global` |

### Proposed

_Drafted, not yet approved. Not binding._

| ID | Type | Title | Scope |
|---|---|---|---|
| [ANC-0008](ANC-0008-settlement-retries-stop-after-three-attempts.md) | DECISION | Settlement retries stop after three attempts | `src/settlement` |
<!-- CAIRN-REGISTRY: END -->
