import { requireTopicGraph, topicGraphOccurrences, locationId, locationDescendants, type OfficialTopicGraph, type TopicOccurrence } from './topic-placement-graph';
/** Wire contract of Migration 109. Presentation placement never supplies selection. */
export type TopicState = {
  group_key: string; topic_id: string; selected: boolean; direct: boolean;
  inherited: boolean; excluded: boolean; partial: boolean;
};
export type SettingsSnapshot = {
  version: number;
  included_topic_ids: string[]; excluded_topic_ids: string[];
  selected_collection_ids: string[]; topic_states: TopicState[];
  topic_preference_state?: TopicPreferenceState;
};
export type TopicPreferenceState = {
  version: 117 | 122; deck_id: string; library_id: string; revision: string;
  values: Record<string, number>;
};
export type HomeSettings = {
  official_topic_graph?: OfficialTopicGraph;
  location_selection?: { version: 132; graph_revision: string; states: {
    location_id: string; topic_id: string; included: boolean; direct: boolean; source_location_id: string | null; distance: number;
  }[] };
  unified_deck_settings: SettingsSnapshot;
  personal_topic_preferences: Record<string, number>;
  personal_collection_preferences: Record<string, number>;
};
export type TopicPlacement = { personal_topic_id: string; library_node_id: string };
export type HomeGroup = {
  id: string; key: string; name: string; parent_id: string | null;
  source: 'official' | 'personal' | 'collection'; children: HomeGroup[];
  occurrenceKey?: string; shared?: boolean; originalPath?: boolean;
};
export function composeHomeGroups(
  nodes: readonly { id: string; name: string; parent_id: string | null }[],
  topics: readonly { id: string; name: string; parent_id: string | null; sort_order: number }[],
  placements: readonly TopicPlacement[],
  collections: readonly { id: string; name: string }[],
  graph?: OfficialTopicGraph | null,
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
  function project(n: TopicOccurrence): HomeGroup {
    const original = byKey.get(`official:topic:${n.id}`);
    if (!original) throw new Error('Official Topic graph and Home material do not match. Reload Home.');
    let children: HomeGroup[] | undefined;
    return { ...original, occurrenceKey: n.occurrenceKey, shared: n.shared, originalPath: n.originalPath,
      get children() { return children ??= [...n.children.map(project), ...(n.originalPath ? original.children.filter(c => c.source === 'personal') : [])]; } };
  }
  const officialRoots = graph ? topicGraphOccurrences(graph).map(project) : orderedRoots;
  return [...officialRoots, ...collections.map(c => ({ ...c, key: `personal:collection:${c.id}`, source: 'collection' as const, parent_id: null, children: [] }))];
}
export function requireHomeSettings(data: unknown): HomeSettings {
  const value = data as HomeSettings | null;
  const s = value?.unified_deck_settings;
  if (s?.version !== 109 || !Array.isArray(s.topic_states) || !Array.isArray(s.included_topic_ids)
    || !Array.isArray(s.excluded_topic_ids) || !Array.isArray(s.selected_collection_ids)
    || !value?.personal_topic_preferences || !value?.personal_collection_preferences) {
    throw new Error('Deck settings could not be confirmed. Reload Home before changing settings.');
  }
  if (value.official_topic_graph) {
    const libraryId = s.topic_preference_state?.library_id;
    if (!libraryId) throw new Error('Topic graph has no confirmed Library settings.');
    requireTopicGraph(value.official_topic_graph, libraryId);
    if (value.official_topic_graph.version === 132 && (value.location_selection?.version !== 132
      || value.location_selection.graph_revision !== value.official_topic_graph.revision || !Array.isArray(value.location_selection.states))) {
      throw new Error('Topic location selection could not be confirmed. Reload Home.');
    }
  }
  return value;
}
export function locationSelection(group: { occurrenceKey?: string }, settings: HomeSettings) {
  const graph = settings.official_topic_graph, states = settings.location_selection?.states;
  if (graph?.version !== 132 || !group.occurrenceKey || !states) throw new Error('Confirmed Topic location required.');
  const id = locationId(group.occurrenceKey), own = states.find(s => s.location_id === id);
  if (!own) throw new Error('The Topic location is no longer available. Reload Home.');
  const descendants = locationDescendants(graph,id), branch = states.filter(s => descendants.has(s.location_id));
  const any = branch.some(s => s.included), all = branch.every(s => s.included);
  return { checked: all && any, partial: any && !all, explicit: own.direct && own.included,
    inherited: !own.direct && own.included, excluded: own.direct && !own.included,
    excludedByAncestor: !own.direct && !own.included && own.source_location_id !== null };
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

function confirmedTopicPreferences(data: unknown, deckId: string, libraryId: string): TopicPreferenceState {
  const state = data as TopicPreferenceState | null;
  if ((state?.version !== 117 && state?.version !== 122) || state.deck_id !== deckId || state.library_id !== libraryId
    || !/^[a-f0-9]{32}$/.test(state.revision) || !state.values || Array.isArray(state.values)
    || Object.entries(state.values).some(([key, value]) => !/^(official|personal):topic:/.test(key)
      || !Number.isInteger(value) || value < 0 || value > 100)) {
    throw new Error('Topic preferences could not be confirmed. Reload Home before changing settings.');
  }
  return state;
}

/** One current-subtree transaction, then readback. Never replay an uncertain reset. */
export async function mutateTopicSubtreePreference(rpc: SettingsRpc, deckId: string, libraryId: string,
  settings: HomeSettings, groupKey: string, balance: number, occurrenceKey?: string) {
  const before = confirmedTopicPreferences(settings.unified_deck_settings.topic_preference_state, deckId, libraryId);
  if (!(groupKey in before.values) || !Number.isInteger(balance) || balance < 0 || balance > 100) {
    throw new Error('A confirmed Topic and balance between 0 and 100 are required.');
  }
  const located = settings.official_topic_graph?.version === 132 && groupKey.startsWith('official:') && occurrenceKey;
  const result = await rpc(located ? 'set_study_deck_location_preference' : 'set_study_deck_topic_subtree_preference', {
    p_deck_id: deckId, p_library_id: libraryId, ...(located ? {p_location_id: locationId(occurrenceKey)} : {p_group_key: groupKey}),
    p_balance: balance, p_expected_revision: before.revision,
  });
  if (result.error) throw new Error(result.error.message);
  const saved = confirmedTopicPreferences(result.data, deckId, libraryId);
  if (saved.values[groupKey] !== balance || saved.revision === before.revision) {
    throw new Error('Save returned no confirmed subtree reset. Reload Home before trying again.');
  }
  const readback = await rpc('get_home_study_bootstrap', { p_library_id: libraryId, p_deck_id: deckId });
  if (readback.error) throw new Error(`The change may have saved, but readback failed: ${readback.error.message}. Reload Home before trying again.`);
  const next = requireHomeSettings(readback.data);
  const confirmed = confirmedTopicPreferences(next.unified_deck_settings.topic_preference_state, deckId, libraryId);
  if (confirmed.revision !== saved.revision) {
    throw new Error('Deck settings or Topics changed during readback. Reload Home before changing settings.');
  }
  return next;
}

/** One mutation, then authoritative readback. Never retry a rejected write. */
export async function mutateHomeSettings(rpc: SettingsRpc, deckId: string, libraryId: string,
  kind: 'topic-selection' | 'collection-selection' | 'collection-preference', id: string, value: boolean | number) {
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
