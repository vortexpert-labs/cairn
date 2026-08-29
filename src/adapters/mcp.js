import fs from 'node:fs';
import path from 'node:path';

export const SERVER_KEY = 'cairn';
const COMMAND = 'cairn';

/**
 * Where each agent reads project-level MCP configuration.
 *
 * All three use a top-level `mcpServers` object; only Cursor requires the
 * explicit `type` field. Paths verified against each platform's own docs.
 */
export const MCP_TARGETS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    file: '.mcp.json',
    docs: 'https://code.claude.com/docs/en/mcp',
    entry: { command: COMMAND, args: ['mcp'] },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    file: '.cursor/mcp.json',
    docs: 'https://cursor.com/docs/context/mcp',
    entry: { type: 'stdio', command: COMMAND, args: ['mcp'] },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    file: '.agents/mcp_config.json',
    docs: 'https://antigravity.google/docs/mcp/',
    entry: { command: COMMAND, args: ['mcp'] },
  },
];

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').trim();
  return raw === '' ? {} : JSON.parse(raw);
}

/** Add our server without disturbing any others the user has configured. */
export function mergeServer(existing, entry) {
  return {
    ...existing,
    mcpServers: { ...(existing.mcpServers || {}), [SERVER_KEY]: entry },
  };
}

export function removeServer(existing) {
  if (!existing.mcpServers || !(SERVER_KEY in existing.mcpServers)) return existing;

  const servers = { ...existing.mcpServers };
  delete servers[SERVER_KEY];

  const next = { ...existing };
  if (Object.keys(servers).length) next.mcpServers = servers;
  else delete next.mcpServers;
  return next;
}

export function mcpState(root, target) {
  const file = path.join(root, target.file);
  const existing = readJson(file);
  const merged = mergeServer(existing, target.entry);
  return { file, existing, merged, installed: JSON.stringify(existing) === JSON.stringify(merged) };
}

export function writeServer(root, target) {
  const { file, merged } = mcpState(root, target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

export function uninstallServers(root) {
  const touched = [];
  for (const target of MCP_TARGETS) {
    const file = path.join(root, target.file);
    if (!fs.existsSync(file)) continue;

    const existing = readJson(file);
    const next = removeServer(existing);
    if (JSON.stringify(existing) === JSON.stringify(next)) continue;

    if (Object.keys(next).length === 0) {
      fs.rmSync(file);
      touched.push({ target: target.file, action: 'delete' });
    } else {
      fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      touched.push({ target: target.file, action: 'remove server' });
    }
  }
  return touched;
}
