// Explicit disposable-only integration. Never reads repository/Production env.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createDeletionLedger, ledgerConfig } from '../lib/account-deletion-ledger.mjs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';
const { continueDeletion } = loadMediaModule('lib/account-deletion.ts');
const env = Object.fromEntries(readFileSync(process.env.ACCOUNT_DELETION_DISPOSABLE_ENV, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => { const at = l.indexOf('='); return [l.slice(0, at), l.slice(at + 1)]; }));
assert.match(env.NEXT_PUBLIC_SUPABASE_URL, /^http:\/\/127\.0\.0\.1:58942$/);
const config = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, config);
const client = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, config);
const sql = statement => execFileSync('docker', ['exec', '-i', 'socrates-creator-navy-uat-db', 'psql', '-U', 'postgres', '-d', 'account127_uat', '-XAt', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8' }).trim();
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
let passed = 0;
const check = (ok, label) => { assert.ok(ok, label); passed++; console.log('PASS:', label); };
const library = sql("select id from public.libraries where status='active' order by id limit 1");
const node = sql(`select id from public.library_nodes where library_id=${literal(library)} order by id limit 1`);
const question = sql("select id from public.questions where status='published' order by id limit 1");
assert.match(library, /^[0-9a-f-]{36}$/); assert.match(question, /^[0-9a-f-]{36}$/);
const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } }).png().toBuffer();
const created = [];
async function account(role) {
  const password = randomBytes(24).toString('base64url'), email = `delete-${randomBytes(6).toString('hex')}@example.invalid`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Disposable deletion fixture', socrates_profile: { location: 'Synthetic location' } } });
  assert.equal(result.error, null, 'disposable account creation'); const id = result.data.user.id; created.push(id);
  sql(`insert into public.user_roles(user_id,role) values(${literal(id)},${literal(role)}); insert into public.user_libraries(user_id,library_id) values(${literal(id)},${literal(library)});`);
  const api = client(); const login = await api.auth.signInWithPassword({ email, password }); assert.equal(login.error, null);
  const uploaded = await api.storage.from('socrates-profile-photos').upload(`${id}/avatar`, photo, { contentType: 'image/png' }); assert.equal(uploaded.error, null);
  sql(`select set_config('request.jwt.claim.sub',${literal(id)},false); insert into public.personal_cards(owner_id,library_id,library_node_id,question,answer) values(${literal(id)},${literal(library)},${literal(node)},'Disposable front','Disposable back'); insert into public.personal_question_notes(user_id,question_id,note) values(${literal(id)},${literal(question)},'Disposable private mnemonic');`);
  return { id, api, session: login.data.session };
}
const hash = () => createHash('sha256').update(randomBytes(32)).digest('hex');
const ledger = createDeletionLedger(ledgerConfig());
const service = {
  async recordIntent(id) { await ledger.record(id); },
  async status(receipt) { const result = await admin.rpc('account_deletion_status', { p_receipt_hash: receipt }); assert.equal(result.error, null); return result.data; },
  async remove(bucket, names) { const result = await admin.storage.from(bucket).remove(names); assert.equal(result.error, null, 'Storage API cleanup'); },
  async deleteIdentity(id) { const result = await admin.auth.admin.deleteUser(id, false); if (result.error) throw new Error(result.error.message); },
};
async function begin(id, receipt) { const r = await admin.rpc('begin_account_deletion', { p_user: id, p_receipt_hash: receipt }); assert.equal(r.error, null, 'service-only begin'); }
async function contribution(owner) {
  const concept = randomUUID(), version = randomUUID(), asset = randomUUID(), placement = randomUUID(), path = `${library}/${asset}`;
  sql(`select set_config('request.jwt.claim.sub',${literal(owner)},false);
    insert into public.media_assets(id,library_id,created_by,scope,object_name) values(${literal(asset)},${literal(library)},${literal(owner)},'official',${literal(path)});`);
  const uploaded = await admin.storage.from('socrates-content-media').upload(path, photo, { contentType: 'image/png' }); assert.equal(uploaded.error, null);
  sql(`begin; select set_config('request.jwt.claim.sub',${literal(owner)},true);
    update public.media_assets set state='ready',mime_type='image/png',byte_size=${photo.length},width=8,height=8,frame_count=1,sha256=${literal(createHash('sha256').update(photo).digest('hex'))} where id=${literal(asset)};
    insert into public.concepts(id,name,created_by,status) values(${literal(concept)},'Preserved disposable official content',${literal(owner)},'published');
    insert into public.concept_placements(concept_id,library_node_id) values(${literal(concept)},${literal(node)});
    insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text) values(${literal(placement)},${literal(asset)},${literal(library)},${literal(concept)},'concept',0,'Preserved official image');
    insert into public.concept_versions(id,concept_id,version_number,name,body_markdown,created_by) values(${literal(version)},${literal(concept)},1,'Preserved official version','Immutable contributed body',${literal(owner)});
    update public.concepts set current_version_id=${literal(version)} where id=${literal(concept)}; commit;`);
  const fingerprint = sql(`select md5((to_jsonb(t)-'created_by')::text) from public.concept_versions t where id=${literal(version)}`);
  return { version, asset, path, fingerprint };
}
function ownFingerprint(id) {
  return sql(`select md5(coalesce(jsonb_agg(value order by value::text)::text,'')) from (select to_jsonb(t) value from public.personal_cards t where owner_id=${literal(id)} union all select to_jsonb(t) from public.personal_question_notes t where user_id=${literal(id)} union all select to_jsonb(t) from public.user_roles t where user_id=${literal(id)}) t`);
}
const other = await account('learner'), before = ownFingerprint(other.id);
try {
  for (const role of ['learner', 'editor', 'admin']) {
    const owner = await account(role), receipt = hash();
    const official = role === 'learner' ? null : await contribution(owner.id);
    const forbidden = await owner.api.rpc('begin_account_deletion', { p_user: other.id, p_receipt_hash: receipt });
    check(Boolean(forbidden.error), `${role}: direct cross-account deletion RPC denied`);
    await begin(owner.id, receipt);
    check((await service.status(receipt)).state === 'pending', `${role}: request is durable before cleanup`);
    const early = await admin.auth.admin.deleteUser(owner.id, false);
    check(Boolean(early.error), `${role}: provider refuses deletion before private Storage cleanup`);
    check(Boolean((await admin.auth.admin.getUserById(owner.id)).data.user), `${role}: failed cleanup preserves Auth identity`);
    const stale = await owner.api.from('personal_question_notes').select('note');
    check(!stale.error && stale.data.length === 0, `${role}: stale JWT loses private-data access`);
    const upload = await owner.api.storage.from('socrates-profile-photos').upload(`${owner.id}/avatar`, photo, { upsert: true, contentType: 'image/png' });
    check(Boolean(upload.error), `${role}: late private-photo write is rejected`);
    // Force a DB failure after byte cleanup. The entire Auth/application delete
    // must roll back; removing this disposable blocker enables a safe retry.
    const fingerprint = ownFingerprint(owner.id);
    sql(`create table public.account127_test_blocker(user_id uuid references auth.users(id) on delete restrict); insert into public.account127_test_blocker values(${literal(owner.id)});`);
    await assert.rejects(continueDeletion(service, receipt));
    check(ownFingerprint(owner.id) === fingerprint, `${role}: interrupted Auth transaction preserves personal rows`);
    check((await service.status(receipt)).state === 'pending', `${role}: failure never reports completion`);
    sql('drop table public.account127_test_blocker;');
    await continueDeletion(service, receipt);
    check((await service.status(receipt)).state === 'complete', `${role}: retry completes deletion`);
    check(Boolean((await admin.auth.admin.getUserById(owner.id)).error), `${role}: Auth identity is absent`);
    check(sql(`select count(*) from public.personal_cards where owner_id=${literal(owner.id)}`) === '0', `${role}: personal Cards are absent`);
    check(sql(`select count(*) from public.personal_question_notes where user_id=${literal(owner.id)}`) === '0', `${role}: private notes are absent`);
    check(Boolean((await admin.storage.from('socrates-profile-photos').download(`${owner.id}/avatar`)).error), `${role}: private image bytes are absent`);
    if (official) {
      check(sql(`select md5((to_jsonb(t)-'created_by')::text)=${literal(official.fingerprint)} and created_by is null from public.concept_versions t where id=${literal(official.version)}`) === 't', `${role}: official revision content and timestamp preserved with anonymous attribution`);
      check(sql(`select created_by is null from public.media_assets where id=${literal(official.asset)}`) === 't', `${role}: shared asset identity remains with anonymous attribution`);
      const retained = await admin.storage.from('socrates-content-media').download(official.path);
      check(!retained.error && Buffer.from(await retained.data.arrayBuffer()).equals(photo), `${role}: official historical image bytes remain identical`);
    }
    const refresh = await client().auth.refreshSession({ refresh_token: owner.session.refresh_token });
    check(Boolean(refresh.error), `${role}: deleted session cannot refresh`);
    await continueDeletion(service, receipt);
    check((await service.status(receipt)).state === 'complete', `${role}: duplicate deletion succeeds idempotently`);
    check(ownFingerprint(other.id) === before, `${role}: other learner data unchanged`);
    const otherPhoto = await other.api.storage.from('socrates-profile-photos').download(`${other.id}/avatar`);
    check(!otherPhoto.error && otherPhoto.data.size === photo.length, `${role}: other learner photo remains accessible`);
  }
} finally {
  // Only disposable identities created above. Failures retain pending records
  // for diagnosis; no role or immutable-history bypass is used for cleanup.
  sql('drop table if exists public.account127_test_blocker;');
  for (const id of created) {
    if (!(await admin.auth.admin.getUserById(id)).data.user) continue;
    const receipt = hash(); await begin(id, receipt); await continueDeletion(service, receipt);
  }
}
console.log(JSON.stringify({ passed, failed: 0, disposableOnly: true }));
