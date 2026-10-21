// Actual isolated SQL recovery replay, using the real signed-ledger verifier.
// The database harness creates both targets from disposable historical data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareConfirmedRecoveryDeletion, preservationFingerprint } from '../scripts/reconcile-account-deletions.mjs';
import { reconcileDeletions } from '../lib/account-deletion-recovery.mjs';
import { continueDeletion } from '../lib/account-deletion.ts';
import { signedRecoveryFixture } from './fixtures/final-admin-deletion.mjs';

const database = process.argv[2], container = 'socrates-admin-card135-recovery-20261020';
assert.match(database || '', /^account139_run_[a-z0-9]+$/);
const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(info.HostConfig.NetworkMode, 'none'); assert.equal(Object.keys(info.NetworkSettings.Ports || {}).length, 0);
const account = 'b1390000-0000-4000-8000-000000000001', receipt = '9'.repeat(64);
const count = "select count(*) from public.user_roles r join public.account_deletion_state s on s.user_id=r.user_id where r.role='admin' and s.state='active'";
const digest = value => createHash('sha256').update(value).digest('hex');
const proof = JSON.parse(readFileSync(new URL(`../../${database}-recovery-checkpoints.json`, import.meta.url), 'utf8'));
assert.equal(proof.synthetic, true); assert.equal(proof.database, database);

