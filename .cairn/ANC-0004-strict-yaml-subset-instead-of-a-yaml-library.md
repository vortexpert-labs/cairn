---
id: ANC-0004
title: "Strict YAML subset instead of a YAML library"
type: DECISION
status: ACTIVE
created_at: 2026-08-29T16:29:06Z
scope: "src/anchor"
claims:
  - "Frontmatter is parsed by an in-tree parser accepting a documented subset of YAML."
  - "Constructs outside that subset are errors, never best-effort guesses."
rationale: >
  Full YAML carries ambiguities that make a format unpredictable for something meant to be
  read by both people and tools. Rejecting what it does not understand is safer than
  silently misreading it, and it keeps the zero-dependency constraint intact.
alternatives:
  - option: "js-yaml or an equivalent library"
    rejected_because: "Would add a runtime dependency to a tool that is run against untrusted repositories, and pulls in full YAML's ambiguities."
  - option: "TOML or JSON frontmatter"
    rejected_because: "Neither reads well for multi-line prose, and every adjacent tool in this space already uses YAML frontmatter."
---
