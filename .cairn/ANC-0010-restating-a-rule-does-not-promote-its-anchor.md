---
id: ANC-0010
title: "Restating a rule does not promote its anchor"
type: REJECTED_PATH
status: ACTIVE
created_at: 2026-08-31T13:00:45Z
updated_at: 2026-08-31T13:22:55Z
scope: "src/commands"
claims:
  - "Repeating a rule must not move its anchor from PROPOSED to ACTIVE."
  - "Restatement may raise a draft's rank in review, and nothing more."
rationale: >
  Auto-promoting on restatement needs a way to tell that an utterance matches an existing
  draft, and the only cheap way is embedding similarity. This project's own Tier 2
  measurement found a constraint sits closer to its own negation than to a paraphrase of
  itself in 87-95% of cases across four encoders, so that mechanism would promote a rule
  when the user said its opposite. Saying a thing is also not the same as legislating it.
alternatives:
  - option: "Exact lexical matching instead of semantic"
    rejected_because: "fires so rarely it returns to manual approval with extra machinery"
---
