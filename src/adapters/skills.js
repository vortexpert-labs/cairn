import fs from 'node:fs';
import path from 'node:path';

/**
 * The recording trigger.
 *
 * The read path was always well specified; the write path said "when
 * something consequential is settled", which is a description, not a trigger.
 * This gives it one: a command a person invokes at the moment they decide
 * something, so the cost of keeping the record is one word and a review.
 *
 * Kept short on purpose. A loaded skill stays in context, so every line is a
 * recurring cost.
 */
export const SKILL_BODY = `Record what was just settled as an anchor in \`.cairn/\`.

First check it is worth recording. All four must hold:

1. It will still be true in months, not days.
2. The reason is not visible in the code.
3. It stops someone repeating a path that is now closed.
4. It fits in one to three sentences.

If any of them fails, say so and stop. Most things are not anchors, and a
project with a hundred of them has become a wiki nobody reads.

Then choose the type:

- \`DECISION\` — chose X over Y. Record what was passed over in \`--alternative\`,
  or the decision cannot be reopened later.
- \`CONSTRAINT\` — a rule that must hold. May be positive or negative.
- \`REJECTED_PATH\` — actually tried, and abandoned. Different from a rejected
  alternative, which was only considered.
- \`FINDING\` — learned empirically, not visible in the code.
- \`GOAL\` or \`STAGE\` — what the project is aiming at, or what phase it is in.

Then run:

\`\`\`
cairn new --title "..." --type DECISION \\
  --scope src/area \\
  --claim "the rule or fact itself" \\
  --rationale "why it holds; the part not visible from the code" \\
  --alternative "what was passed over :: why"
\`\`\`

Add \`--revisit-if "..."\` when there is a condition that would make it wrong.

The anchor is written as \`PROPOSED\`. Tell the user it is not binding until
they promote it with \`cairn status <id> ACTIVE\`, and show them the file so
they can read what you wrote before agreeing to it.`;

const DESCRIPTION =
  'Record a decision, constraint, or abandoned approach as a Cairn anchor. Use when an ' +
  'architectural choice has just been made, a new rule agreed, or an approach tried and ' +
  'given up on, or when the user asks to write something down.';

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
