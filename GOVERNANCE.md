# Governance

## Current model

Cairn is maintained by Sabber Ahamad Emon ([@sabber-ahamad-emon](https://github.com/sabber-ahamad-emon)) under VorteXpert Labs.

The maintainer makes final decisions regarding specification changes, CLI architecture, pull request acceptance, and release scheduling.

## Specification evolution

The normative definition of Cairn's format and behaviour is [SPECIFICATION.md](SPECIFICATION.md). Code implements the specification; the specification does not trail ad-hoc code changes.

### Proposing a change

1. **Open an issue or discussion:** Describe the motivation, the specific ambiguity or shortfall in the current specification, and the proposed text changes.
2. **Evaluate compatibility:**
   - **Non-breaking additions:** New optional fields or CLI commands that do not alter the validity of existing anchors or the meaning of existing schemas.
   - **Breaking format changes:** Any change that invalidates existing anchors, changes status transition rules, or alters frontmatter schema validation.
3. **Requirements for breaking changes:**
   - A schema version bump in `.cairn/schema.json` and `SPECIFICATION.md`.
   - An automated migration implementation in `cairn migrate` so existing repositories can upgrade safely without manual file editing.
   - Conformance test coverage proving both old-format rejection and automated migration correctness.

## Future evolution

As the project gains adoption and regular contributors:

- **Reviewers and maintainers:** Contributors who demonstrate sustained high-quality contributions and adherence to the project's zero-dependency and verification principles will be invited to become maintainers.
- **Consensus model:** Specification changes will transition to an RFC review process requiring consensus among active maintainers before adoption.
