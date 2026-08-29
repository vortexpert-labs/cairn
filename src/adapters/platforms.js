/**
 * Where each agent reads its instructions.
 *
 * Every entry names the first-party document it was verified against. Nothing
 * is listed on the strength of a blog post or a comparison article: during
 * development one such article claimed Cursor had no hooks, which was wrong,
 * and another pointed at a path Windsurf now treats only as a fallback.
 *
 * A platform we cannot verify is not listed here. It belongs in
 * docs/PLATFORMS.md as a contribution someone closer to it can make.
 */

export const BLOCK_START = '<!-- CAIRN:START -->';
export const BLOCK_END = '<!-- CAIRN:END -->';

/**
 * mode: 'file'  — Cairn owns the whole file
 * mode: 'block' — the file belongs to the user; we own a delimited region
 */
export const PLATFORMS = [
  {
    id: 'antigravity',
    name: 'Antigravity',
    target: '.agents/rules/cairn.md',
    mode: 'file',
    limit: 12_000,
    docs: 'https://antigravity.google/docs/rules-workflows/',
    frontmatter: null, // activation is configured in the UI; nothing verified to write here
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    target: 'CLAUDE.md',
    mode: 'block',
    docs: 'https://docs.claude.com/en/docs/claude-code/memory',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    target: '.cursor/rules/cairn.mdc',
    mode: 'file',
    docs: 'https://cursor.com/docs/context/rules',
    frontmatter: [
      'description: Project decisions and constraints recorded in .cairn/',
      'alwaysApply: true',
    ],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    target: '.devin/rules/cairn.md',
    mode: 'file',
    limit: 12_000,
    docs: 'https://docs.devin.ai/desktop/cascade/memories',
    frontmatter: ['trigger: always_on'],
    note: '.windsurf/rules/ is still read as a fallback; .devin/rules/ is the current path.',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    target: '.github/copilot-instructions.md',
    mode: 'block',
    docs: 'https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions',
  },
  {
    id: 'agents',
    name: 'AGENTS.md (shared convention)',
    target: 'AGENTS.md',
    mode: 'block',
    docs: 'https://agents.md/',
  },
];

export function findPlatform(id) {
  return PLATFORMS.find((p) => p.id === id);
}
