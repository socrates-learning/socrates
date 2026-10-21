import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { prepareConfirmedRecoveryDeletion, isolatedDatabase } from '../scripts/reconcile-account-deletions.mjs';
import { signedRecoveryFixture } from './fixtures/final-admin-deletion.mjs';

async function setup(t) {
  const f = signedRecoveryFixture(); t.after(f.cleanup);
  const snapshot = await f.ledger.snapshot(); const statements = [];
  const options = { operation: 'account_deletion_private.prepare_account_deletion' };
  const args = { ledger: f.ledger, snapshot, account: f.account, receipt: 'a'.repeat(64), sql: statement => { statements.push(statement); return statement.includes('select case') ? options.operation : ''; } };
  return { ...f, args, statements, sqlOptions: options };
}
test('recovery verifies existing signed evidence before database-owner preparation and never appends a new intent', async t => {
  const f = await setup(t); await prepareConfirmedRecoveryDeletion(f.args);
  assert.equal(f.statements.length, 2); assert.match(f.statements[0], /current_user <> 'postgres'/);
  assert.match(f.statements[0], /proacl=array\['postgres=X\/postgres'\]/);
  assert.equal(f.statements[1], `select account_deletion_private.prepare_account_deletion('${f.account}','${'a'.repeat(64)}')`);
  assert.ok(!f.calls.some(sql => /append_record|acknowledge_checkpoint/.test(sql)));
});
for (const kind of ['offline', 'missing', 'signature', 'receipt', 'substitutedAccount', 'snapshotMismatch', 'noSnapshotIntent']) test(`recovery rejects ${kind} before any SQL preparation`, async t => {
  const f = await setup(t);
  if (['offline', 'missing'].includes(kind)) f.options[kind] = true;
  if (kind === 'signature') f.row.record = f.row.record.replace(/"signature":"[a-f0-9]+"/, `"signature":"${'0'.repeat(64)}"`);
  if (kind === 'receipt') f.row.receipt = f.row.receipt.replace(/"signature":"[a-f0-9]+"/, `"signature":"${'0'.repeat(128)}"`);
  if (kind === 'substitutedAccount') f.args.account = 'a1390000-0000-4000-8000-000000000099';
  if (kind === 'snapshotMismatch') f.args.snapshot = { ...f.args.snapshot, source: 'wrong-application' };
  if (kind === 'noSnapshotIntent') f.args.snapshot = { ...f.args.snapshot, records: [] };
  await assert.rejects(prepareConfirmedRecoveryDeletion(f.args)); assert.equal(f.statements.length, 0);
});
test('corrupt encrypted checkpoint and rollback head pin prevent obtaining a recovery snapshot', async t => {
  const f = await setup(t);
  f.config.checkpointSha256 = '0'.repeat(64); await assert.rejects(f.ledger.snapshot());
  const bytes = readFileSync(f.config.checkpointFile); bytes[bytes.length - 1] ^= 1; writeFileSync(f.config.checkpointFile, bytes);
  await assert.rejects(f.ledger.snapshot()); assert.equal(f.statements.length, 0);
});
test('unknown contracts and ordinary application SQL credentials cannot select a recovery operation', async t => {
  const f = await setup(t);
  for (const operation of ['denied', '', 'public.other_function', 'public.begin_account_deletion;delete']) {
    f.sqlOptions.operation = operation; f.statements.length = 0;
    await assert.rejects(prepareConfirmedRecoveryDeletion(f.args)); assert.equal(f.statements.length, 1);
  }
});
test('older backup compatibility accepts only the exact historical deletion contract', async t => {
  const f = await setup(t); f.sqlOptions.operation = 'public.begin_account_deletion';
  await prepareConfirmedRecoveryDeletion(f.args);
  assert.match(f.statements[0], /to_regnamespace\('account_deletion_private'\) is null/);
  assert.match(f.statements[0], /c281b1cb14e1082a47c0127cadb51a3a/);
  assert.equal(f.statements[1], `select public.begin_account_deletion('${f.account}','${'a'.repeat(64)}')`);
});
test('invalid identity or receipt fails before ledger lookup and SQL', async t => {
  const f = await setup(t); const count = f.calls.length;
  for (const change of [{ account: 'not-a-uuid' }, { receipt: 'injected' }]) await assert.rejects(prepareConfirmedRecoveryDeletion({ ...f.args, ...change }));
  assert.equal(f.statements.length, 0); assert.equal(f.calls.length, count);
});
test('recovery connector refuses hosted targets and ordinary application environment configuration', () => {
  const valid = { ACCOUNT_RECOVERY_DISPOSABLE: '1', ACCOUNT_RECOVERY_DB_CONTAINER: 'socrates-synthetic-uat-db', ACCOUNT_RECOVERY_DB_NAME: 'account127_recovery_synthetic', ACCOUNT_RECOVERY_SUPABASE_URL: 'http://127.0.0.1:1' };
  for (const change of [{ ACCOUNT_RECOVERY_DISPOSABLE: '' }, { ACCOUNT_RECOVERY_DB_NAME: 'postgres' }, { ACCOUNT_RECOVERY_DB_CONTAINER: 'production' }, { ACCOUNT_RECOVERY_SUPABASE_URL: 'https://project.supabase.co' }, { ACCOUNT_RECOVERY_SUPABASE_URL: 'http://user:password@localhost' }]) assert.throws(() => isolatedDatabase({ ...valid, ...change }));
});
