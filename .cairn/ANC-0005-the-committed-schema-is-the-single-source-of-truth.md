---
id: ANC-0005
title: "The committed schema is the single source of truth"
type: DECISION
status: ACTIVE
created_at: 2026-08-29T16:29:06Z
scope: "src/schema"
claims:
  - "Validation reads .cairn/schema.json from disk rather than reimplementing the rules in code."
  - "The validator reports schema keywords it cannot enforce rather than ignoring them."
rationale: >
  The predecessor shipped a schema.json its linter never opened, so the two drifted. Reading
  the committed schema makes that drift impossible, and reporting unsupported keywords means
  the validator can never silently under-enforce.
alternatives:
  - option: "Validation rules written directly in JavaScript"
    rejected_because: "This is what the predecessor did; its schema.json and its linter drifted until the linter accepted documents the schema forbade."
  - option: "Bundling the schema in the package only"
    rejected_because: "A repository could not then pin the format it was written against, making migrations guesswork."
---
