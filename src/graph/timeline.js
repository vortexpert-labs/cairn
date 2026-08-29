/**
 * Ordering anchors into the history a reader can follow.
 *
 * Nothing here writes a narrative. The order, the supersession chains and the
 * links are already present in the anchors; this only arranges them. That is
 * the whole reason the format can stay terse and still be readable as a story.
 */

export function byDate(anchors) {
  return [...anchors].sort(
    (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id),
  );
}

/**
 * Follow `superseded_by` from an anchor to the newest record replacing it.
 * @returns {string[]} ids from the given anchor to the end of the chain
 */
export function supersessionChain(anchors, id) {
  const byId = new Map(anchors.map((a) => [a.id, a]));
  const chain = [id];
  const seen = new Set(chain);

  let current = byId.get(id);
  while (current?.superseded_by && !seen.has(current.superseded_by)) {
    chain.push(current.superseded_by);
    seen.add(current.superseded_by);
    current = byId.get(current.superseded_by);
  }
  return chain;
}

/** Anchors that nothing supersedes, i.e. the current end of every chain. */
export function heads(anchors) {
  return anchors.filter((a) => !a.superseded_by);
}
