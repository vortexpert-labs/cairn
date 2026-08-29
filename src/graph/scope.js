/**
 * Matching a path against an anchor's `scope`.
 *
 * `scope` is either the literal `global`, a repository-relative path, or a
 * glob. It is the join key for `cairn why`, for editor rules that activate on
 * a file pattern, and for churn detection, so the semantics here decide what
 * every one of those surfaces returns.
 */

const GLOB_CHARS = /[*?]/;

function escape(char) {
  return char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          source += '(?:.*/)?'; // `**/` may match no directories at all
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*'; // a single star stays within one segment
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escape(char);
    }
  }
  return new RegExp(`^${source}$`);
}

export function normalise(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/** True when `parent` is the same path as, or an ancestor directory of, `child`. */
function covers(parent, child) {
  return parent === child || child.startsWith(`${parent}/`);
}

/**
 * Whether an anchor with this scope is relevant to a queried path.
 *
 * Relevance runs both ways on purpose. Asking about `src/billing/invoice.js`
 * should surface an anchor scoped to `src/billing`, and asking about `src`
 * should surface it too — someone asking about a directory wants to know what
 * governs anything inside it, not just rules attached to that exact path.
 */
export function scopeMatches(scope, target) {
  const s = normalise(scope || 'global');
  const t = normalise(target);

  if (s === 'global' || s === '.' || s === '') return true;
  if (t === '' || t === '.') return true;

  if (GLOB_CHARS.test(s)) {
    if (globToRegExp(s).test(t)) return true;
    // A glob like `src/api/**` is also relevant when asking about `src`.
    const literal = normalise(s.split(/[*?]/)[0]).replace(/\/$/, '');
    return literal !== '' && (covers(t, literal) || covers(literal, t));
  }

  return covers(s, t) || covers(t, s);
}

/** Anchors governing a path, most specific scope last. */
export function anchorsFor(anchors, target, { statuses = ['ACTIVE'] } = {}) {
  return anchors
    .filter((a) => statuses.includes(a.status) && scopeMatches(a.scope, target))
    .sort((a, b) => {
      const depth = (x) => (x.scope === 'global' ? -1 : normalise(x.scope).split('/').length);
      return depth(a) - depth(b) || a.id.localeCompare(b.id);
    });
}

/** The literal directory prefix of a scope, for tools that cannot take globs. */
export function scopePrefix(scope) {
  const s = normalise(scope || 'global');
  if (s === 'global' || s === '') return null;
  if (!GLOB_CHARS.test(s)) return s;
  return normalise(s.split(/[*?]/)[0].replace(/\/$/, '')) || null;
}
