---
id: ANC-0002
title: "No runtime dependencies"
type: CONSTRAINT
status: ACTIVE
created_at: 2026-08-29T16:28:43Z
claims:
  - "The published package must have zero runtime dependencies."
  - "Development and benchmark dependencies are permitted, but must not appear in the published files."
verify:
  command: "node -e \"const p=require('./package.json');process.exit(p.dependencies&&Object.keys(p.dependencies).length?1:0)\""
  description: "package.json declares no runtime dependencies"
rationale: >
  Cairn is run against repositories the user may not trust, and is installed via npx into
  other people's projects. Every transitive dependency is supply-chain surface that a tool
  this small does not need. It is also why the JSON Schema validator and the frontmatter
  parser are written in-tree rather than pulled from npm.
---
