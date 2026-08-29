---
id: ANC-0007
title: "Currency amounts are integer minor units"
type: CONSTRAINT
status: ACTIVE
created_at: 2026-08-29T17:44:10Z
claims:
  - "Monetary amounts are stored and transported as integers in the minor unit, never as floats or decimals strings."
rationale: >
  Floating point rounding produced a reconciliation discrepancy in 2024 that took a week to
  trace. Integers make the rounding decision explicit at every boundary.
---
