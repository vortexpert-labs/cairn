# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-31

### Added

- CLI commands for managing project decision and constraint records in `.cairn/`:
  - `init`: initialise `.cairn/` with schema, index, and initial stage anchor.
  - `new`: draft an anchor as `PROPOSED` with title, type, scope, claim, rationale, and alternatives.
  - `why`: query active anchors governing a specific path.
  - `context`: retrieve governing active anchors formatted for agent injection.
  - `check`: validate schema conformance, git immutability, transition legality, dependency graph integrity, and index synchronization.
  - `review`: surface proposed anchors and churned scopes awaiting human ratification.
  - `status`: promote or transition anchor status (`ACTIVE`, `SUPERSEDED`, `INVALIDATED`, `RETIRED`).
  - `decline`: reject a proposed draft and record the spent ID in `.cairn/declined.json`.
  - `timeline`: render chronological decision history in text or Mermaid syntax.
  - `show`: display details, alternatives, and graph relationships for an anchor.
  - `doctor`: inspect repository health, git history availability, and configuration.
  - `adapters`: generate and verify platform instruction files (`CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, etc.).
  - `affected`: list anchors governing files modified between git revisions.
  - `uninstall`: remove generated adapter files while preserving `.cairn/`.
- Six anchor types: `GOAL`, `STAGE`, `DECISION`, `CONSTRAINT`, `FINDING`, and `REJECTED_PATH`.
- Path and glob-based scope resolution for targeted constraint retrieval.
- Opt-in `verify` runner for executable constraints, requiring explicit `--allow-verify` authorization.
- In-tree Model Context Protocol (MCP) stdio server for agent integration.
- GitHub Action (`action.yml`) for pull request checks and contextual comments.
- Zero runtime dependencies on Node.js 20 or newer.
