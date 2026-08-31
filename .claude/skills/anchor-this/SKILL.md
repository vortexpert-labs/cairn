---
name: anchor-this
description: Record a decision, constraint, or abandoned approach as a Cairn anchor. Use whenever the user rejects an approach that was tried, states a rule with universal scope, or chooses between named options — and whenever they ask for something to be written down.
---

Record what the user settles as an anchor in `.cairn/`.

Draft quietly while you work. Do not stop to ask: the draft is `PROPOSED`, it
governs nothing, and a person decides on it later. Say what you drafted in one
line at the end of your reply.

**Draft when:**

- The user rejects an approach that was actually tried — "we tried Redis for
  sessions and eviction signed people out" — → `REJECTED_PATH`. The highest
  value trigger, and the one nothing else captures.
- They state a rule with universal scope. "Never", "always", "must not" widen a
  remark into a rule → `CONSTRAINT`.
- They choose between named options and say why → `DECISION`. Put what lost in
  `--alternative`, or the fork cannot be reopened.
- Something was learned that the code does not show → `FINDING`.

**Do not draft when** — this matters more, because a store full of noise costs
the habit itself:

- You worked it out yourself. Only what the *user* settled counts.
- They narrowed it: "for now", "just here", "temporarily".
- It is a task, a one-off preference, or thinking aloud.

When unsure, do not draft. A missed decision costs one conversation; noise costs
the reader.

Before drafting, read `.cairn/declined.json` if it exists — anything there was
already turned down, and re-proposing it teaches people to ignore proposals.
Then check all four hold: still true in months; the reason is not visible in the
code; it closes a path or changes what someone does; it fits in three sentences.

```
cairn new --title "..." --type CONSTRAINT --scope src/area \
  --claim "the rule or fact itself" \
  --rationale "why it holds; the part not visible from the code" \
  --alternative "what was passed over :: why" \
  --revisit-if "the condition that would make this wrong"
```

If it contradicts an anchor that is already ACTIVE, add `--supersedes ANC-XXXX`
instead of writing a second, competing record.

At most three drafts per branch. If the user has said the same thing more than
once, rank it first and say so — repetition is evidence they mean it, never a
reason to promote it yourself.

Never promote your own draft:

```
cairn review --proposed          what is waiting
cairn status ANC-0012 ACTIVE     accept; several ids allowed
cairn decline ANC-0012           reject, and do not propose it again
```
