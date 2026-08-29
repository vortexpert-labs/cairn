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

## Hooks

A rules file asks an agent to fetch what governs a path. A hook makes it arrive whether or not the agent thought to ask, which is the difference between a convention and a mechanism.

| Platform | File | What Cairn installs | Source |
|---|---|---|---|
| Claude Code | `.claude/settings.json` | `SessionStart` injects the project's active anchors; `PreToolUse` on file edits injects the anchors governing that path | [Hooks](https://code.claude.com/docs/en/hooks) |

The edit hook returns nothing for a path no anchor governs, and deliberately omits project-wide anchors — the session hook has already supplied those, and repeating them before every edit is how a context file stops being read.

`cairn hook` never runs `verify` commands. Injecting context is safe; executing a repository's shell commands because an editor opened a file is not, and routing that through a hook would defeat the `--allow-verify` rule entirely.

Hooks are merged into your settings file rather than replacing it. Only entries invoking `cairn hook` are managed; your own hooks, permissions and other settings are left alone, and `cairn uninstall` removes only ours.

### Platforms with hooks that Cairn does not configure

[Antigravity](https://antigravity.google/docs/hooks/), [Cursor](https://cursor.com/docs/hooks) and Windsurf all have hook systems. Cairn does not generate configuration for them because we could not confirm from their documentation that the relevant event can inject context back into the conversation — Antigravity's `PreToolUse` is documented as returning a permission decision, and Cursor documents `additional_context` on `sessionStart` and `postToolUse` but not on the pre-edit events. A hook that silently does nothing is worse than no hook.

If you know otherwise for a platform you use, the wiring is a two-line entry in `src/adapters/platforms.js` and the endpoint already exists:

```
cairn hook session --format text    # the project's active anchors
cairn hook edit --format text       # anchors for a path, read as JSON on stdin
```

## MCP server

`cairn mcp` serves the anchors over the Model Context Protocol on stdio, which reaches any MCP-capable agent without a file convention of its own. It speaks JSON-RPC 2.0 directly, with no SDK, so the published package keeps its zero runtime dependencies.

| Platform | Config file | Source |
|---|---|---|
| Claude Code | `.mcp.json` | [MCP](https://code.claude.com/docs/en/mcp) |
| Cursor | `.cursor/mcp.json` | [MCP](https://cursor.com/docs/context/mcp) |
| Antigravity | `.agents/mcp_config.json` | [MCP](https://antigravity.google/docs/mcp/) |

Tools: `cairn_why`, `cairn_context`, `cairn_show`, `cairn_timeline`, and `cairn_record`. The index is also exposed as a resource at `cairn://index`.

`cairn_record` always writes `PROPOSED`, never `ACTIVE`, and its description says so. An agent that could draft a rule which immediately binds the repository would put the governance model in the hands of whatever was most recently plausible.

Registration is merged into your configuration: other servers you have set up are left alone, and `cairn uninstall` removes only the `cairn` entry.

## Notes

**Windsurf** reads `.devin/rules/*.md` in preference to `.windsurf/rules/*.md` following the product's move under Devin. The older path still works as a fallback; Cairn writes the current one.

**Antigravity** supports four rule activation modes, including one that attaches a rule when an edited file matches a glob. Cairn does not use it, and neither does it use the equivalent in Cursor (`globs`), Windsurf (`trigger: glob`) or Copilot (`applyTo`). Scoped retrieval is the tool's job: the generated rule tells the agent to run `cairn why <path>`, which keeps the generated footprint at one file per platform instead of one per governed scope. The reasoning is recorded in `ANC-0007`.

## Platforms Cairn does not generate for

Absence here means we could not confirm the details first-hand, not that the platform is unsupported. Anything that reads `AGENTS.md` already works.

Cline, Amazon Q, JetBrains Junie, Zed and Aider all have their own conventions. If you use one of them, a pull request adding it is welcome — an entry in `src/adapters/platforms.js` needs a target path, whether the file is owned outright or shares space with the user, and a link to the documentation that establishes it. The test suite checks that every platform cites a source.
