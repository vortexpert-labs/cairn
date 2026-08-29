---
id: ANC-0002
title: "SQLite as the ledger store"
type: DECISION
status: SUPERSEDED
created_at: 2026-08-29T17:44:09Z
updated_at: 2026-08-29T17:44:09Z
scope: "src/ledger"
superseded_by: ANC-0004
claims:
  - "Ledger entries are stored in a single SQLite database file."
rationale: >
  One writer at launch volumes, and it removed a service from the deployment. Revisit if
  write volume grows.
alternatives:
  - option: "Postgres"
    rejected_because: "Another service to run and back up, which we could not staff at launch."
---
