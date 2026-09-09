type Topic = { id: string; parent_id: string | null };
type Placement = { concept_id: string; library_node_id: string };

export function getEffectiveTopicNodeIds(
  nodes: Topic[],
  selectedIds: ReadonlySet<string>,
  excludedIds: ReadonlySet<string>,
) {
  const childrenByParent = new Map<string | null, Topic[]>();
  for (const node of nodes) {
    const children = childrenByParent.get(node.parent_id) || [];
    children.push(node);
    childrenByParent.set(node.parent_id, children);
  }

  const effectiveIds = new Set<string>();
  const visiting = new Set<string>();

  function visit(node: Topic, inheritedState: boolean) {
    if (visiting.has(node.id)) return;
    visiting.add(node.id);

    const state = excludedIds.has(node.id)
      ? false
      : selectedIds.has(node.id)
        ? true
        : inheritedState;

    if (state) effectiveIds.add(node.id);
    for (const child of childrenByParent.get(node.id) || []) {
      visit(child, state);
    }

    visiting.delete(node.id);
  }

  for (const root of childrenByParent.get(null) || []) visit(root, false);

  // Malformed/cyclic legacy nodes must not make presentation derivation loop.
  for (const node of nodes) {
    if (!effectiveIds.has(node.id) && !visiting.has(node.id)) visit(node, false);
  }

  return effectiveIds;
}

// Derive display state only. Persisted selections remain explicit and sparse.
export function getTopicSelectionPresentation(
  nodeId: string,
  nodes: Topic[],
  placements: Placement[],
  selectedIds: ReadonlySet<string>,
  excludedIds: ReadonlySet<string>,
  overrides: Record<string, 'included' | 'excluded'>,
) {
  const childrenByParent = new Map<string, Topic[]>();
  for (const node of nodes) {
    if (!node.parent_id) continue;
    const children = childrenByParent.get(node.parent_id) || [];
    children.push(node);
    childrenByParent.set(node.parent_id, children);
  }

  const branchIds = new Set<string>();
  const pending = [nodeId];
  while (pending.length) {
    const current = pending.pop();
    if (!current || branchIds.has(current)) continue;
    branchIds.add(current);
    for (const child of childrenByParent.get(current) || []) pending.push(child.id);
  }

  const effectiveNodeIds = getEffectiveTopicNodeIds(
    nodes,
    selectedIds,
    excludedIds,
  );
  const parents = new Map(nodes.map(node => [node.id, node.parent_id]));
  let nearestDirective: 'included' | 'excluded' | null = null;
  let current: string | null | undefined = nodeId;
  const visitedAncestors = new Set<string>();
  while (current && !visitedAncestors.has(current)) {
    visitedAncestors.add(current);
    if (excludedIds.has(current)) {
      nearestDirective = 'excluded';
      break;
    }
    if (selectedIds.has(current)) {
      nearestDirective = 'included';
      break;
    }
    current = parents.get(current);
  }
  const explicit = selectedIds.has(nodeId);
  const excluded = excludedIds.has(nodeId);
  const excludedByAncestor = !excluded && nearestDirective === 'excluded';
  const effective = effectiveNodeIds.has(nodeId);
  const inherited = effective && !explicit;
  const branchNodes = nodes.filter(node => branchIds.has(node.id));
  const conceptIds = new Set(
    placements
      .filter(placement => branchIds.has(placement.library_node_id))
      .map(placement => placement.concept_id),
  );
  const includedConceptIds = new Set(
    placements
      .filter(placement => effectiveNodeIds.has(placement.library_node_id))
      .map(placement => placement.concept_id),
  );
  const states = [
    ...branchNodes.map(node => effectiveNodeIds.has(node.id)),
    ...[...conceptIds].map(id => overrides[id] === 'included' ||
      (overrides[id] !== 'excluded' && includedConceptIds.has(id))),
  ];
  const any = states.some(Boolean);
  const partial = any && !states.every(Boolean);
  return {
    explicit,
    excluded,
    excludedByAncestor,
    inherited,
    effective,
    checked: any && !partial,
    partial,
  };
}
