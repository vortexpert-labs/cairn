import fs from 'node:fs';
import path from 'node:path';
import { PLATFORMS, HOOKS } from '../adapters/platforms.js';
import { hookState, writeHooks } from '../adapters/hooks.js';
import { MCP_TARGETS, mcpState, writeServer } from '../adapters/mcp.js';
import { SKILLS, skillState, writeSkill } from '../adapters/skills.js';
import { renderAdapter, injectBlock, extractBlock } from '../adapters/render.js';
import { style, symbol } from '../render/terminal.js';

function targetPath(root, platform) {
  return path.join(root, platform.target);
}

/** What the file should contain, and what it does contain. */
function inspect(root, platform) {
  const file = targetPath(root, platform);
  const wanted = renderAdapter(platform);
  const exists = fs.existsSync(file);
  const current = exists ? fs.readFileSync(file, 'utf8') : null;
  const present = platform.mode === 'block' ? extractBlock(current) : current;

  const normalise = (s) => (s ?? '').replace(/\r\n/g, '\n').trim();
  return { file, wanted, exists, current, present, matches: normalise(present) === normalise(wanted) };
}

export function adapters({ root, options }) {
  const selected = options.platform
    ? PLATFORMS.filter((p) => p.id === options.platform)
    : PLATFORMS;

  if (options.platform && selected.length === 0) {
    console.error(
      `unknown platform '${options.platform}'. Known: ${PLATFORMS.map((p) => p.id).join(', ')}`,
    );
    return 2;
  }

  if (options.list) {
    console.log(style.bold('Adapters Cairn generates\n'));
    for (const platform of PLATFORMS) {
      console.log(`  ${style.bold(platform.id.padEnd(14))}${platform.target}`);
      console.log(`  ${' '.repeat(14)}${style.dim(platform.docs)}`);
      if (platform.note) console.log(`  ${' '.repeat(14)}${style.dim(platform.note)}`);
    }
    console.log(`\n${style.bold('Hooks')}\n`);
    for (const platform of HOOKS) {
      console.log(`  ${style.bold(platform.id.padEnd(14))}${platform.file}`);
      console.log(`  ${' '.repeat(14)}${style.dim(platform.docs)}`);
    }
    console.log(`\n${style.bold('Skills')}\n`);
    for (const skill of SKILLS) {
      console.log(`  ${style.bold(skill.id.padEnd(14))}${skill.file}`);
      console.log(`  ${' '.repeat(14)}${style.dim(skill.docs)}`);
    }
    console.log(`\n${style.bold('MCP server')}\n`);
    for (const target of MCP_TARGETS) {
      console.log(`  ${style.bold(target.id.padEnd(14))}${target.file}`);
      console.log(`  ${' '.repeat(14)}${style.dim(target.docs)}`);
    }
    console.log(
      `\n${style.dim('Every path above comes from the documentation of the platform it targets.')}`,
    );
    return 0;
  }

  const results = selected.map((platform) => ({ platform, ...inspect(root, platform) }));

  if (options.write) {
    let changed = 0;
    for (const result of results) {
      if (result.matches) continue;

      // A file we do not own gets a delimited region; the rest is left alone.
      const next =
        result.platform.mode === 'block'
          ? injectBlock(result.current, result.wanted)
          : result.wanted;

      if (result.platform.limit && next.length > result.platform.limit) {
        console.error(
          `${style.red(symbol.error)} ${result.platform.target} would be ${next.length} ` +
            `characters; ${result.platform.name} caps rules files at ${result.platform.limit}`,
        );
        return 1;
      }

      fs.mkdirSync(path.dirname(result.file), { recursive: true });
      fs.writeFileSync(result.file, next, 'utf8');
      console.log(`${style.green(symbol.ok)} ${result.platform.target}`);
      changed++;
    }
    for (const platform of HOOKS) {
      if (options.platform && options.platform !== platform.id) continue;
      if (hookState(root, platform).installed) continue;
      writeHooks(root, platform);
      console.log(`${style.green(symbol.ok)} ${platform.file} ${style.dim('(hooks)')}`);
      changed++;
    }

    for (const skill of SKILLS) {
      if (options.platform && options.platform !== skill.id) continue;
      if (skillState(root, skill).installed) continue;
      writeSkill(root, skill);
      console.log(`${style.green(symbol.ok)} ${skill.file} ${style.dim('(skill)')}`);
      changed++;
    }

    for (const target of MCP_TARGETS) {
      if (options.platform && options.platform !== target.id) continue;
      if (mcpState(root, target).installed) continue;
      writeServer(root, target);
      console.log(`${style.green(symbol.ok)} ${target.file} ${style.dim('(mcp)')}`);
      changed++;
    }

    if (changed === 0) console.log(`${style.green(symbol.ok)} every adapter is already current.`);
    return 0;
  }

  // Default and --check: report drift without touching anything.
  const staleHooks = HOOKS
    .filter((platform) => !options.platform || options.platform === platform.id)
    .filter((platform) => !hookState(root, platform).installed);

  const staleSkills = SKILLS
    .filter((skill) => !options.platform || options.platform === skill.id)
    .filter((skill) => !skillState(root, skill).installed);

  const staleMcp = MCP_TARGETS
    .filter((target) => !options.platform || options.platform === target.id)
    .filter((target) => !mcpState(root, target).installed);

  const stale = results.filter((r) => !r.matches);
  if (stale.length === 0 && staleHooks.length === 0 && staleMcp.length === 0 && staleSkills.length === 0) {
    console.log(`${style.green(symbol.ok)} ${results.length} adapter(s) match the generator.`);
    return 0;
  }

  for (const platform of staleHooks) {
    console.error(`${style.red(symbol.error)} ${platform.file}  hooks not installed`);
  }
  for (const skill of staleSkills) {
    console.error(`${style.red(symbol.error)} ${skill.file}  skill not written`);
  }
  for (const target of staleMcp) {
    console.error(`${style.red(symbol.error)} ${target.file}  mcp server not registered`);
  }
  for (const result of stale) {
    const reason = !result.exists
      ? 'not written yet'
      : result.present === null
        ? 'no Cairn region in this file'
        : 'differs from the generator';
    console.error(`${style.red(symbol.error)} ${result.platform.target}  ${reason}`);
  }
  console.error(`\nRun ${style.bold('cairn adapters --write')} to bring them up to date.`);
  return 1;
}
