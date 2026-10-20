import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Permit only the exact learner integration while retaining all historical
// Creator fingerprints. New behavior tests use the actual, unprojected code.
const proof = JSON.parse(readFileSync(new URL('./learner-card-tools-proof.json', import.meta.url)));
export function projectLearnerCardTools(path, source) {
  if (typeof source !== 'string' || !String(path).endsWith('components/CreatorStudioV2Client.tsx')) return source;
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(source), proof.candidate, 'Exact learner Card tools integration');
  for (const [candidate, baseline] of [...proof.hunks].reverse()) {
    assert.equal(source.split(candidate).length, 2, 'Unique learner Card integration change');
    source = source.replace(candidate, baseline);
  }
  assert.equal(hash(source), proof.baseline, 'Unchanged Creator outside learner Card integration');
  return source;
}
