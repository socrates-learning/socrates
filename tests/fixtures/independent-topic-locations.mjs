import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Exact, fail-closed adaptation for historical fingerprint tests. These tests
// still characterize the released logic outside the approved placement changes.
// Actual location behavior is exercised separately in JS, SQL and the browser.
const proofs = JSON.parse(readFileSync(new URL('./independent-topic-locations-proof.json', import.meta.url)));
export function projectIndependentTopicLocations(path, source) {
  const proof = proofs[path];
  if (!proof) return source;
  // Historical fingerprints exclude only the exact Creator collapse correction.
  // The regression harness reads the actual component without this projection.
  if (path === 'components/CreatorStudioV2Client.tsx' && source.includes('function toggleExpanded(topicId: string, originalTopicId?: string)')) {
    const corrections = [
      ['function toggleExpanded(topicId: string, originalTopicId?: string)', 'function toggleExpanded(topicId: string)', 1],
      ['toggleOccurrenceKey(current, topicId, originalTopicId)', 'toggleOccurrenceKey(current, topicId)', 1],
      ['toggleExpanded(topic.occurrenceKey || topic.id, topic.originalPath !== false ? topic.id : undefined)', 'toggleExpanded(topic.occurrenceKey || topic.id)', 2],
      ['toggleOccurrenceKey(current, topic.occurrenceKey || topic.id, topic.originalPath !== false ? topic.id : undefined)', 'toggleOccurrenceKey(current, topic.occurrenceKey || topic.id)', 2],
    ];
    for (const [corrected, original, count] of corrections) {
      if (source.split(corrected).length !== count + 1) throw new Error('Creator collapse correction mismatch');
      source = source.replaceAll(corrected, original);
    }
  }
  for (const [candidate, baseline] of [...proof.hunks].reverse()) {
    if (source.split(candidate).length !== 2) throw new Error(`Independent-location preservation mismatch: ${path}`);
    source = source.replace(candidate, baseline);
  }
  if (createHash('sha256').update(source).digest('hex') !== proof.baseline) {
    throw new Error(`Changes outside the independent-location integration: ${path}`);
  }
  return source;
}
