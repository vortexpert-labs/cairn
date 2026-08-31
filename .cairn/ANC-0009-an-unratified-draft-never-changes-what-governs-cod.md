---
id: ANC-0009
title: "An unratified draft never changes what governs code"
type: CONSTRAINT
status: ACTIVE
created_at: 2026-08-31T13:00:45Z
updated_at: 2026-08-31T13:22:55Z
scope: "src"
claims:
  - "cairn context emits ACTIVE anchors only; a PROPOSED anchor governs nothing."
  - "A draft that supersedes an anchor leaves it ACTIVE until the draft is accepted."
rationale: >
  Drafting is deliberately cheap so agents record freely, which is only safe if a draft
  cannot steer anyone. Retiring a rule at draft time would let an agent withdraw a
  constraint nobody agreed to withdraw, and would leave the scope governed by nothing while
  the replacement sat unreviewed.
verify:
  command: "! rg -q 'PROPOSED' src/commands/context.js"
---
