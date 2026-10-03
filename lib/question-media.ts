import type { OfficialContentFormat } from './official-content-format';
import type { ConceptMediaPlacement } from './concept-media';

export type QuestionMediaSurface = 'front' | 'answer';
export type QuestionMediaPlacement = ConceptMediaPlacement & { surface: QuestionMediaSurface };
export type QuestionMediaHint = { questionId: string; versionId: string | null; libraryId: string; front: boolean; answer: boolean; unavailable?: boolean };
export type QuestionMediaManifest = { questionId: string; versionId: string | null; libraryId: string; prompt: string; answer: string; prompt_format?: OfficialContentFormat; answer_format?: OfficialContentFormat; updated_at?: string; placements: QuestionMediaPlacement[] };
export type QuestionMediaContext = { questionId: string | null; libraryId: string; draftId: string; versionId: string | null };

export function questionMediaEndpoint(context: Pick<QuestionMediaContext, 'questionId'>) {
  return `/api/content-media/questions/${context.questionId || 'new'}`;
}
export function questionImageSource(placement: QuestionMediaPlacement, context: QuestionMediaContext) {
  return placement.reservationId
    ? `${questionMediaEndpoint(context)}/drafts/${placement.reservationId}?${new URLSearchParams({ libraryId: context.libraryId, draftId: context.draftId })}`
    : `/api/content-media/delivery/${placement.placementId}`;
}
export function orderedQuestionMedia(items: QuestionMediaPlacement[]) {
  const ids = new Set<string>();
  for (const p of items) {
    if (!['front', 'answer'].includes(p.surface) || ids.has(p.placementId) || !p.placementId || !p.assetId) throw new Error('Invalid image placement');
    if (!p.altText.trim() || p.altText.length > 2000 || p.caption.length > 4000) throw new Error('Provide Alt Text for every image (up to 2,000 characters)');
    ids.add(p.placementId);
  }
  return (['front', 'answer'] as const).flatMap(surface => items.filter(p => p.surface === surface).map((p, ordinal) => ({ ...p, ordinal })));
}
export function questionMediaFingerprint(items: QuestionMediaPlacement[]) {
  return JSON.stringify(orderedQuestionMedia(items).map(p => [p.surface, p.placementId, p.assetId, p.ordinal, p.altText, p.caption]));
}
export function questionMediaMatches(manifest: QuestionMediaManifest, hint: QuestionMediaHint, prompt: string, answer?: string) {
  return !hint.unavailable && manifest.questionId === hint.questionId && manifest.libraryId === hint.libraryId
    && manifest.versionId === hint.versionId && manifest.prompt === prompt && (answer === undefined || manifest.answer === answer);
}
