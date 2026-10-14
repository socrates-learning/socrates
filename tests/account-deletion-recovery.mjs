// End-to-end synthetic restore proof. Only the existing named local fixture is
// accepted; no repository/Production environment or remote database is read.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { continueDeletion } from '../lib/account-deletion.ts';
import { createDeletionLedger, ledgerConfig, signedS3Request } from '../lib/account-deletion-ledger.mjs';
import { runRecovery } from '../scripts/reconcile-account-deletions.mjs';

const env = Object.fromEntries(readFileSync(process.env.ACCOUNT_DELETION_DISPOSABLE_ENV, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => { const at = l.indexOf('='); return [l.slice(0, at), l.slice(at + 1)]; }));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:58942');
assert.equal(process.env.ACCOUNT_RECOVERY_PROOF_MODE, 'seed-or-verify');
const directory = process.env.ACCOUNT_RECOVERY_PROOF_DIRECTORY;
assert.ok(directory?.startsWith('/Users/itxiermeziani/.codex/local-evidence/account-deletion-retention-safeguards-'));
mkdirSync(directory, { recursive: true, mode: 0o700 });
const saved = `${directory}/.synthetic-fixture.json`;
const config = ledgerConfig(), ledger = createDeletionLedger(config);
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const sha = data => createHash('sha256').update(data).digest('hex');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = (statement, database = 'account127_uat') => execFileSync('docker', ['exec', '-i', 'socrates-creator-navy-uat-db', 'psql', '-U', 'postgres', '-d', database, '-XAt', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const library = sql("select id from public.libraries where status='active' order by id limit 1");
const node = sql(`select id from public.library_nodes where library_id=${quote(library)} order by id limit 1`);
const question = sql("select id from public.questions where status='published' order by id limit 1");
const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#192f4f' } }).png().toBuffer();
const service = api => ({
  async status(hash) { const r = await api.rpc('account_deletion_status', { p_receipt_hash: hash }); assert.equal(r.error, null); return r.data; },
  async recordIntent(id) { await ledger.record(id); },
  async remove(bucket, names) { const r = await api.storage.from(bucket).remove(names); assert.equal(r.error, null); },
  async deleteIdentity(id) { const r = await api.auth.admin.deleteUser(id, false); assert.equal(r.error, null); },
});
async function remove(api, id) {
  if (!(await api.auth.admin.getUserById(id)).data.user) return;
  const hash = sha(randomBytes(32));
  assert.equal((await api.rpc('begin_account_deletion', { p_user: id, p_receipt_hash: hash })).error, null);
  await continueDeletion(service(api), hash);
}
let passed = 0;
const check = (truth, label) => { assert.ok(truth, label); passed++; console.log(`PASS: ${label}`); };
async function account(role) {
  const result = await admin.auth.admin.createUser({ email: `recovery-${randomBytes(8).toString('hex')}@example.invalid`, password: randomBytes(30).toString('base64url'), email_confirm: true });
  assert.equal(result.error, null); const id = result.data.user.id;
  sql(`insert into public.user_roles(user_id,role) values(${quote(id)},${quote(role)}); insert into public.user_libraries(user_id,library_id) values(${quote(id)},${quote(library)});
    select set_config('request.jwt.claim.sub',${quote(id)},false);
    insert into public.personal_cards(owner_id,library_id,library_node_id,question,answer) values(${quote(id)},${quote(library)},${quote(node)},'Private synthetic front','Private synthetic back');
    insert into public.personal_question_notes(user_id,question_id,note) values(${quote(id)},${quote(question)},'Private synthetic note');`);
  const uploaded = await admin.storage.from('socrates-profile-photos').upload(`${id}/avatar`, photo, { contentType: 'image/png' });
  assert.equal(uploaded.error, null);
  return id;
}

if (!existsSync(saved)) {
  const owner = await account('admin'), other = await account('learner');
  const concept = randomUUID(), version = randomUUID(), asset = randomUUID(), placement = randomUUID(), path = `${library}/${asset}`;
  sql(`select set_config('request.jwt.claim.sub',${quote(owner)},false);
    insert into public.media_assets(id,library_id,created_by,scope,object_name) values(${quote(asset)},${quote(library)},${quote(owner)},'official',${quote(path)});`);
  assert.equal((await admin.storage.from('socrates-content-media').upload(path, photo, { contentType: 'image/png' })).error, null);
  sql(`begin; select set_config('request.jwt.claim.sub',${quote(owner)},true);
    update public.media_assets set state='ready',mime_type='image/png',byte_size=${photo.length},width=8,height=8,frame_count=1,sha256=${quote(sha(photo))} where id=${quote(asset)};
    insert into public.concepts(id,name,created_by,status) values(${quote(concept)},'Preserved synthetic recovery contribution',${quote(owner)},'published');
    insert into public.concept_placements(concept_id,library_node_id) values(${quote(concept)},${quote(node)});
    insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text) values(${quote(placement)},${quote(asset)},${quote(library)},${quote(concept)},'concept',0,'Preserved official image');
    insert into public.concept_versions(id,concept_id,version_number,name,body_markdown,created_by) values(${quote(version)},${quote(concept)},1,'Immutable synthetic revision','Preserved official text',${quote(owner)});
    update public.concepts set current_version_id=${quote(version)} where id=${quote(concept)}; commit;`);
  const createdAt = new Date().toISOString();
  const backup = execFileSync('docker', ['exec', 'socrates-creator-navy-uat-db', 'pg_dump', '-U', 'postgres', '-Fc', '--no-publications', '--no-subscriptions', 'account127_uat'], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`${directory}/synthetic-before-deletion.dump`, backup, { mode: 0o600, flag: 'wx' });
  execFileSync('docker', ['cp', 'socrates-account127-storage:/var/lib/storage', `${directory}/synthetic-object-backup`], { stdio: ['ignore', 'ignore', 'pipe'] });
  const fixture = { owner, other, concept, version, asset, path, checkpoint: { isolated: true, source: config.source, backupSha256: sha(backup), backupPath: `${directory}/synthetic-before-deletion.dump`, createdAt }, versionHash: sql(`select md5((to_jsonb(t)-'created_by')::text) from public.concept_versions t where id=${quote(version)}`) };
  writeFileSync(saved, JSON.stringify(fixture), { mode: 0o600, flag: 'wx' });
  await remove(admin, owner);
  check(Boolean((await admin.auth.admin.getUserById(owner)).error), 'synthetic source account deleted after backup');
  check((await ledger.read(owner)).confirmedAt > createdAt, 'independent intent is newer than restored checkpoint');
  const events = await Promise.all(Array.from({ length: 5 }, () => ledger.record(owner)));
  check(events.every(event => event.confirmedAt === events[0].confirmedAt), 'real S3 protocol preserves original intent on duplicate requests');
  const signed = signedS3Request(config, 'PUT', `deletions/${config.source}/${owner}.json`, {}, '{}', { 'if-none-match': '*', 'content-md5': createHash('md5').update('{}').digest('base64') });
  const overwrite = await fetch(signed.url, { ...signed, redirect: 'error' });
  check(overwrite.status === 412, 'conditional overwrite refused by disposable S3 service');
  console.log(JSON.stringify({ stage: 'seeded-and-backed-up', passed, failed: 0 }));
} else {
  const fixture = JSON.parse(readFileSync(saved, 'utf8'));
  const recoveryEnv = Object.fromEntries(readFileSync(`${directory}/.recovery.env`, 'utf8').split('\n').filter(Boolean).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
  const db = recoveryEnv.ACCOUNT_RECOVERY_DB_NAME;
  assert.equal(db, 'account127_recovery_retention');
  const recoveryAdmin = createClient(recoveryEnv.ACCOUNT_RECOVERY_SUPABASE_URL, recoveryEnv.ACCOUNT_RECOVERY_SERVICE_ROLE_KEY, opts);
  check(sql(`select count(*) from auth.users where id=${quote(fixture.owner)}`, db) === '1', 'isolated pre-deletion restore contains the deleted identity before reconciliation');
  // Local file-backend xattrs do not survive a host docker-cp archive. Restore
  // the exact saved bytes through supported Storage upload, never by SQL edits.
  for (const [bucket, name] of [['socrates-profile-photos', `${fixture.owner}/avatar`], ['socrates-profile-photos', `${fixture.other}/avatar`], ['socrates-content-media', fixture.path]]) {
    const objectDirectory = `${directory}/synthetic-object-backup/undefined/creator-navy-disposable/${bucket}/${name}`;
    const versions = readdirSync(objectDirectory); assert.equal(versions.length, 1);
    const version = versions[0];
    assert.match(version, /^[0-9a-f-]{36}$/);
    const bytes = readFileSync(`${objectDirectory}/${version}`);
    assert.ok(bytes.equals(photo));
    assert.equal((await recoveryAdmin.storage.from(bucket).upload(name, bytes, { upsert: true, contentType: 'image/png' })).error, null);
  }
  check(!(await recoveryAdmin.storage.from('socrates-profile-photos').download(`${fixture.owner}/avatar`)).error, 'isolated restore includes synthetic private object bytes');
  const out = `${directory}/reconciliation`;
  sql(`create table public.account127_recovery_blocker(user_id uuid references auth.users(id) on delete restrict); insert into public.account127_recovery_blocker values(${quote(fixture.owner)});`, db);
  await assert.rejects(runRecovery(recoveryEnv, fixture.checkpoint, out));
  check(!existsSync(`${out}/READY.json`) && existsSync(`${out}/BLOCKED.json`), 'interrupted cleanup cannot issue readiness');
  check(sql(`select count(*) from auth.users where id=${quote(fixture.owner)}`, db) === '1', 'interrupted Auth transaction preserves identity for controlled retry');
  sql('drop table public.account127_recovery_blocker;', db);
  const result = await runRecovery(recoveryEnv, fixture.checkpoint, out);
  check(result.state === 'verified-isolated', 'restoration reconciliation completes after safe retry');
  check(sql(`select count(*) from auth.users where id=${quote(fixture.owner)}`, db) === '0', 'deleted Auth identity is absent from restored database');
  for (const [table, column] of [['personal_cards', 'owner_id'], ['personal_question_notes', 'user_id'], ['user_roles', 'user_id'], ['user_libraries', 'user_id']]) {
    check(sql(`select count(*) from public.${table} where ${column}=${quote(fixture.owner)}`, db) === '0', `restored ${table} personal records are absent`);
  }
  check(sql(`select count(*) from auth.sessions where user_id=${quote(fixture.owner)}`, db) === '0', 'no deleted identity sessions survive reconciliation');
  check(Boolean((await recoveryAdmin.storage.from('socrates-profile-photos').download(`${fixture.owner}/avatar`)).error), 'restored private photo bytes removed through Storage API');
  check(sql(`select md5((to_jsonb(t)-'created_by')::text)=${quote(fixture.versionHash)} and created_by is null from public.concept_versions t where id=${quote(fixture.version)}`, db) === 't', 'immutable official revision preserved with anonymous attribution');
  const official = await recoveryAdmin.storage.from('socrates-content-media').download(fixture.path);
  check(!official.error && Buffer.from(await official.data.arrayBuffer()).equals(photo), 'official shared image bytes remain identical');
  check(sql(`select count(*) from public.personal_cards where owner_id=${quote(fixture.other)}`, db) === '1', 'other learner personal Card preserved');
  check(sql(`select count(*) from public.personal_question_notes where user_id=${quote(fixture.other)}`, db) === '1', 'other learner private note preserved');
  const otherPhoto = await recoveryAdmin.storage.from('socrates-profile-photos').download(`${fixture.other}/avatar`);
  check(!otherPhoto.error && Buffer.from(await otherPhoto.data.arrayBuffer()).equals(photo), 'other learner private photo remains identical');
  const again = await runRecovery(recoveryEnv, fixture.checkpoint, out);
  check(again.ledgerSha256 === result.ledgerSha256, 'repeated restoration reconciliation is idempotent');
  check(existsSync(`${out}/BLOCKED.json`), 'successful proof does not enable user ingress');
  await assert.rejects(runRecovery({ ...recoveryEnv, DELETION_LEDGER_ENDPOINT: 'http://127.0.0.1:58969' }, fixture.checkpoint, out));
  check(!existsSync(`${out}/READY.json`), 'ledger outage invalidates stale readiness');
  await runRecovery(recoveryEnv, fixture.checkpoint, out);
  // Source fixtures only; the isolated restored database remains unavailable.
  await remove(admin, fixture.other);
  console.log(JSON.stringify({ stage: 'restored-and-reconciled', passed, failed: 0, realProviderIamVerified: false, productionMutations: 0 }));
}
