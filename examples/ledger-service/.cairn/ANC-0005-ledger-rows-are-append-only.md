---
id: ANC-0005
title: "Ledger rows are append only"
type: CONSTRAINT
status: ACTIVE
created_at: 2026-08-29T17:44:09Z
scope: "src/ledger"
claims:
  - "Ledger rows must never be updated or deleted. Corrections are recorded as new, offsetting rows."
rationale: >
  The audit reconstructs any historical balance by replaying rows in order. A single update
  breaks every balance computed after it, and does so invisibly.
verify:
  command: "! rg -q 'UPDATE ledger|DELETE FROM ledger' src/ledger"
---
