'use client';
import { useEffect, useState } from 'react';
import VerifiedMediaImage from './VerifiedMediaImage';
import { questionMediaMatches, type QuestionMediaHint, type QuestionMediaManifest, type QuestionMediaSurface } from '@/lib/question-media';

// Share only in-flight metadata. No permanent cache or signed/Storage URL is retained.
const pending = new Map<string, Promise<QuestionMediaManifest>>();
function loadManifest(hint: QuestionMediaHint) {
  const key = `${hint.libraryId}:${hint.questionId}:${hint.versionId}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetch(`/api/content-media/questions/${hint.questionId}?libraryId=${encodeURIComponent(hint.libraryId)}`, { cache: 'no-store', credentials: 'same-origin' })
    .then(async response => { if (!response.ok) throw new Error('Unavailable'); return await response.json() as QuestionMediaManifest; })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** The caller mounts Answer only after reveal; summary rows never mount this component. */
export default function QuestionMediaContent({ questionId, hint, surface, prompt, answer, presentation }: {
  questionId: string; hint?: QuestionMediaHint | null; surface: QuestionMediaSurface; prompt: string; answer?: string;
  presentation?: 'study';
}) {
  const [result, setResult] = useState<{ key: string; manifest?: QuestionMediaManifest } | null>(null);
  const needed = Boolean(hint?.[surface] || hint?.unavailable);
  const key = `${questionId}:${hint?.libraryId}:${hint?.versionId}:${prompt}:${answer ?? ''}`;
  useEffect(() => {
    if (!needed || !hint || hint.unavailable || hint.questionId !== questionId) return;
    let active = true;
    void loadManifest(hint).then(manifest => {
      if (!questionMediaMatches(manifest, hint, prompt, answer)) throw new Error('Question changed');
      if (active) setResult({ key, manifest });
    }).catch(() => { if (active) setResult({ key }); });
    return () => { active = false; };
  }, [needed, hint, questionId, prompt, answer, key]);
  if (!needed) return null;
  const manifest = result?.key === key ? result.manifest : undefined;
  if (hint?.unavailable || hint?.questionId !== questionId || (result?.key === key && !manifest)) return <p role="status">Image unavailable. The Question may have changed.</p>;
  if (!manifest) return <p role="status">Loading images…</p>;
  const items = manifest.placements.filter(p => p.surface === surface);
  if (!items.length) return <p role="status">Image unavailable.</p>;
  return <>{items.map(p => presentation === 'study'
    ? <div key={p.placementId} style={{ flexShrink: 0, width: `min(100%, ${p.width || 1}px, calc(min(32dvh, 280px) * ${(p.width || 1) / (p.height || 1)}))` }}>
      <VerifiedMediaImage placement={p} src={`/api/content-media/delivery/${p.placementId}`} />
    </div>
    : <VerifiedMediaImage key={p.placementId} placement={p} src={`/api/content-media/delivery/${p.placementId}`} />)}</>;
}