for (const [suffix, guarded] of [['_restored139', true], ['_recovery_source', false]]) {
  const db = database + suffix;
  const sql = statement => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-h', '/tmp', '-U', 'supabase_admin', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: 'set role postgres;'+statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim();
  assert.equal(sql(count), '1');
  const f = signedRecoveryFixture(account);
  try {
    const backup = proof.archives[guarded ? 'after139' : 'before139'];
    assert.equal(digest(readFileSync(backup.path)), backup.sha256);
    assert.ok(Date.parse(backup.createdAt) < Date.parse(f.event.confirmedAt));
    const snapshot = await f.ledger.snapshot();
    const ledgerBefore = [f.row.record, f.row.receipt, digest(readFileSync(f.config.checkpointFile))];
    const deletionStates = sql(`select coalesce(jsonb_agg(to_jsonb(s) order by user_id),'[]') from public.account_deletion_state s where user_id<>'${account}'`);
    const attribution = { startedAt: Date.now(), concepts: new Map(JSON.parse(sql(`select coalesce(json_agg(json_build_array(id,updated_at)),'[]') from public.concepts where created_by='${account}'`))) };
    const before = preservationFingerprint(sql, [account], false, attribution);
    const stateBefore = sql(`select to_jsonb(s) from public.account_deletion_state s where user_id='${account}'`);
    if (guarded) {
      assert.throws(() => sql(`select public.begin_account_deletion('${account}','${receipt}')`), /Another active Administrator/);
      assert.equal(sql(`select to_jsonb(s) from public.account_deletion_state s where user_id='${account}'`), stateBefore);
      // pg_restore may represent owner-only schema ACLs as NULL/default. That
      // is equivalent; an actual added application grant must still fail.
      await assert.rejects(prepareConfirmedRecoveryDeletion({ ledger: f.ledger, snapshot, account, receipt,
        sql: statement => sql('begin;grant usage on schema account_deletion_private to service_role;'+statement+';rollback;') }));
    }
    // Real cryptographic failure must occur before even preparation changes.
    const signedReceipt = f.row.receipt;
    f.row.receipt = f.row.receipt.replace(/"signature":"[a-f0-9]+"/, `"signature":"${'0'.repeat(128)}"`);
    await assert.rejects(prepareConfirmedRecoveryDeletion({ ledger: f.ledger, snapshot, account, receipt, sql }));
    f.row.receipt = signedReceipt; f.options.offline = true;
    await assert.rejects(prepareConfirmedRecoveryDeletion({ ledger: f.ledger, snapshot, account, receipt, sql }));
    f.options.offline = false;
    assert.equal(sql(`select to_jsonb(s) from public.account_deletion_state s where user_id='${account}'`), stateBefore);
    let absentObjectRequests = 0;
    const service = {
      async status(hash) { return JSON.parse(sql(`select public.account_deletion_status('${hash}')`)); },
      async recordIntent(id) { assert.ok(await f.ledger.read(id)); },
      async remove(bucket, names) {
        // The released core always inventories the deterministic avatar path,
        // even when absent. Simulate only that idempotent missing-object API
        // result; refuse to remove any actual object in this SQL-only fixture.
        assert.equal(bucket, 'socrates-profile-photos'); assert.deepEqual(names, [`${account}/avatar`]);
        assert.equal(sql(`select count(*) from storage.objects where bucket_id='socrates-profile-photos' and name='${account}/avatar'`), '0');
        absentObjectRequests++;
      },
      async deleteIdentity(id) { assert.equal(id, account); sql(`delete from auth.users where id='${id}';set constraints all immediate;`); },
    };
    let blocked = false, readiness = null;
    const target = {
      async blockAccess() { blocked = true; readiness = null; },
      async identity() { return `${container}/${db}`; },
      async preservationFingerprint() { return preservationFingerprint(sql, [account], false, attribution); },
      async reapply(id) {
        if (sql(`select count(*) from auth.users where id='${id}'`) === '0') return;
        await prepareConfirmedRecoveryDeletion({ ledger: f.ledger, snapshot, account: id, receipt, sql });
        const accepted = sql(`select to_jsonb(s) from public.account_deletion_state s where user_id='${id}'`);
        f.options.offline = true;
        await assert.rejects(continueDeletion(service, receipt));
        f.options.offline = false;
        assert.equal(absentObjectRequests, 0);
        assert.equal(sql(`select to_jsonb(s) from public.account_deletion_state s where user_id='${id}'`), accepted);
        assert.equal(sql(`select count(*) from auth.users where id='${id}'`), '1');
        await continueDeletion(service, receipt);
      },
      async verifyAbsent(id) { assert.equal(sql(`select count(*) from auth.users where id='${id}'`), '0'); assert.equal((await service.status(receipt)).state, 'complete'); },
      async hasActiveAdministrator() { return Number(sql(count)) > 0; },
      async writeReadiness(report) { readiness = report; },
    };
    const checkpoint = { isolated: true, source: f.config.source, backupSha256: backup.sha256, createdAt: backup.createdAt };
    const report = await reconcileDeletions({ ledger: f.ledger, target, checkpoint });
    assert.equal(report.state, 'administrator-recovery-required'); assert.equal(report.reconciled, 1);
    assert.equal(blocked, true); assert.equal(readiness.administratorRecoveryRequired, true);
    assert.equal(sql(count), '0');
    assert.equal(await target.preservationFingerprint(), before);
    assert.equal(sql(`select coalesce(jsonb_agg(to_jsonb(s) order by user_id),'[]') from public.account_deletion_state s where user_id<>'${account}'`), deletionStates);
    assert.deepEqual([f.row.record, f.row.receipt, digest(readFileSync(f.config.checkpointFile))], ledgerBefore);
    assert.ok(!f.calls.some(statement => /append_record|acknowledge_checkpoint/.test(statement)));
    // Successful replay is idempotent even with no active Administrator.
    const after = await reconcileDeletions({ ledger: f.ledger, target, checkpoint });
    assert.equal(after.state, report.state); assert.equal(await target.preservationFingerprint(), before);
    console.log(JSON.stringify({ target: db, contract: guarded ? '139 private owner-only' : 'exact older backup', ledgerVerified: true, corruptEvidenceDenied: true, ledgerOutageDenied: true, pendingRetryAfterLedgerOutage: true, allUnaffectedPublicTablesPreserved: true, otherReceiptsPreserved: true, signedLedgerAndCheckpointUnchanged: true, activeAdministratorsAfterReconciliation: 0, state: report.state, idempotentRetry: true, absentObjectRequests, storageDeletes: 0, productionAccess: false }));
  } finally { f.cleanup(); }
}
