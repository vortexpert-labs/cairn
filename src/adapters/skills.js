import fs from 'node:fs';
import path from 'node:path';

/**
 * The recording trigger.
 *
 * The read path was always well specified; the write path said "when
 * something consequential is settled", which is a description, not a trigger.
 * Requiring a person to invoke it was still a trigger that depends on someone
 * noticing a decision happened, which is the discipline that killed ADRs.
 *
 * So detection moved here. Cairn cannot watch a conversation; the agent can, and
 * this is what tells it what to watch for. Drafting is silent and lands as
 * PROPOSED, which governs nothing until a person accepts it — the drafting bar
 * is deliberately lower than the promotion bar, because a bad draft costs
 * seconds to decline while an unrecorded decision is simply gone.
 *
 * Kept short on purpose. A loaded skill stays in context, so every line is a
 * recurring cost, and the list of what NOT to record earns its space by keeping
 * the store small enough to stay worth reading.
 */
export const SKILL_BODY = `Record what the user settles as an anchor in \`.cairn/\`.

Draft quietly while you work. Do not stop to ask: the draft is \`PROPOSED\`, it
governs nothing, and a person decides on it later. Say what you drafted in one
line at the end of your reply.

**Draft when:**

- The user rejects an approach that was actually tried — "we tried Redis for
  sessions and eviction signed people out" — → \`REJECTED_PATH\`. The highest
  value trigger, and the one nothing else captures.
- They state a rule with universal scope. "Never", "always", "must not" widen a
  remark into a rule → \`CONSTRAINT\`.
- They choose between named options and say why → \`DECISION\`. Put what lost in
  \`--alternative\`, or the fork cannot be reopened.
- Something was learned that the code does not show → \`FINDING\`.

**Do not draft when** — this matters more, because a store full of noise costs
the habit itself:

- You worked it out yourself. Only what the *user* settled counts.
- They narrowed it: "for now", "just here", "temporarily".
- It is a task, a one-off preference, or thinking aloud.

When unsure, do not draft. A missed decision costs one conversation; noise costs
the reader.

Before drafting, read \`.cairn/declined.json\` if it exists — anything there was
already turned down, and re-proposing it teaches people to ignore proposals.
Then check all four hold: still true in months; the reason is not visible in the
code; it closes a path or changes what someone does; it fits in three sentences.

\`\`\`
cairn new --title "..." --type CONSTRAINT --scope src/area \\
  --claim "the rule or fact itself" \\
  --rationale "why it holds; the part not visible from the code" \\
  --alternative "what was passed over :: why" \\
  --revisit-if "the condition that would make this wrong"
\`\`\`

If it contradicts an anchor that is already ACTIVE, add \`--supersedes ANC-XXXX\`
instead of writing a second, competing record.

At most three drafts per branch. If the user has said the same thing more than
once, rank it first and say so — repetition is evidence they mean it, never a
reason to promote it yourself.

Never promote your own draft:

\`\`\`
cairn review --proposed          what is waiting
cairn status ANC-0012 ACTIVE     accept; several ids allowed
cairn decline ANC-0012           reject, and do not propose it again
\`\`\``;

const DESCRIPTION =
  'Record a decision, constraint, or abandoned approach as a Cairn anchor. Use whenever the ' +
  'user rejects an approach that was tried, states a rule with universal scope, or chooses ' +
  'between named options — and whenever they ask for something to be written down.';

export const SKILLS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    file: '.claude/skills/anchor-this/SKILL.md',
    docs: 'https://code.claude.com/docs/en/skills',
    frontmatter: ['name: anchor-this', `description: ${DESCRIPTION}`],
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    file: '.agents/skills/anchor-this.md',
    docs: 'https://antigravity.google/docs/cli/plugins/',
    frontmatter: ['name: anchor-this', `description: ${DESCRIPTION}`],
  },
];

export function renderSkill(skill) {
  return ['---', ...skill.frontmatter, '---', '', SKILL_BODY, ''].join('\n');
}

export function skillState(root, skill) {
  const file = path.join(root, skill.file);
  const wanted = renderSkill(skill);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const normalise = (s) => (s ?? '').replace(/\r\n/g, '\n').trim();
  return { file, wanted, current, installed: normalise(current) === normalise(wanted) };
}

export function writeSkill(root, skill) {
  const { file, wanted } = skillState(root, skill);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, wanted, 'utf8');
}
