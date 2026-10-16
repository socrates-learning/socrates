import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { projectProfileSunrise } from './fixtures/profile-sunrise.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hash = source => createHash('sha256').update(source).digest('hex');
const prior = {
  "components/PersonalProfile.tsx": "118f901047439f9bd438b6fb212aa79c932c3a54ef77604d9e7adce2a89aae78",
  "components/PersonalProfile.module.css": "3719ef9986139ecf7b59bb1e4d62fcda91254996ba7cdd15f6b07c59fef5c273",
  "components/application-shell/SocratesShell.tsx": "be07c6879ac6a694eba5b5f4f162487b5623f01323f18b72c65bf84b922c7216",
  "components/application-shell/SocratesShell.module.css": "23fd2a5718acfeca5f9ab993ddbf24581d36dda4aea690cab7d78d0eb2a6a319"
};
for (const [path, expected] of Object.entries(prior)) test(`Profile presentation retains the previous complete source: ${path}`, () => {
  assert.equal(hash(projectProfileSunrise(path, read(path))), expected);
  if (path.endsWith('PersonalProfile.module.css')) assert.throws(() => projectProfileSunrise(path, read(path) + '\n/* unexpected */\n'));
  else assert.notEqual(hash(projectProfileSunrise(path, read(path) + '\n// unexpected change\n')), expected);
});
test('Profile projection cannot conceal a changed private-photo endpoint or navigation guard', () => {
  const path='components/PersonalProfile.tsx';
  for(const [from,to] of [["'/api/profile/photo'", "'/public/photo'"], ['if (dirty)', 'if (false)']]) assert.notEqual(hash(projectProfileSunrise(path, read(path).replace(from,to))),prior[path]);
});
