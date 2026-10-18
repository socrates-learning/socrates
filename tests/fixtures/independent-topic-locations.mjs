import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Exact, fail-closed adaptation for historical fingerprint tests. These tests
// still characterize the released logic outside the approved placement changes.
// Actual location behavior is exercised separately in JS, SQL and the browser.
const proofs = JSON.parse(readFileSync(new URL('./independent-topic-locations-proof.json', import.meta.url)));
export function projectIndependentTopicLocations(path, source) {
  const proof = proofs[path];
  if (!proof) return source;
  for (const [candidate, baseline] of [...proof.hunks].reverse()) {
    if (source.split(candidate).length !== 2) throw new Error(`Independent-location preservation mismatch: ${path}`);
    source = source.replace(candidate, baseline);
  }
  if (createHash('sha256').update(source).digest('hex') !== proof.baseline) {
    throw new Error(`Changes outside the independent-location integration: ${path}`);
  }
  return source;
}
