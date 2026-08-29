import fs from 'node:fs';
import path from 'node:path';
import { HOOKS } from './platforms.js';

export const HOOK_COMMAND = 'cairn';

/** Hook entries Cairn owns are the ones invoking the cairn hook endpoint. */
function isOurs(entry) {
  const text = JSON.stringify(entry ?? {});
  return text.includes(`${HOOK_COMMAND} hook `);
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (raw === '') return {};
  return JSON.parse(raw); // a malformed settings file should surface, not be overwritten
}

/**
 * Merge our hook entries into a settings file that belongs to the user.
 *
 * Only entries invoking `cairn hook` are replaced. Anything else in the file —
 * other hooks, permissions, unrelated settings — is preserved, because this is
 * the user's configuration and we are a guest in it.
 */
export function mergeHooks(existing, wanted) {
  const next = { ...existing, hooks: { ...(existing.hooks || {}) } };

  for (const [event, groups] of Object.entries(wanted)) {
    const others = (next.hooks[event] || []).filter((group) => !isOurs(group));
    next.hooks[event] = [...others, ...groups];
  }

  return next;
}

export function removeHooks(existing) {
  if (!existing.hooks) return existing;

  const hooks = {};
  for (const [event, groups] of Object.entries(existing.hooks)) {
    const kept = groups.filter((group) => !isOurs(group));
    if (kept.length) hooks[event] = kept;
  }

  const next = { ...existing };
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

export function hookState(root, platform) {
  const file = path.join(root, platform.file);
  const existing = readJson(file);
  const wanted = platform.build(HOOK_COMMAND);
  const merged = mergeHooks(existing, wanted);
  return {
    file,
    existing,
    merged,
    installed: JSON.stringify(existing) === JSON.stringify(merged),
  };
}

export function writeHooks(root, platform) {
  const { file, merged } = hookState(root, platform);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

export function uninstallHooks(root) {
  const touched = [];
  for (const platform of HOOKS) {
    const file = path.join(root, platform.file);
    if (!fs.existsSync(file)) continue;

    const existing = readJson(file);
    const next = removeHooks(existing);
    if (JSON.stringify(existing) === JSON.stringify(next)) continue;

    // An otherwise empty settings file we effectively created can go.
    if (Object.keys(next).length === 0) {
      fs.rmSync(file);
      touched.push({ target: platform.file, action: 'delete' });
    } else {
      fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      touched.push({ target: platform.file, action: 'remove hooks' });
    }
  }
  return touched;
}
