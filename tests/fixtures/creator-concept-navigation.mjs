import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { projectLearnerCardTools } from './learner-card-tools.mjs';

// Historical fingerprints continue to protect every byte outside this exact
// navigation delta. Behavioral tests execute the unprojected component.
const proof = JSON.parse(readFileSync(new URL('./creator-concept-navigation-proof.json', import.meta.url)));
export function projectConceptNavigation(path, source) {
  if (typeof source !== 'string' || !String(path).endsWith('components/CreatorStudioV2Client.tsx')) return source;
  source = projectLearnerCardTools(path, source);
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(source), proof.candidate, 'Exact Concept navigation candidate');
  for (const [candidate, baseline] of [...proof.hunks].reverse()) {
    assert.equal(source.split(candidate).length, 2, 'Unique navigation change');
    source = source.replace(candidate, baseline);
  }
  assert.equal(hash(source), proof.baseline, 'Unchanged Creator functionality outside navigation');
  return source;
}
