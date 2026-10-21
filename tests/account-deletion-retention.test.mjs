import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDeletionLedger, ledgerConfig, signedS3Request } from '../lib/account-deletion-ledger.mjs';
import { reconcileDeletions } from '../lib/account-deletion-recovery.mjs';
import { preservationFingerprint } from '../scripts/reconcile-account-deletions.mjs';

const env = { DELETION_LEDGER_ENDPOINT: 'http://127.0.0.1:58960', DELETION_LEDGER_BUCKET: 'disposable-ledger', DELETION_LEDGER_REGION: 'us-east-1', DELETION_LEDGER_SOURCE: 'disposable-fixture', DELETION_LEDGER_ACCESS_KEY: 'synthetic', DELETION_LEDGER_SECRET_KEY: 'synthetic-secret', DELETION_LEDGER_SIGNING_KEY: 'a'.repeat(64), DELETION_LEDGER_DISPOSABLE: '1' };
const date = new Date('2026-10-13T12:00:00.000Z');
function fixture() {
  const objects = new Map(); const options = { down: false, mutable: false, days: '90', until: '2027-01-11T12:00:00.000Z' }; let puts = 0;
  const config = ledgerConfig(env);
  const fetcher = async (url, init) => {
    if (options.down) throw new Error('Offline');
    const parsed = new URL(url), key = decodeURIComponent(parsed.pathname.split('/').slice(2).join('/'));
    if (parsed.searchParams.has('object-lock')) return new Response(`<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled><Rule><DefaultRetention><Mode>${options.mutable ? 'GOVERNANCE' : 'COMPLIANCE'}</Mode><Days>${options.days}</Days></DefaultRetention></Rule></ObjectLockConfiguration>`);
    if (parsed.searchParams.has('list-type')) return new Response(`<ListBucketResult><KeyCount>${objects.size}</KeyCount><IsTruncated>false</IsTruncated>${[...objects.keys()].map(k => `<Contents><Key>${encodeURIComponent(k)}</Key></Contents>`).join('')}</ListBucketResult>`);
    if (init.method === 'PUT') {
      assert.equal(init.headers['if-none-match'], '*'); assert.ok(init.headers.authorization.startsWith('AWS4-HMAC-SHA256 '));
      if (objects.has(key)) return new Response('', { status: 412 });
      puts++; objects.set(key, init.body); return new Response('');
    }
    return objects.has(key) ? new Response(objects.get(key), { headers: { 'x-amz-object-lock-mode': 'COMPLIANCE', 'x-amz-object-lock-retain-until-date': options.until } }) : new Response('', { status: 404 });
  };
  return { ledger: createDeletionLedger(config, fetcher, () => date), objects, options, puts: () => puts, config };
}
test('ledger is required, server-only, independent and HTTPS outside the disposable loopback', () => {
  assert.throws(() => ledgerConfig({}));
  assert.throws(() => ledgerConfig({ ...env, DELETION_LEDGER_DISPOSABLE: '' }));
  assert.throws(() => ledgerConfig({ ...env, DELETION_LEDGER_ENDPOINT: 'https://application.supabase.co' }));
  assert.throws(() => ledgerConfig({ ...env, DELETION_LEDGER_ENDPOINT: 'https://secret@example.com' }));
  assert.throws(() => ledgerConfig({ ...env, DELETION_LEDGER_SIGNING_KEY: 'weak' }));
});
test('confirmed intents retain only minimal signed identifiers and timestamps', async () => {
  const f = fixture(), id = randomUUID(); const event = await f.ledger.record(id);
  assert.deepEqual(Object.keys(event).sort(), ['account', 'confirmedAt', 'source', 'version']);
  assert.equal(event.account, id); assert.equal(event.confirmedAt, date.toISOString());
  assert.equal((await f.ledger.snapshot()).records.length, 1);
  assert.equal(f.puts(), 1);
});
test('simultaneous and duplicate requests keep one immutable intent per account', async () => {
  const f = fixture(), id = randomUUID(); const records = await Promise.all(Array.from({ length: 12 }, () => f.ledger.record(id)));
  assert.ok(records.every(row => row.account === id)); assert.equal(f.objects.size, 1); assert.equal(f.puts(), 1);
});
test('append-only writer does not need ListBucket or a readable missing key', async () => {
  const f = fixture(), id = randomUUID(); const calls = [];
  const fetcher = async (url, init) => {
    calls.push(init.method);
    if (new URL(url).searchParams.has('object-lock')) return new Response('<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled><Mode>COMPLIANCE</Mode><Days>90</Days></ObjectLockConfiguration>');
    if (init.method === 'PUT') { f.objects.set(id, init.body); return new Response(''); }
    if (!f.objects.has(id)) return new Response('', { status: 403 });
    return new Response(f.objects.get(id), { headers: { 'x-amz-object-lock-mode': 'COMPLIANCE', 'x-amz-object-lock-retain-until-date': '2027-01-11T12:00:00.000Z' } });
  };
  assert.equal((await createDeletionLedger(f.config, fetcher, () => date).record(id)).account, id);
  assert.deepEqual(calls, ['GET', 'PUT', 'GET']);
});
test('tampered ledger payload, account substitution and signature fail closed', async () => {
  for (const change of ['account', 'signature', 'extra']) {
    const f = fixture(), id = randomUUID(); await f.ledger.record(id);
    const key = [...f.objects.keys()][0], row = JSON.parse(f.objects.get(key));
    if (change === 'account') row.event.account = randomUUID();
    if (change === 'signature') row.signature = 'b'.repeat(64);
    if (change === 'extra') row.event.email = 'private@example.invalid';
    f.objects.set(key, JSON.stringify(row)); await assert.rejects(f.ledger.read(id)); await assert.rejects(f.ledger.snapshot());
  }
});
test('invalid listing, weak object lock and network failure cannot prove recovery', async () => {
  const f = fixture(); f.options.mutable = true; await assert.rejects(f.ledger.record(randomUUID()));
  f.options.mutable = false; f.objects.set('unexpected/key', '{}'); await assert.rejects(f.ledger.snapshot());
  f.options.down = true; await assert.rejects(f.ledger.snapshot());
});
test('signatures bind the exact body, path, date and conditional write header', () => {
  const c = ledgerConfig(env); const signed = signedS3Request(c, 'PUT', 'deletions/a/b.json', {}, 'body', { 'if-none-match': '*' }, date);
  assert.equal(signed.headers['x-amz-content-sha256'], createHash('sha256').update('body').digest('hex'));
  assert.equal(signed.headers['x-amz-date'], '20261013T120000Z');
  assert.match(signed.headers.authorization, /SignedHeaders=host;if-none-match;x-amz-content-sha256;x-amz-date/);
  assert.notEqual(signed.headers.authorization, signedS3Request(c, 'PUT', 'deletions/a/c.json', {}, 'body', { 'if-none-match': '*' }, date).headers.authorization);
});
test('malformed retention, expired protection and shortened retention fail closed', async () => {
  const f = fixture(), id = randomUUID();
  f.options.days = 'invalid'; await assert.rejects(f.ledger.assertReady());
  f.options.days = '89'; await assert.rejects(f.ledger.assertReady());
  f.options.days = '90'; await f.ledger.record(id);
  f.options.until = '2026-10-14T12:00:00.000Z'; await assert.rejects(f.ledger.read(id));
  f.options.until = '2026-10-12T12:00:00.000Z'; await assert.rejects(f.ledger.snapshot());
});

