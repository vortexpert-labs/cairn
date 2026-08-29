/**
 * Graph relationships between anchors: references, cycles, and the derived
 * "suspect" condition.
 */

const REF_FIELDS = ['supersedes', 'superseded_by', 'invalidated_by', 'depends_on'];

function refsOf(anchor, field) {
  const value = anchor[field];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Every id named by any relation field must exist. */
export function referenceErrors(anchors) {
  const known = new Set(anchors.map((a) => a.id));
  const errors = [];
  for (const anchor of anchors) {
    for (const field of REF_FIELDS) {
      for (const ref of refsOf(anchor, field)) {
        if (!known.has(ref)) {
          errors.push({
            id: anchor.id,
            file: anchor.file,
            message: `${field} names ${ref}, which does not exist`,
          });
        }
      }
    }
  }
  return errors;
}

/**
 * Cycles in the `depends_on` graph, as lists of ids.
 * Iterative so a pathological graph cannot blow the stack.
 */
export function cycles(anchors) {
  const edges = new Map(anchors.map((a) => [a.id, (a.depends_on || []).filter((d) => a.id !== d)]));
  const found = [];
  const state = new Map(); // id -> 'open' | 'done'

  for (const start of edges.keys()) {
    if (state.get(start)) continue;
    const stack = [{ id: start, path: [start] }];

    while (stack.length) {
      const { id, path } = stack.pop();
      if (state.get(id) === 'done') continue;
      state.set(id, 'open');

      for (const next of edges.get(id) || []) {
        if (!edges.has(next)) continue; // missing refs reported separately
        const at = path.indexOf(next);
        if (at !== -1) {
          const cycle = path.slice(at).concat(next);
          const key = [...cycle].sort().join('>');
          if (!found.some((c) => [...c].sort().join('>') === key)) found.push(cycle);
          continue;
        }
        stack.push({ id: next, path: [...path, next] });
      }
      state.set(id, 'done');
    }
  }

  return found;
}

/**
 * Anchors that transitively depend on an INVALIDATED anchor.
 *
 * This is computed at check time rather than stored: an anchor's own status
 * describes the anchor, not the health of its ancestors.
 *
 * @returns {Map<string, string>} id -> the invalidated ancestor it rests on
 */
export function suspects(anchors) {
  const byId = new Map(anchors.map((a) => [a.id, a]));
  const result = new Map();

  for (const anchor of anchors) {
    if (anchor.status === 'INVALIDATED') continue;

    const seen = new Set([anchor.id]);
    const queue = [...(anchor.depends_on || [])];

    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);

      const dep = byId.get(id);
      if (!dep) continue;
      if (dep.status === 'INVALIDATED') {
        result.set(anchor.id, dep.id);
        break;
      }
      queue.push(...(dep.depends_on || []));
    }
  }

  return result;
}
