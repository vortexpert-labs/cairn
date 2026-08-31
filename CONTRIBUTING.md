# Contributing to Cairn

## Principles

- **Zero runtime dependencies:** Cairn is run with `npx` into unvetted repositories. Supply-chain surface must stay minimal.
- **Specification-first:** Format and behaviour rules are defined normatively in [SPECIFICATION.md](SPECIFICATION.md).
- **Code is authoritative:** Anchors record settled decisions and constraints; they do not duplicate documentation or describe what code already makes obvious.

## Development setup

Cairn requires Node.js 20 or newer. There are no build steps or dependencies needed to run the CLI or its test suite.

```console
git clone https://github.com/vortexpert-labs/cairn.git
cd cairn
```

### Running tests

Run the built-in Node.js test runner:

```console
node --test
```

### Checks run in CI

Every pull request runs these checks:

```console
node --test                                    # run test suite
node bin/cairn.js check --strict --allow-verify # validate repository anchors
node bin/cairn.js doctor                       # check environment and configuration
node bin/cairn.js adapters                      # ensure generated instruction files have not drifted
cd examples/ledger-service && node ../../bin/cairn.js check --allow-verify # validate worked example
```

### Generated adapter files

Files generated for agent platforms (such as `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, etc.) must **never** be edited by hand.

When adapter templates or skill definitions change, regenerate all target files with:

```console
node bin/cairn.js adapters --write
```

CI runs `cairn adapters` without flags to detect and reject drift.

### Adding support for a new platform

Platform definitions live in `src/adapters/platforms.js`.

To add a new platform:
1. Provide a **first-party documentation URL** proving the exact path and delivery format the tool expects. Blog posts, tutorials, and third-party summaries are not accepted.
2. Specify the delivery mode (`file` for standalone instruction files, `block` for managed regions in existing files).
3. If the platform documents an instruction length limit, include `charLimit`.
4. Run `node bin/cairn.js adapters --write` to generate the file and verify with `node --test`.

## Commit style

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- Use conventional type prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`.
- Use the imperative mood in the subject line (e.g. `fix: handle missing index markers gracefully`).
- Include a commit body explaining *why* the change was made whenever the diff alone does not make the rationale obvious.
- Do not include AI attribution trailers or session markers.
