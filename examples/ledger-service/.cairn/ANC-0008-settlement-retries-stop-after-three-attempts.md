---
id: ANC-0008
title: "Settlement retries stop after three attempts"
type: DECISION
status: PROPOSED
created_at: 2026-08-29T17:44:10Z
scope: "src/settlement"
claims:
  - "Outbound settlement retries stop after three attempts and move the item to a manual queue."
rationale: >
  An item that has failed three times is failing for a reason a human needs to look at, not
  for a reason more attempts will fix.
alternatives:
  - option: "Exponential backoff with no ceiling"
    rejected_because: "Double-charged two customers during the March incident."
---
