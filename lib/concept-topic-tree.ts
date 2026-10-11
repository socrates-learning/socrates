import { topicGraphOccurrences, type OfficialTopicGraph } from './topic-placement-graph';
import { compareCreatorTopics } from './creator-topic-order.js';
export type ConceptTopic = {
  id: string;
  name: string;
  children: ConceptTopic[];
  occurrenceKey?: string;
  edgeKey?: string | null;
  originalPath?: boolean;
  shared?: boolean;
  originalParentId?: string | null;
};

export type ConceptTopicRow = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
};

export function buildConceptTopicTree(rows: ConceptTopicRow[], canonical = false, graph?: OfficialTopicGraph | null): ConceptTopic[] {
  if (graph) return topicGraphOccurrences(graph);
  const topicsById = new Map<string, ConceptTopic>();
  const rowById = new Map(rows.map((row) => [row.id, row]));

  rows.forEach((row) => {
    topicsById.set(row.id, { id: row.id, name: row.name, children: [] });
  });

  const roots: ConceptTopic[] = [];
  rows.forEach((row) => {
    const topic = topicsById.get(row.id);
    if (!topic) return;

    const parent = row.parent_id ? topicsById.get(row.parent_id) : null;
    if (parent) parent.children.push(topic);
    else roots.push(topic);
  });

  function sortTopics(topics: ConceptTopic[]) {
    topics.sort((left, right) => {
      const leftRow = rowById.get(left.id);
      const rightRow = rowById.get(right.id);
      if (canonical && leftRow && rightRow) return compareCreatorTopics(leftRow, rightRow);
      const orderDifference =
        (leftRow?.sort_order ?? 0) - (rightRow?.sort_order ?? 0);

      return orderDifference || left.name.localeCompare(right.name);
    });
    topics.forEach((topic) => sortTopics(topic.children));
  }

  sortTopics(roots);
  return roots;
}

export function findConceptTopicPath(
  topics: ConceptTopic[],
  topicId: string,
  ancestors: ConceptTopic[] = [],
  visited: Set<string> = new Set()
): ConceptTopic[] | null {
  for (const topic of topics) {
    if (topic.originalPath === false || visited.has(topic.id)) continue;
    visited.add(topic.id);
    const path = [...ancestors, topic];
    if (topic.id === topicId) return path;
    const nested = findConceptTopicPath(topic.children, topicId, path, visited);
    if (nested) return nested;
  }
  return null;
}

export function collectConceptTopicSearchIds(
  topics: ConceptTopic[],
  query: string,
  ancestors: string[] = []
): Set<string> {
  const visible = new Set<string>();
  // Work on canonical adjacency, not the potentially exponential occurrence tree.
  const seen = new Set<string>(), parents = new Map<string, Set<string>>(), matches: string[] = [];
  function scan(items: ConceptTopic[], parent?: string) {
    for (const topic of items) {
      if (parent) parents.set(topic.id, new Set([...(parents.get(topic.id) ?? []), parent]));
      if (seen.has(topic.id)) continue;
      seen.add(topic.id);
      if (topic.name.toLocaleLowerCase().includes(query)) matches.push(topic.id);
      scan(topic.children, topic.id);
    }
  }
  scan(topics);
  while (matches.length) {
    const id = matches.pop()!;
    if (visible.has(id)) continue;
    visible.add(id); matches.push(...(parents.get(id) ?? []));
  }
  if (visible.size) ancestors.forEach(id => visible.add(id));
  // Preserve ancestor-before-child iteration order used by existing browse/search callers.
  const ordered = new Set<string>(), emitted = new Set<string>();
  function emit(items: ConceptTopic[]) {
    for (const topic of items) { if (emitted.has(topic.id)) continue; emitted.add(topic.id); if (visible.has(topic.id)) ordered.add(topic.id); emit(topic.children); }
  }
  if (visible.size) ancestors.forEach(id => ordered.add(id));
  emit(topics);
  return ordered;
}
