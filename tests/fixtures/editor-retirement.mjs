import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Permit only this exact authorization integration in historical fingerprints.
// Behavioral harnesses continue to execute the actual, unprojected component.
const proof = JSON.parse(readFileSync(new URL('./editor-retirement-source-proof.json', import.meta.url)));
export function projectEditorRetirement(path, source) {
  if (typeof source !== 'string' || !String(path).endsWith('components/CreatorStudioV2Client.tsx')) return source;
  const hash = value => createHash('sha256').update(value).digest('hex');
  if (hash(source) === proof.baseline) return source;
  assert.equal(hash(source), proof.candidate, 'Exact learner Card tools integration: Editor retirement');
  for (const [candidate, baseline] of [...proof.hunks].reverse()) {
    assert.equal(source.split(candidate).length, 2, 'Unique Editor retirement integration');
    source = source.replace(candidate, baseline);
  }
  assert.equal(hash(source), proof.baseline, 'Unchanged Creator outside Editor retirement');
  return source;
}
