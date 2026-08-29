import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import * as tools from './tools.js';

/**
 * A Model Context Protocol server over stdio, speaking JSON-RPC 2.0 directly.
 *
 * Written by hand rather than with an SDK to keep the published package free
 * of runtime dependencies. The surface is small — a handful of read tools, one
 * write tool, one resource — and none of it depends on the parts of MCP that
 * change between revisions.
 *
 * stdout carries the protocol and nothing else. Every diagnostic goes to
 * stderr, because a stray console.log here corrupts the session in a way that
 * is genuinely painful to debug from the client side.
 */

const SERVER_VERSION = '1.0.0';
const PREFERRED_PROTOCOL = '2026-07-28';
const KNOWN_PROTOCOLS = ['2026-07-28', '2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'cairn_why',
    description:
      'What this repository has already settled about a path: the constraints, decisions ' +
      'and abandoned approaches governing it, with the reasoning behind each. Call this ' +
      'before editing files in an area you have not touched yet.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repository-relative file or directory path' },
      },
      required: ['path'],
    },
    run: (dir, args) => tools.why(dir, args),
  },
  {
    name: 'cairn_context',
    description:
      'The active anchors for the whole project, or for one scope. Useful once at the ' +
      'start of a task to learn what the project treats as settled.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string', description: 'Optional path to narrow to' } },
    },
    run: (dir, args) => tools.context(dir, args),
  },
  {
    name: 'cairn_show',
    description:
      'One anchor in full, including the alternatives it ruled out. Read this before ' +
      'arguing with a decision, so you argue with the actual reasoning.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Anchor id, for example ANC-0007' } },
      required: ['id'],
    },
    run: (dir, args) => tools.show(dir, args),
  },
  {
    name: 'cairn_timeline',
    description:
      'The history of what was settled and when, oldest first, including which decisions ' +
      'superseded which.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string', description: 'Optional path to narrow to' } },
    },
    run: (dir, args) => tools.timeline(dir, args),
  },
  {
    name: 'cairn_record',
    description:
      'Record something consequential that has just been settled: an architectural ' +
      'decision, a constraint, or an approach that was tried and failed. The anchor is ' +
      'created as PROPOSED and is not binding until a person promotes it. Do not use this ' +
      'for session notes, bug fixes, or anything derivable from the code.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short noun phrase naming the anchor' },
        type: {
          type: 'string',
          enum: ['GOAL', 'STAGE', 'DECISION', 'CONSTRAINT', 'FINDING', 'REJECTED_PATH'],
        },
        claims: {
          type: 'array',
          items: { type: 'string' },
          description: 'The normative content, one statement per item',
        },
        rationale: { type: 'string', description: 'Why it holds; the part not visible in the code' },
        scope: { type: 'string', description: 'Path or glob this governs; defaults to global' },
        alternatives: {
          type: 'array',
          description: 'What was considered and passed over, so the decision can be reopened',
          items: {
            type: 'object',
            properties: {
              option: { type: 'string' },
              rejected_because: { type: 'string' },
            },
            required: ['option', 'rejected_because'],
          },
        },
        revisit_if: { type: 'string', description: 'The condition that would make this wrong' },
      },
      required: ['title', 'claims', 'rationale'],
    },
    run: (dir, args) => tools.record(dir, args),
  },
];

const INDEX_URI = 'cairn://index';

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(value) {
  return { content: [{ type: 'text', text: value }] };
}

function handle(request, dir) {
  const { id, method, params = {} } = request;

  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return reply(id, {
        protocolVersion: KNOWN_PROTOCOLS.includes(asked) ? asked : PREFERRED_PROTOCOL,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'cairn', title: 'Cairn', version: SERVER_VERSION },
        instructions:
          'This repository records its settled decisions and constraints as anchors. ' +
          'Call cairn_why before editing files in an unfamiliar area, obey every ACTIVE ' +
          'constraint, and never re-propose anything recorded as a REJECTED_PATH.',
      });
    }

    case 'ping':
      return reply(id, {});

    case 'tools/list':
      return reply(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });

    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `unknown tool: ${params.name}`);
      try {
        return reply(id, text(tool.run(dir, params.arguments || {})));
      } catch (error) {
        // A tool that could not do its job reports back in-band; the call
        // itself succeeded, so this is not a JSON-RPC error.
        return reply(id, { ...text(`cairn: ${error.message}`), isError: true });
      }
    }

    case 'resources/list':
      return reply(id, {
        resources: [{
          uri: INDEX_URI,
          name: 'Project orientation index',
          description: 'Project stage, goals, and the register of anchors',
          mimeType: 'text/markdown',
        }],
      });

    case 'resources/read': {
      if (params.uri !== INDEX_URI) return fail(id, -32602, `unknown resource: ${params.uri}`);
      const file = path.join(dir, 'INDEX.md');
      if (!fs.existsSync(file)) return fail(id, -32602, 'no index in this repository');
      return reply(id, {
        contents: [{ uri: INDEX_URI, mimeType: 'text/markdown', text: fs.readFileSync(file, 'utf8') }],
      });
    }

    default:
      return fail(id, -32601, `method not found: ${method}`);
  }
}

export function serve({ dir }) {
  const input = readline.createInterface({ input: process.stdin, terminal: false });

  input.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    }

    // Notifications carry no id and expect no response.
    if (request.id === undefined || request.id === null) return;

    try {
      handle(request, dir);
    } catch (error) {
      process.stderr.write(`cairn mcp: ${error.stack}\n`);
      fail(request.id, -32603, 'internal error');
    }
  });

  return new Promise((resolve) => input.on('close', () => resolve(0)));
}
