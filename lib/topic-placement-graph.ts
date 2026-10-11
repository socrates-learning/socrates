/** Canonical identities and incoming edges are distinct from visible occurrences. */
export type OfficialTopicNode = {
  id: string; library_id?: string; name: string; parent_id: string | null; sort_order: number | null;
};
export type OfficialTopicEdge = {
  edge_key: string; parent_id: string; topic_id: string; sort_order: number; kind: 'primary' | 'placement';
};
export type OfficialTopicGraph = {
  version: 122; library_id: string; revision: string; root_id: string | null;
  nodes: OfficialTopicNode[]; edges: OfficialTopicEdge[];
};
export type TopicOccurrence = {
  id: string; name: string; occurrenceKey: string; edgeKey: string | null;
  originalPath: boolean; originalParentId: string | null; shared: boolean; children: TopicOccurrence[];
};
export function indexTopicGraph(graph: OfficialTopicGraph) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const children = new Map<string, OfficialTopicEdge[]>(), incoming = new Map<string, OfficialTopicEdge[]>();
  const keys = new Set<string>(), pairs = new Set<string>();
  const invalid = () => { throw new Error('The official Topic graph is invalid. Reload the Library.'); };
  if (nodes.size !== graph.nodes.length || graph.nodes.some(n => n.library_id && n.library_id !== graph.library_id)) invalid();
  const roots = graph.nodes.filter(n => n.parent_id === null);
  if (roots.length !== (nodes.size ? 1 : 0) || (roots[0]?.id ?? null) !== graph.root_id) invalid();
  for (const e of graph.edges) {
    const node = nodes.get(e.topic_id), pair = `${e.parent_id}/${e.topic_id}`;
    if (!node || !nodes.has(e.parent_id) || e.topic_id === graph.root_id || keys.has(e.edge_key) || pairs.has(pair)
      || !Number.isInteger(e.sort_order) || e.sort_order < 0
      || (e.kind === 'primary' ? e.edge_key !== `primary:${e.topic_id}` || node.parent_id !== e.parent_id
        : e.kind !== 'placement' || !e.edge_key.startsWith('placement:'))) invalid();
    keys.add(e.edge_key); pairs.add(pair);
    children.set(e.parent_id, [...(children.get(e.parent_id) ?? []), e]);
    incoming.set(e.topic_id, [...(incoming.get(e.topic_id) ?? []), e]);
  }
  for (const n of graph.nodes) if (n.parent_id !== null && !(incoming.get(n.id) ?? []).some(e => e.kind === 'primary')) invalid();
  children.forEach(edges => edges.sort((a,b) => a.sort_order-b.sort_order || a.edge_key.localeCompare(b.edge_key)));
  const remaining = new Map(graph.nodes.map(n => [n.id, incoming.get(n.id)?.length ?? 0]));
  const queue = roots.map(n => n.id), order: string[] = [], paths = new Map<string, number>(roots.map(n => [n.id, 1]));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]; order.push(id);
    for (const e of children.get(id) ?? []) {
      // Only the distinction between one and several paths is needed, never enumerate paths.
      paths.set(e.topic_id, Math.min(2, (paths.get(e.topic_id) ?? 0) + (paths.get(id) ?? 0)));
      remaining.set(e.topic_id, remaining.get(e.topic_id)! - 1);
      if (remaining.get(e.topic_id) === 0) queue.push(e.topic_id);
    }
  }
  if (order.length !== nodes.size) invalid();
  return { nodes, children, incoming, order, shared: new Set(order.filter(id => paths.get(id) === 2)) };
}
export function requireTopicGraph(value: unknown, libraryId: string): OfficialTopicGraph {
  const g = value as OfficialTopicGraph | null;
  if (!g || g.version !== 122 || g.library_id !== libraryId || typeof g.revision !== 'string'
    || !/^[a-f0-9]{32}$/.test(g.revision) || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) {
    throw new Error('The official Topic graph could not be confirmed for this Library.');
  }
  indexTopicGraph(g);
  return g;
}
export function topicDescendantIds(graph: OfficialTopicGraph, topicId: string, originalOnly = false): Set<string> {
  const index = indexTopicGraph(graph), pending = [topicId], found = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (found.has(id) || !index.nodes.has(id)) continue;
    found.add(id);
    for (const edge of index.children.get(id) ?? []) if (!originalOnly || edge.kind === 'primary') pending.push(edge.topic_id);
  }
  return found;
}
export function originalTopicOccurrenceKey(graph: OfficialTopicGraph, id: string): string {
  const nodes = new Map(graph.nodes.map(n => [n.id, n])), path: string[] = [], seen = new Set<string>();
  for (let node = nodes.get(id); node; node = node.parent_id ? nodes.get(node.parent_id) : undefined) {
    if (seen.has(node.id)) throw new Error('Topic hierarchy contains a cycle.');
    seen.add(node.id); path.unshift(`primary:${node.id}`);
  }
  return path.join('/');
}
/** Children materialize one level at a time; a collapsed diamond has constant-size UI state. */
export function topicGraphOccurrences(graph: OfficialTopicGraph): TopicOccurrence[] {
  const index = indexTopicGraph(graph);
  function occurrence(id: string, key: string, edgeKey: string | null, originalPath: boolean): TopicOccurrence {
    const node = index.nodes.get(id)!;
    let children: TopicOccurrence[] | undefined;
    return { id, name: node.name, occurrenceKey: key, edgeKey, originalPath, originalParentId: node.parent_id, shared: index.shared.has(id),
      get children() { return children ??= (index.children.get(id) ?? []).map(e => occurrence(e.topic_id, `${key}/${e.edge_key}`, e.edge_key, originalPath && e.kind === 'primary')); } };
  }
  return graph.root_id ? [occurrence(graph.root_id, `primary:${graph.root_id}`, null, true)] : [];
}
export function effectiveGraphTopicIds(graph: OfficialTopicGraph, selected: ReadonlySet<string>, excluded: ReadonlySet<string>): Set<string> {
  const index = indexTopicGraph(graph), result = new Set<string>();
  for (const id of index.order) {
    const inherited = (index.incoming.get(id) ?? []).some(e => result.has(e.parent_id));
    if ((index.shared.has(id) || !excluded.has(id)) && (selected.has(id) || inherited)) result.add(id);
  }
  return result;
}

