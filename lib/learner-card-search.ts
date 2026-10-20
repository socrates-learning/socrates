import type { UnifiedCreatorTopicNode } from './creator-unified-topic-tree';

/** Paths describe the existing hierarchy; the key always identifies a canonical Topic. */
export type LearnerCardTopic = {
  key: string; source: 'official' | 'personal'; topicId: string;
  name: string; paths: string[]; canMove: boolean;
};

export function learnerCardTopics(roots: readonly UnifiedCreatorTopicNode[], unavailableOfficial: readonly string[] = []): LearnerCardTopic[] {
  const result = new Map<string, LearnerCardTopic>();
  const unavailable = new Set(unavailableOfficial);
  function visit(node: UnifiedCreatorTopicNode, ancestors: string[]) {
    const path = [...ancestors, node.name];
    const existing = result.get(node.key);
    if (existing) {
      if (!existing.paths.includes(path.join(' › '))) existing.paths.push(path.join(' › '));
    } else result.set(node.key, { key: node.key, source: node.source, topicId: node.id, name: node.name,
      paths: [path.join(' › ')], canMove: node.source === 'personal' || !unavailable.has(node.id) });
    node.children.forEach(child => visit(child, path));
  }
  roots.forEach(root => visit(root, []));
  return [...result.values()];
}

export type LearnerSearchCard = {
  id: string; front: string; back: string; standalone?: boolean;
  sourceReference?: string | null; topicKeys?: readonly string[];
  createdAt?: string | null; updatedAt?: string | null;
};
export type LearnerCardFilters = {
  text: string; topic: string; dateField: 'createdAt' | 'updatedAt'; from: string; to: string;
};
export const EMPTY_LEARNER_CARD_FILTERS: LearnerCardFilters = { text: '', topic: '', dateField: 'createdAt', from: '', to: '' };

export function filterLearnerCards<T extends LearnerSearchCard>(cards: readonly T[], filters: LearnerCardFilters): T[] {
  const query = filters.text.trim().toLocaleLowerCase();
  if (filters.from && filters.to && filters.from > filters.to) return [];
  return cards.filter(card => {
    if (query && !`${card.front}\n${card.back}\n${card.sourceReference ?? ''}`.toLocaleLowerCase().includes(query)) return false;
    // Exact canonical attachment only. No descendant or shared-branch expansion.
    if (filters.topic && !card.topicKeys?.includes(filters.topic)) return false;
    if (filters.from || filters.to) {
      const timestamp = card[filters.dateField];
      if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return false;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      if (filters.from && date < filters.from || filters.to && date > filters.to) return false;
    }
    return true;
  });
}
