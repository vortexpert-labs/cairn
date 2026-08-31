---
id: ANC-0008
title: "Detection lives in the agent, recording in the CLI"
type: DECISION
status: PROPOSED
created_at: 2026-08-31T13:00:45Z
scope: "src/adapters"
claims:
  - "The agent detects what is worth recording; the CLI only writes and ratifies."
  - "Detection guidance is carried in the anchor-this skill, generated to every platform."
rationale: >
  Cairn cannot observe a conversation, and the moment a decision is made is a conversational
  event rather than a file change. Putting detection in the skill is the only place it can
  see that moment. The CLI stays a recorder, which keeps it testable and keeps the judgement
  in the one component that has the context to exercise it.
alternatives:
  - option: "A human-invoked command only"
    rejected_because: "depends on someone noticing a decision happened, which is the discipline that killed ADRs"
  - option: "Watch the git diff for reversals"
    rejected_because: "sees the change but not the reason, and the reason is the part worth keeping"
---
