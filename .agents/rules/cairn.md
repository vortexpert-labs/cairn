## Project orientation

This repository records its settled decisions and constraints in `.cairn/`.
They apply to you.

Before editing files in an area you have not touched yet, run:

    cairn why <path>

It prints the constraints, decisions and abandoned approaches governing that
path, and the reasoning behind each. `cairn context --scope <path>` returns
the same as plain Markdown.

While you work:

- Obey every ACTIVE constraint. If a request conflicts with one, say so and
  ask which should give way. Do not quietly work around it.
- Never re-propose anything recorded as a REJECTED_PATH. It was tried and
  abandoned, and the anchor says why.
- A DECISION records what it ruled out. Run `cairn show <id>` before
  reopening one, so you argue with the actual reasoning.
- Code is authoritative about what the software does. Where an anchor
  contradicts working code, the anchor is stale — say so rather than changing
  the code to match it.

When something consequential is settled — an architectural decision, a new
constraint, or an approach that was tried and failed — record it:

    cairn new --title "..." --type DECISION \
      --claim "..." --rationale "..." \
      --alternative "what you rejected :: why"

Anchors are drafted as PROPOSED. A person promotes them to ACTIVE in review.

Do not write session notes, stack traces, task lists or narrative summaries
into `.cairn/`. It holds what was settled, not what happened.
