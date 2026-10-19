import { requireTopicGraph, type OfficialTopicGraph } from './topic-placement-graph';

export type TopicManagementRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
export function containTopicDialogFocus(event: { key: string; shiftKey: boolean; currentTarget: HTMLElement; preventDefault: () => void }) {
  if (event.key !== 'Tab') return;
  const modal = event.currentTarget;
  const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]')];
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); modal.focus(); }
  else if (!controls.includes(document.activeElement as HTMLElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
    event.preventDefault(); (event.shiftKey ? last : first)?.focus();
  }
}
export type TopicDetachmentReview = {
  library_id: string; location_id: string; topic_id: string; name: string; path: string;
  descendant_count: number; other_placements: number;
  unassigned_topics: { id: string; name: string }[];
  blocked_by_personal_anchor: boolean; content_preserved: true; review_revision: string;
};
export function confirmedTopicDetachmentReview(value: unknown, library: string, location: string): TopicDetachmentReview {
  const r = value as TopicDetachmentReview | null;
  if (!r || r.library_id !== library || r.location_id !== location || !r.topic_id
    || typeof r.name !== 'string' || typeof r.path !== 'string' || r.content_preserved !== true
    || !Number.isInteger(r.descendant_count) || r.descendant_count < 0 || !Number.isInteger(r.other_placements) || r.other_placements < 0
    || typeof r.blocked_by_personal_anchor !== 'boolean' || !Array.isArray(r.unassigned_topics)
    || r.unassigned_topics.some(t => typeof t.id !== 'string' || typeof t.name !== 'string')
    || !/^[a-f0-9]{32}$/.test(r.review_revision)) throw new Error('Removal details could not be confirmed. Close this dialog and review the Topic again.');
  return r;
}
export async function removeReviewedTopic(rpc: TopicManagementRpc, review: TopicDetachmentReview): Promise<OfficialTopicGraph> {
  if (review.blocked_by_personal_anchor) throw new Error('Removal is blocked to preserve personal material.');
  const result = await rpc('detach_official_topic_location', { p_library_id: review.library_id, p_location_id: review.location_id, p_review_revision: review.review_revision });
  if (result.error) throw result.error;
  const data = result.data as { removed_location_id?: string; content_preserved?: boolean; graph?: unknown } | null;
  if (data?.removed_location_id !== review.location_id || data.content_preserved !== true) throw new Error('Removal could not be confirmed. Reload Creator Studio before trying again.');
  const graph = requireTopicGraph(data.graph,review.library_id);
  if (graph.detachment_version !== 134 || graph.locations?.some(l => l.id === review.location_id)) throw new Error('The Topic location is still present. Reload Creator Studio before trying again.');
  return graph;
}
export function topicDetachmentError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === 'PT409' || code === '40001') return 'The Topic Tree changed. Close this dialog, reload the Topics, and review the operation again.';
  if (code === '42501') return 'Your account is not authorized to manage this Topic location.';
  if (code === '23505') return 'The destination already contains this Topic or a Topic with the same name. Choose another location.';
  return error instanceof Error || typeof (error as { message?: string })?.message === 'string'
    ? (error as { message: string }).message : 'The operation could not be confirmed. Reload Topics before trying again.';
}
