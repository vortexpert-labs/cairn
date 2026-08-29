---
id: ANC-0007
title: "One adapter file per platform, not one per scope"
type: DECISION
status: ACTIVE
created_at: 2026-08-29T17:23:56Z
scope: "src/adapters"
claims:
  - "Cairn generates exactly one instruction file per platform."
  - "Scoped retrieval is the tool's job, invoked by the agent, not something baked into generated rule files."
rationale: >
  The generated footprint is one file per platform because the number of files a tool drops
  in a repository root is itself a cost, and retrieval is something the CLI already does
  well. Agents are told which command to run rather than being handed a pre-expanded copy of
  every scope.
alternatives:
  - option: "A glob-scoped rule file per governed scope"
    rejected_because: "Antigravity, Cursor, Windsurf and Copilot all support auto-attaching a rule by file pattern, which would give finer disclosure. It also means one file per scope per platform, and config-file sprawl in the repository root is a documented complaint about exactly this class of tool."
  - option: "No generated files at all, MCP only"
    rejected_because: "Reaches every MCP-capable agent with nothing in the repo, but leaves platforms without MCP support with no orientation at all."
---
