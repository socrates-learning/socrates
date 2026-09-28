/** Wire contract of Migration 109. Presentation placement never supplies selection. */
export type TopicState = {
  group_key: string; topic_id: string; selected: boolean; direct: boolean;
  inherited: boolean; excluded: boolean; partial: boolean;
};
export type SettingsSnapshot = {
  version: number;
  included_topic_ids: string[]; excluded_topic_ids: string[];
  selected_collection_ids: string[]; topic_states: TopicState[];
};
export type HomeSettings = {
  unified_deck_settings: SettingsSnapshot;
  personal_topic_preferences: Record<string, number>;
  personal_collection_preferences: Record<string, number>;
};
export type TopicPlacement = { personal_topic_id: string; library_node_id: string };
export type HomeGroup = {
  id: string; key: string; name: string; parent_id: string | null;
  source: 'official' | 'personal' | 'collection'; children: HomeGroup[];
};
export function composeHomeGroups(
  nodes: readonly { id: string; name: string; parent_id: string | null }[],
  topics: readonly { id: string; name: string; parent_id: string | null; sort_order: number }[],
  placements: readonly TopicPlacement[],
  collections: readonly { id: string; name: string }[],
): HomeGroup[] {
  const byKey = new Map<string, HomeGroup>();
  nodes.forEach(n => byKey.set(`official:topic:${n.id}`, { ...n, key: `official:topic:${n.id}`, source: 'official', children: [] }));
  [...topics].sort((a,b) => a.sort_order-b.sort_order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).forEach(t => byKey.set(`personal:topic:${t.id}`, { ...t, key: `personal:topic:${t.id}`, source: 'personal', children: [] }));
  const placementById = new Map(placements.map(p => [p.personal_topic_id,p.library_node_id]));
  const roots: HomeGroup[] = [];
  for (const node of byKey.values()) {
    const parentKey = node.parent_id ? `${node.source}:topic:${node.parent_id}`
      : node.source === 'personal' && placementById.has(node.id) ? `official:topic:${placementById.get(node.id)}` : null;
    if (parentKey) {
      const parent = byKey.get(parentKey);
      if (!parent) throw new Error('A Topic placement is outside the loaded Library. Its organization cannot be displayed safely.');
      parent.children.push(node);
    } else {
      if (node.source === 'personal') {
        throw new Error('A custom Topic has no canonical placement. Its organization must be repaired before Home can display it.');
      }
      roots.push(node);
    }
  }
  const seen = new Set<string>();
  function visit(n: HomeGroup) {
    if (seen.has(n.key)) throw new Error('Topic hierarchy contains a cycle or duplicate.');
    seen.add(n.key); n.children.forEach(visit);
  }
  roots.forEach(visit);
  if (seen.size !== byKey.size) throw new Error('Topic hierarchy contains an unreachable branch.');
  const orderedRoots = [...roots.filter(n => n.source === 'official').sort((a, b) => a.name.localeCompare(b.name)), ...roots.filter(n => n.source !== 'official')];
  return [...orderedRoots, ...collections.map(c => ({ ...c, key: `personal:collection:${c.id}`, source: 'collection' as const, parent_id: null, children: [] }))];
}
export function requireHomeSettings(data: unknown): HomeSettings {
  const value = data as HomeSettings | null;
  const s = value?.unified_deck_settings;
  if (s?.version !== 109 || !Array.isArray(s.topic_states) || !Array.isArray(s.included_topic_ids)
    || !Array.isArray(s.excluded_topic_ids) || !Array.isArray(s.selected_collection_ids)
    || !value?.personal_topic_preferences || !value?.personal_collection_preferences) {
    throw new Error('Deck settings could not be confirmed. Reload Home before changing settings.');
  }
  return value;
}
export function groupSelection(group: HomeGroup, settings: HomeSettings) {
  const s = settings.unified_deck_settings;
  if (group.source === 'collection') {
    const checked = s.selected_collection_ids.includes(group.id);
    return { checked, explicit: checked, partial: false, inherited: false, excluded: false, excludedByAncestor: false };
  }
  const state = s.topic_states.find(t => t.group_key === group.key);
  if (!state) throw new Error('Topic selection state is missing. Reload Home.');
  const directExclusion = s.excluded_topic_ids.includes(group.id);
  return { checked: state.selected, explicit: state.direct, partial: state.partial,
    inherited: state.inherited, excluded: directExclusion,
    excludedByAncestor: state.excluded && !directExclusion };
}
export type SettingsRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
/** One mutation, then authoritative readback. Never retry a rejected write. */
export async function mutateHomeSettings(rpc: SettingsRpc, deckId: string, libraryId: string,
  kind: 'topic-selection' | 'collection-selection' | 'topic-preference' | 'collection-preference', id: string, value: boolean | number) {
  const collection = kind.startsWith('collection');
  const preference = kind.endsWith('preference');
  const args = { p_deck_id: deckId, [collection ? 'p_collection_id' : 'p_topic_id']: id,
    [preference ? 'p_balance' : 'p_include']: value };
  const result = await rpc(`set_study_deck_personal_${collection ? 'collection' : 'topic'}_${preference ? 'preference' : 'selection'}`, args);
  if (result.error) throw new Error(result.error.message);
  const returned = result.data as Record<string, unknown> | null;
  const valid = preference
    ? returned?.group_key === `personal:${collection ? 'collection' : 'topic'}:${id}` && returned?.new_mastery_balance === value
    : collection ? Array.isArray(returned?.selected_collection_ids)
      : Array.isArray(returned?.selected_personal_topic_ids) && Array.isArray(returned?.excluded_personal_topic_ids);
  if (!valid) throw new Error('Save returned no authoritative state. Reload Home before trying again.');
  const readback = await rpc('get_home_study_bootstrap', { p_library_id: libraryId, p_deck_id: deckId });
  if (readback.error) throw new Error(`The change may have saved, but readback failed: ${readback.error.message}. Reload Home before trying again.`);
  return requireHomeSettings(readback.data);
}
