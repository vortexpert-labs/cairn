---
name: anchor-this
description: Record a decision, constraint, or abandoned approach as a Cairn anchor. Use when an architectural choice has just been made, a new rule agreed, or an approach tried and given up on, or when the user asks to write something down.
---

Record what was just settled as an anchor in `.cairn/`.

First check it is worth recording. All four must hold:

1. It will still be true in months, not days.
2. The reason is not visible in the code.
3. It stops someone repeating a path that is now closed.
4. It fits in one to three sentences.

If any of them fails, say so and stop. Most things are not anchors, and a
project with a hundred of them has become a wiki nobody reads.

Then choose the type:

- `DECISION` — chose X over Y. Record what was passed over in `--alternative`,
  or the decision cannot be reopened later.
- `CONSTRAINT` — a rule that must hold. May be positive or negative.
- `REJECTED_PATH` — actually tried, and abandoned. Different from a rejected
  alternative, which was only considered.
- `FINDING` — learned empirically, not visible in the code.
- `GOAL` or `STAGE` — what the project is aiming at, or what phase it is in.

Then run:

```
cairn new --title "..." --type DECISION \
  --scope src/area \
  --claim "the rule or fact itself" \
  --rationale "why it holds; the part not visible from the code" \
  --alternative "what was passed over :: why"
```

Add `--revisit-if "..."` when there is a condition that would make it wrong.

The anchor is written as `PROPOSED`. Tell the user it is not binding until
they promote it with `cairn status <id> ACTIVE`, and show them the file so
they can read what you wrote before agreeing to it.
