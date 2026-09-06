type Topic = { id: string; parent_id: string | null };
type Placement = { concept_id: string; library_node_id: string };

// Derive display state only. Persisted selections remain explicit and sparse.
export function getTopicSelectionPresentation(
  nodeId: string,
  nodes: Topic[],
  placements: Placement[],
  selectedIds: ReadonlySet<string>,
  overrides: Record<string, 'included' | 'excluded'>,
) {
  const parents = new Map(nodes.map(node => [node.id, node.parent_id]));
  function covered(id: string, ancestorId?: string) {
    const visited = new Set<string>();
    let current: string | null | undefined = id;
    while (current && !visited.has(current)) {
      if (ancestorId ? current === ancestorId : selectedIds.has(current)) return true;
      visited.add(current);
      current = parents.get(current);
    }
    return false;
  }
  const explicit = selectedIds.has(nodeId);
  const inherited = covered(parents.get(nodeId) || '');
  const branchNodes = nodes.filter(node => covered(node.id, nodeId));
  const branchIds = new Set(branchNodes.map(node => node.id));
  const conceptIds = new Set(placements.filter(p => branchIds.has(p.library_node_id)).map(p => p.concept_id));
  const includedConceptIds = new Set(placements.filter(p => covered(p.library_node_id)).map(p => p.concept_id));
  const states = [
    ...branchNodes.map(node => covered(node.id)),
    ...[...conceptIds].map(id => overrides[id] === 'included' ||
      (overrides[id] !== 'excluded' && includedConceptIds.has(id))),
  ];
  const any = states.some(Boolean);
  const partial = any && !states.every(Boolean);
  return { explicit, inherited, checked: any && !partial, partial };
}
