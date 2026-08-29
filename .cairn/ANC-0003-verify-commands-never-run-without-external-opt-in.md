---
id: ANC-0003
title: "Verify commands never run without external opt-in"
type: CONSTRAINT
status: ACTIVE
created_at: 2026-08-29T16:28:44Z
scope: "src/verify"
claims:
  - "A verify command must never execute by default."
  - "Opt-in must originate outside the repository being checked: a CLI flag or uncommitted local config."
  - "A repository must never be able to authorize execution of its own verify commands."
rationale: >
  The verify field turns an anchor into an executable check, which makes it a code-execution
  surface. Cloning an untrusted repository and running cairn check must not run that
  repository's code. If a committed file could enable execution, a malicious repository
  would simply commit it.
---
