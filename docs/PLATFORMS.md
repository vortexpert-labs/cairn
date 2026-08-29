# Platform support

`cairn adapters --write` generates one instruction file per platform. Each path below was taken from that platform's own documentation, linked in the last column, and `cairn adapters --list` prints the same table.

Nothing is listed here on the strength of a blog post or a comparison article. Two were checked during development and both were wrong: one asserted that Cursor has no hooks, and another pointed at a rules directory that Windsurf now treats only as a fallback.

## Generated adapters

| Platform | File Cairn writes | How it is written | Source |
|---|---|---|---|
| Antigravity | `.agents/rules/cairn.md` | whole file | [Rules and workflows](https://antigravity.google/docs/rules-workflows/) |
| Claude Code | `CLAUDE.md` | delimited region | [Memory](https://docs.claude.com/en/docs/claude-code/memory) |
| Cursor | `.cursor/rules/cairn.mdc` | whole file | [Rules](https://cursor.com/docs/context/rules) |
| Windsurf | `.devin/rules/cairn.md` | whole file | [Rules and memories](https://docs.devin.ai/desktop/cascade/memories) |
| GitHub Copilot | `.github/copilot-instructions.md` | delimited region | [Repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions) |
| Any agent reading `AGENTS.md` | `AGENTS.md` | delimited region | [agents.md](https://agents.md/) |

**Whole file** means Cairn owns it; `cairn uninstall` deletes it. **Delimited region** means the file is yours and Cairn only manages the part between `<!-- CAIRN:START -->` and `<!-- CAIRN:END -->`; uninstall removes that region and leaves the rest exactly as it was.

Two of these cap the size of a rules file at 12,000 characters — Antigravity and Windsurf. The generator refuses to write a file that would exceed a documented limit rather than producing one the platform will silently truncate.

## Notes

**Windsurf** reads `.devin/rules/*.md` in preference to `.windsurf/rules/*.md` following the product's move under Devin. The older path still works as a fallback; Cairn writes the current one.

**Antigravity** supports four rule activation modes, including one that attaches a rule when an edited file matches a glob. Cairn does not use it, and neither does it use the equivalent in Cursor (`globs`), Windsurf (`trigger: glob`) or Copilot (`applyTo`). Scoped retrieval is the tool's job: the generated rule tells the agent to run `cairn why <path>`, which keeps the generated footprint at one file per platform instead of one per governed scope. The reasoning is recorded in `ANC-0007`.

## Platforms Cairn does not generate for

Absence here means we could not confirm the details first-hand, not that the platform is unsupported. Anything that reads `AGENTS.md` already works.

Cline, Amazon Q, JetBrains Junie, Zed and Aider all have their own conventions. If you use one of them, a pull request adding it is welcome — an entry in `src/adapters/platforms.js` needs a target path, whether the file is owned outright or shares space with the user, and a link to the documentation that establishes it. The test suite checks that every platform cites a source.
