export type ConceptTopic = {
  id: string;
  name: string;
  children: ConceptTopic[];
};

export type ConceptTopicRow = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
};

export function buildConceptTopicTree(rows: ConceptTopicRow[]): ConceptTopic[] {
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
  ancestors: ConceptTopic[] = []
): ConceptTopic[] | null {
  for (const topic of topics) {
    const path = [...ancestors, topic];
    if (topic.id === topicId) return path;
    const nested = findConceptTopicPath(topic.children, topicId, path);
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
  topics.forEach((topic) => {
    const nextAncestors = [...ancestors, topic.id];
    if (topic.name.toLocaleLowerCase().includes(query)) {
      nextAncestors.forEach((id) => visible.add(id));
    }
    collectConceptTopicSearchIds(topic.children, query, nextAncestors).forEach(
      (id) => visible.add(id)
    );
  });
  return visible;
}
