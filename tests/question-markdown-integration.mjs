// Explicit disposable persistence check. No hosted/Production target or schema changes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.MEDIA_DISPOSABLE_URL;
if (url !== 'http://127.0.0.1:56991' || process.env.MEDIA_DISPOSABLE_ACK !== 'media112-only') throw Error('Explicit isolated media112 environment required');
const key = process.env.MEDIA_DISPOSABLE_SERVICE_KEY;
if (!key || !process.env.MEDIA_DISPOSABLE_ADMIN_TOKEN || !process.env.MEDIA_DISPOSABLE_EDITOR_TOKEN) throw Error('Disposable credentials required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(url, key, options);
const sql = statement => execFileSync('docker', ['exec', '-i', 'socrates-media112-db', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'media112', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
assert.equal(sql('select current_database();'), 'media112');
assert.equal(sql("select bool_and(email like '%@example.test') from auth.users;"), 't');
const library = '11200000-0000-4000-8000-000000000010', concept = '11200000-0000-4000-8000-000000000030', admin = '11200000-0000-4000-8000-000000000001';
assert.equal(sql(`select name from libraries where id='${library}';`), 'Media disposable A');
const rpc = async (client, name, payload) => { const r = await client.rpc(name, payload); if (r.error) throw Error(r.error.message); return r.data; };
const objects = () => sql("select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'metadata',metadata) order by id),'[]') from storage.objects;");
const beforeObjects = objects(), targets = [], drafts = [], checks = [];
const record = message => { checks.push(message); console.log('PASS', message); };
const base = { p_question_id: null, p_concept_id: concept, p_question_type: 'short_answer', p_prompt: 'ZZ MARKDOWN INTEGRATION — Question', p_explanation: null,
  p_status: 'published', p_review_article_concept_id: null, p_sort_order: 0, p_difficulty: 'medium', p_testing_angle: 'General Understanding',
  p_accepted_answers: [{ answer_text: 'Answer', sort_order: 0 }], p_options: null, p_source_ids: null, p_tag_ids: [], p_active_library_id: library,
  p_related_concept_ids: [], p_additional_testing_angles: [] };
const read = async (token, id) => {
  const fresh = createClient(url, key, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const current = await fresh.from('questions').select('id,prompt,current_version_id,question_accepted_answers(answer_text)').eq('id', id).single();
  assert.equal(current.error, null);
  const version = JSON.parse(sql(`select row_to_json(v) from question_versions v where id='${current.data.current_version_id}';`));
  return { current: current.data, version };
};
try {
  for (const [role, token, actor] of [['admin', process.env.MEDIA_DISPOSABLE_ADMIN_TOKEN, admin], ['editor', process.env.MEDIA_DISPOSABLE_EDITOR_TOKEN, '11200000-0000-4000-8000-000000000002']]) {
    const auth = await db.auth.getUser(token); assert.equal(auth.error, null); assert.equal(auth.data.user.id, actor);
    const caller = createClient(url, key, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const prompt = `ZZ MARKDOWN INTEGRATION ${role}\n## Heading\n**Bold** and *italic*\n- One\n1. Two\n> Quote\n[link](https://example.test)`, answer = '**Answer**\n<script>literal</script>\n[unsafe](javascript:alert(1))';
    // The real Creator trims before dispatch; SQL's btrim alone does not remove
    // every outer newline. Exercise the actual client payload, not a new RPC policy.
    const payload = { ...base, p_prompt: ('  ' + prompt + '\n').trim(), p_accepted_answers: [{ answer_text: ('\n' + answer + '  ').trim(), sort_order: 0 }] };
    const created = await rpc(caller, 'save_question_with_relationships_v2', payload); targets.push(created.id);
    let { current, version } = await read(token, created.id);
    assert.equal(current.prompt, prompt); assert.equal(current.question_accepted_answers[0].answer_text, answer);
    assert.equal(version.prompt, prompt); assert.equal(version.accepted_answers_snapshot[0].answer_text, answer);
    const originalVersion = version.id;
    const edited = { ...payload, p_question_id: created.id, p_prompt: prompt.replace('**Bold**', '***Bold***'), p_accepted_answers: [{ answer_text: answer.replace('**Answer**', '*Answer*'), sort_order: 0 }] };
    await rpc(caller, 'save_question_with_relationships_v2', edited);
    ({ current, version } = await read(token, created.id));
    assert.equal(current.id, created.id); assert.notEqual(version.id, originalVersion); assert.equal(version.prompt, edited.p_prompt);
    assert.equal(version.accepted_answers_snapshot[0].answer_text, edited.p_accepted_answers[0].answer_text);
    assert.equal(sql(`select prompt from question_versions where id='${originalVersion}';`), prompt);
    record(`${role}: first save and formatting-only edit persist trimmed Markdown source in current rows and distinct immutable snapshots; fresh client readback`);
    const failed = await caller.rpc('save_question_with_relationships_v2', { ...edited, p_related_concept_ids: [randomUUID()] }); assert.ok(failed.error);
    assert.equal((await read(token, created.id)).version.id, version.id);
    record(`${role}: rejected association leaves source/version unchanged`);

    // Fixture-only current references reuse a real, already-referenced disposable
    // asset. No new Storage object or alteration of any existing content is needed.
    const asset = sql(`select a.id from media_assets a join content_media_placements p on p.asset_id=a.id where a.library_id='${library}' and a.scope='official' and a.state='ready' order by a.id limit 1;`);
    assert.match(asset, /^[0-9a-f-]{36}$/);
    const placements = ['front', 'answer'].map(surface => ({ placementId: randomUUID(), assetId: asset, surface, ordinal: 0, altText: 'ZZ MARKDOWN INTEGRATION ' + surface, caption: 'Synthetic reused image' }));
    sql(`begin;select set_config('request.jwt.claim.sub','${actor}',true);
      ${placements.map(p => `insert into content_media_placements(id,asset_id,library_id,question_id,surface,ordinal,alt_text,caption) values('${p.placementId}','${asset}','${library}','${created.id}','${p.surface}',0,'${p.altText}','${p.caption}');`).join('\n')}
      select append_question_version_snapshot('${created.id}','${actor}');commit;`);
    const previous = await rpc(db, 'm115_manifest', { p_actor: actor, p_library: library, p_question: created.id });
    const draft = randomUUID(), stale = randomUUID(); drafts.push(draft, stale);
    for (const id of [draft, stale]) await rpc(db, 'm115_draft', { p_actor: actor, p_library: library, p_draft: id, p_question: created.id, p_expected_version: previous.versionId, p_action: 'create' });
    const rich = { ...edited, p_prompt: edited.p_prompt + '\n> Further explanation', front: previous.placements.filter(p => p.surface === 'front'), answer: previous.placements.filter(p => p.surface === 'answer') };
    const args = { p_library: library, p_question: created.id, p_draft: draft, p_expected_version: previous.versionId, p_payload: rich };
    const saved = await rpc(caller, 'm115_save', args);
    const retry = await rpc(caller, 'm115_save', args); assert.deepEqual(retry, saved, 'Lost response reconciles the identical committed receipt');
    assert.ok((await caller.rpc('m115_save', { ...args, p_payload: { ...rich, p_prompt: 'Different retry' } })).error);
    assert.ok((await caller.rpc('m115_save', { ...args, p_draft: stale })).error);
    const manifest = await rpc(db, 'm115_manifest', { p_actor: actor, p_library: library, p_question: created.id });
    assert.equal(manifest.prompt, rich.p_prompt); assert.equal(manifest.answer, edited.p_accepted_answers[0].answer_text);
    assert.deepEqual(manifest.placements, previous.placements); assert.notEqual(manifest.versionId, previous.versionId);
    assert.equal(sql(`select count(*) from media_version_references where question_version_id='${previous.versionId}';`), '2');
    const reloaded = await read(token, created.id); assert.equal(reloaded.version.id, manifest.versionId); assert.equal(reloaded.version.prompt, rich.p_prompt);
    record(`${role}: formatting plus Front/Answer images preserves asset/order/alt/caption, immutable media history, exact receipt retry and stale-version rejection`);
  }
} finally {
  for (const id of targets) {
    assert.equal(sql(`select prompt like 'ZZ MARKDOWN INTEGRATION%' from questions where id='${id}';`), 't');
    sql(`begin;select set_config('request.jwt.claim.sub','${admin}',true);select public.delete_development_content('question','${id}');commit;`);
    for (const table of ['questions', 'question_versions', 'question_accepted_answers', 'content_media_placements']) {
      const column = table === 'questions' ? 'id' : 'question_id'; assert.equal(sql(`select count(*) from ${table} where ${column}='${id}';`), '0');
    }
  }
  for (const id of drafts) sql(`delete from question_media_drafts where id='${id}';`);
  assert.equal(objects(), beforeObjects, 'Storage object identity/metadata unchanged; existing shared media retained');
  record('All temporary Questions, versions, answers, placements and draft fixtures removed; zero new Storage objects');
  if (process.env.MEDIA_DISPOSABLE_REPORT) writeFileSync(process.env.MEDIA_DISPOSABLE_REPORT, JSON.stringify({ checks, questions: targets, fixtureDrafts: drafts, cleaned: true, storageUnchanged: true }, null, 2) + '\n');
}
