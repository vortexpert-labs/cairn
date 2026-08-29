---
id: ANC-0003
title: "Ledger writes saturate above 200 per second"
type: FINDING
status: ACTIVE
created_at: 2026-08-29T17:44:09Z
scope: "src/ledger"
claims:
  - "Sustained ledger writes above roughly 200 per second cause lock contention, and the retries are silent."
rationale: >
  Measured during the March load test. The dangerous part is that the failure is silent:
  throughput degrades and nothing reports an error.
---
