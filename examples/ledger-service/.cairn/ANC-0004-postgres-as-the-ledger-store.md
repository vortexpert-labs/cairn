---
id: ANC-0004
title: "Postgres as the ledger store"
type: DECISION
status: ACTIVE
created_at: 2026-08-29T17:44:09Z
scope: "src/ledger"
supersedes: ["ANC-0002"]
depends_on: ["ANC-0003"]
claims:
  - "Ledger entries are stored in Postgres, with PgBouncer in transaction pooling mode."
rationale: >
  Write volume passed the ceiling found in the March load test, and month-end close needs
  multi-row transactions the previous store could not provide.
alternatives:
  - option: "Staying on SQLite"
    rejected_because: "Cannot pass the write ceiling measured in ANC-0003."
  - option: "DynamoDB"
    rejected_because: "The ledger needs multi-row transactions, and nobody here has run it in production."
revisit_if: "sustained write volume stays under 50 per second for two consecutive quarters"
---
