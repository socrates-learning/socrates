import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { projectAccountSunrise } from './fixtures/account-sunrise.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hash = source => createHash('sha256').update(source).digest('hex');
const prior = {
  "app/account/page.tsx": "0ddf5b571520ae96f6a624cbe225873acf3f4a8588b50b5eadc3a9e860801ebf",
  "components/AccountSettings.module.css": "23aebbcc1df4ba720db47666380f67a15624a72cc81d852774dce3dd13009e08",
  "components/application-shell/SocratesShell.tsx": "e3e538d89842dd4514c5701c6e829214324c02c4bcd1911c504ace717a7d47d3",
  "components/application-shell/SocratesShell.module.css": "fc2c019a6ff696273c7a3b3ecdc4aa28a3328fe0686c6a2659e3d0871c40b184"
};
for (const [path, original] of Object.entries(prior)) test(`Account presentation preserves the previous complete source: ${path}`, () => {
  const source = read(path);
  // Isolated validation uses the released Account page; the frozen working copy retains its exact MFA addition.
  const expected = path === 'app/account/page.tsx' && !source.includes('/auth/mfa?next=/account') ? 'e202afa450c6a35ff05d1c71aae33c9d334d94a44ef76a0102f45fbce90f410f' : original;
  assert.equal(hash(projectAccountSunrise(path, source)), expected);
  if (path.endsWith('AccountSettings.module.css')) assert.throws(() => projectAccountSunrise(path, source + '\n/* unexpected */\n'));
  else assert.notEqual(hash(projectAccountSunrise(path, source + '\n// unexpected change\n')), expected);
});
test('Account presentation cannot conceal altered authorization or destructive controls', () => {
  const path = 'app/account/page.tsx', source = read(path);
  const expected = hash(projectAccountSunrise(path, source));
  for (const [from, to] of [["if (!context.user)", 'if (false)'], ['<ResetStudyProgress', '<RemovedReset'], ['<DeleteAccount', '<RemovedDelete'], ['role={context.role}', 'role="admin"']]) {
    assert.ok(source.includes(from));
    assert.notEqual(hash(projectAccountSunrise(path, source.replace(from, to))), expected);
  }
});
