import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Exactly the owner-only compatibility navigation integration. Historical
// behavior tests execute the real component, never this projected source.
const proof = JSON.parse(readFileSync(new URL('./legacy-personal-retirement-proof.json', import.meta.url)));
export function projectLegacyRetirement(path, source) {
  if (typeof source !== 'string' || !String(path).endsWith('components/CreatorStudioV2Client.tsx')) return source;
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(source), proof.candidate, 'Exact learner Card tools integration: legacy compatibility navigation');
  for (const [candidate, baseline] of [...proof.hunks].reverse()) {
    assert.equal(source.split(candidate).length, 2, 'Unique legacy navigation integration');
    source = source.replace(candidate, baseline);
  }
  assert.equal(hash(source), proof.baseline, 'Unchanged Creator outside legacy navigation');
  return source;
}
