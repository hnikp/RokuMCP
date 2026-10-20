/**
 * Focus-chain walk over a parsed `query/app-ui` tree (fast-xml-parser output with
 * `@_`-prefixed attributes; child elements keyed by tag, as an object or an array).
 *
 * A real device marks every node on the focus chain with focused="true" (screen →
 * Scene → … → RowList → RowListItem → RowCell), so the first match in document order
 * is always <screen>. Unrelated subtrees also carry focused="true" (each RowListItem's
 * current cell, a nav bar's checked item), so a global "last match" is wrong too.
 * The leaf is found by starting at the root and, at each level, descending into the
 * first focused child until no child is focused. Some containers on the chain are not
 * marked themselves (a RowListItem's inner MarkupGrid sits between it and the focused
 * RowCell), so when no direct child is focused the walk searches the descendants
 * breadth-first before stopping.
 */

export interface FocusPathResult {
  /** Attributes of the deepest focused node, without the `@_` prefix. */
  focused: Record<string, unknown>;
  /** One entry per node on the chain: `<tag>#<name or id>`, or just `<tag>`. */
  path: string[];
}

type XmlNode = Record<string, unknown>;

function isFocused(node: XmlNode): boolean {
  const v = node['@_focused'];
  return v === true || v === 'true';
}

/** Child elements of a node in document order (as far as the parser keeps it), with their tag names. */
function childElements(node: XmlNode): { tag: string; node: XmlNode }[] {
  const out: { tag: string; node: XmlNode }[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_') || key === '#text') continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item && typeof item === 'object') out.push({ tag: key, node: item as XmlNode });
    }
  }
  return out;
}

export function nodeAttributes(node: XmlNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('@_')) attrs[k.slice(2)] = v;
  }
  return attrs;
}

function label(tag: string, node: XmlNode): string {
  const name = node['@_name'] ?? node['@_id'];
  return name !== undefined && name !== '' ? `${tag}#${name}` : tag;
}

/**
 * Walk the focus chain from the root. Returns null when no node is focused.
 * Wrapper elements without a focused flag (app-ui, topscreen) are searched breadth-first
 * for the first focused element, which becomes the top of the chain.
 */
/** The first focused element below `node`, breadth-first (nearest level wins). */
function firstFocusedBelow(node: XmlNode): { tag: string; node: XmlNode } | undefined {
  let queue = childElements(node);
  while (queue.length > 0) {
    const hit = queue.find((c) => isFocused(c.node));
    if (hit) return hit;
    queue = queue.flatMap((c) => childElements(c.node));
  }
  return undefined;
}

/**
 * Walk the focus chain from the root. Returns null when no node is focused.
 * Wrapper elements without a focused flag (app-ui, topscreen) are skipped the same way
 * as unmarked containers further down: `path` lists only the focused nodes.
 */
export function findFocusPath(parsed: unknown): FocusPathResult | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const top = firstFocusedBelow(parsed as XmlNode);
  if (!top) return null;

  const path = [label(top.tag, top.node)];
  let current = top.node;
  for (;;) {
    const next = firstFocusedBelow(current);
    if (!next) break;
    path.push(label(next.tag, next.node));
    current = next.node;
  }

  return { focused: nodeAttributes(current), path };
}