/** Legacy canonical expansion seeds apply only to the all-original occurrence. */
export function occurrenceExpanded(node: { id: string; occurrenceKey?: string; originalPath?: boolean }, keys: ReadonlySet<string>) {
  return keys.has(node.occurrenceKey || node.id) || (node.originalPath !== false && keys.has(node.id));
}
export function toggleOccurrenceKey(keys: ReadonlySet<string>, key: string): Set<string> {
  const legacy = key.split('/').every(part => part.startsWith('primary:')) ? key.split('/').at(-1)!.slice(8) : key;
  const next = new Set(keys);
  if (next.has(key) || next.has(legacy)) { next.delete(key); next.delete(legacy); }
  else next.add(key);
  return next;
}

/** Authenticated and Library-qualified. No fallback to an incomplete canonical-only read. */
export async function loadOfficialTopicGraph(client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }, libraryId: string) {
  const result = await client.rpc('get_official_topic_graph', { p_library_id: libraryId });
  if (result.error) throw new Error(`Unable to load Topic placements: ${result.error.message}`);
  return requireTopicGraph(result.data, libraryId);
}

/** Resolve only a real root-to-row path; never enumerate every path through a DAG. */
export function topicOccurrencePath(graph: OfficialTopicGraph, key: string): OfficialTopicNode[] | null {
  const index = indexTopicGraph(graph), parts = key.split('/');
  if (!graph.root_id || parts.shift() !== `primary:${graph.root_id}`) return null;
  const path = [index.nodes.get(graph.root_id)!];
  for (const part of parts) {
    const edge = index.children.get(path[path.length - 1].id)?.find(e => e.edge_key === part);
    if (!edge) return null;
    path.push(index.nodes.get(edge.topic_id)!);
  }
  return path;
}
/** Find one deterministic descendant route under the actual clicked occurrence. */
export function descendantOccurrenceKey(graph: OfficialTopicGraph, from: string, target: string): string | null {
  const path = topicOccurrencePath(graph, from);
  if (!path) return null;
  const index = indexTopicGraph(graph), pending = [{id: path[path.length - 1].id, key: from}], seen = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    if (item.id === target) return item.key;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    for (const e of index.children.get(item.id) ?? []) pending.push({id: e.topic_id, key: `${item.key}/${e.edge_key}`});
  }
  return null;
}