function recoveryFixture(options = {}) {
  const ids = [randomUUID(), randomUUID()]; const remaining = new Set(ids); let certificate = { stale: true }, blocked = false, reads = 0;
  const snapshot = { source: 'fixture', records: ids.map((account, i) => ({ account, confirmedAt: i ? '2026-10-12T12:00:00Z' : '2026-10-01T12:00:00Z' })), digest: 'a'.repeat(64) };
  const ledger = { snapshot: async () => { reads++; if (options.offline) throw new Error('Offline'); return { ...snapshot, digest: options.changing && reads > 1 ? 'b'.repeat(64) : snapshot.digest }; } };
  const target = {
    blockAccess: async () => { blocked = true; certificate = null; },
    preservationFingerprint: async () => options.corruptOther && !remaining.size ? 'changed' : 'official-and-other-identities',
    reapply: async id => { if (options.interrupted) throw new Error('Interrupted'); remaining.delete(id); },
    verifyAbsent: async id => { assert.equal(remaining.has(id), false); if (options.residual) throw new Error('Residual data'); },
    identity: async () => 'isolated-instance', writeReadiness: async r => { certificate = r; },
    hasActiveAdministrator: async () => !options.noAdmin,
  };
  const checkpoint = { isolated: true, source: 'fixture', backupSha256: 'c'.repeat(64), createdAt: '2026-10-05T12:00:00Z' };
  return { ledger, target, checkpoint, remaining, state: () => ({ certificate, blocked }), options };
}
test('recovery reconciles intents before AND after the snapshot, verifies and stays isolated', async () => {
  const f = recoveryFixture(); const r = await reconcileDeletions(f);
  assert.equal(r.reconciled, 2); assert.equal(f.remaining.size, 0); assert.equal(f.state().blocked, true); assert.equal(f.state().certificate.state, 'verified-isolated');
  await reconcileDeletions(f); assert.equal(f.remaining.size, 0);
});
test('valid ledger replay with no remaining Administrator completes privacy cleanup but never reports ordinary readiness', async () => {
  const f = recoveryFixture({ noAdmin: true }); const r = await reconcileDeletions(f);
  assert.equal(f.remaining.size, 0); assert.equal(r.reconciled, 2);
  assert.equal(r.state, 'administrator-recovery-required'); assert.equal(r.administratorRecoveryRequired, true);
  assert.equal(f.state().blocked, true); assert.equal(f.state().certificate.state, r.state);
});
test('unavailable Administrator verification fails closed after reconciliation', async () => {
  const f = recoveryFixture(); f.target.hasActiveAdministrator = async () => { throw new Error('Unavailable'); };
  await assert.rejects(reconcileDeletions(f)); assert.equal(f.state().blocked, true); assert.equal(f.state().certificate, null);
});
for (const option of ['offline', 'changing', 'corruptOther', 'interrupted', 'residual']) test(`recovery remains blocked without readiness after ${option}`, async () => {
  const f = recoveryFixture({ [option]: true }); await assert.rejects(reconcileDeletions(f));
  assert.equal(f.state().certificate, null); assert.equal(f.state().blocked, true);
});
test('wrong application or non-isolated recovery cannot execute deletion', async () => {
  const f = recoveryFixture(); f.checkpoint.source = 'other'; await assert.rejects(reconcileDeletions(f)); assert.equal(f.remaining.size, 2);
  f.checkpoint.source = 'fixture'; f.checkpoint.isolated = false; await assert.rejects(reconcileDeletions(f)); assert.equal(f.remaining.size, 2);
});
test('retention documentation does not promise unsupported Auth-table expiry or authorize SQL deletion', () => {
  const doc = readFileSync(new URL('../docs/account-deletion-retention.txt', import.meta.url), 'utf8');
  assert.match(doc, /auth\.audit_log_entries/); assert.match(doc, /90.day/i); assert.match(doc, /30.day/i);
  assert.match(doc, /No supported automatic.*expiration/i); assert.doesNotMatch(doc, /DELETE FROM auth\.audit_log_entries/i);
});
test('recovery permits only the existing current-Concept attribution stamp, never revisions or another learner', () => {
  const owner = randomUUID(), concept = randomUUID(), other = randomUUID();
  const originalTime = '2026-10-01T12:00:00+00:00';
  const rows = { concepts: [{ id: concept, created_by: owner, name: 'Official text', updated_at: originalTime }, { id: other, created_by: randomUUID(), name: 'Other content', updated_at: originalTime }], concept_versions: [{ id: randomUUID(), created_by: owner, body: 'Immutable version', updated_at: originalTime }] };
  const sql = statement => {
    if (statement.includes('from pg_tables')) return JSON.stringify(Object.keys(rows));
    if (statement.includes('from pg_constraint')) return JSON.stringify(Object.keys(rows).map(child => ({ child, parentSchema: 'auth', parent: 'users', column: 'created_by', parentColumn: 'id', cascade: false })));
    const table = statement.match(/from public\."([^"]+)" t/)[1]; return JSON.stringify(rows[table]);
  };
  const attribution = { startedAt: Date.now(), concepts: new Map([[concept, originalTime]]) };
  const baseline = preservationFingerprint(sql, [owner], false, attribution);
  rows.concepts[0].created_by = null; rows.concepts[0].updated_at = new Date().toISOString(); rows.concept_versions[0].created_by = null;
  assert.equal(preservationFingerprint(sql, [owner], false, attribution), baseline);
  rows.concept_versions[0].updated_at = new Date().toISOString(); assert.notEqual(preservationFingerprint(sql, [owner], false, attribution), baseline); rows.concept_versions[0].updated_at = originalTime;
  rows.concepts[1].updated_at = new Date().toISOString(); assert.notEqual(preservationFingerprint(sql, [owner], false, attribution), baseline); rows.concepts[1].updated_at = originalTime;
  rows.concepts[0].name = 'Unexpected content edit'; assert.notEqual(preservationFingerprint(sql, [owner], false, attribution), baseline); rows.concepts[0].name = 'Official text';
  rows.concepts[0].updated_at = '2025-01-01T00:00:00Z'; assert.throws(() => preservationFingerprint(sql, [owner], false, attribution));
});
