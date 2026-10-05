// Explicit disposable Data API proof. Never uses repository .env files or hosted services.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const container = 'socrates-home117-uat-db';
const database = 'tag_browse_integration';
const rest = 'socrates-tag-browse-integration-rest';
const evidence = process.env.TAG_DISPOSABLE_EVIDENCE;
const dump = process.env.TAG_DISPOSABLE_DUMP;
const restEnv = process.env.TAG_DISPOSABLE_REST_ENV;
assert.equal(process.env.TAG_DISPOSABLE_ACK, 'tag-browse-only');
assert.ok(evidence && dump && restEnv, 'Explicit disposable infrastructure paths required');
const config = JSON.parse(execFileSync('docker', ['inspect', container]))[0];
assert.equal(config.HostConfig.NetworkMode, 'socrates-home117-uat');
assert.ok(!config.HostConfig.PortBindings || Object.keys(config.HostConfig.PortBindings).length === 0);
const sql = (input, db = database, user = 'postgres') => execFileSync('docker', [
  'exec', '-i', container, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', db,
], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
assert.equal(sql("select count(*)=4 and bool_and(email like 'zz-home117-%@example.invalid') from auth.users", 'home118_card_compatibility'), 't');
assert.equal(sql("select count(*) from pg_database where datname='tag_browse_integration'", 'postgres'), '0');
const settings = Object.fromEntries(readFileSync(restEnv, 'utf8').trim().split('\n').map(line => {
  const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)];
}));
assert.match(settings.PGRST_DB_URI, /^postgres(?:ql)?:\/\/[^@]+@socrates-home117-uat-db:5432\/tag_browse_uat$/);
settings.PGRST_DB_URI = settings.PGRST_DB_URI.replace(/\/tag_browse_uat$/, '/' + database);
// Exercise a real response cap; do not enable extra API features/aggregates.
settings.PGRST_DB_MAX_ROWS = '1000';
const envPath = join(evidence, 'integration-rest.env');
writeFileSync(envPath, Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
let restCreated = false;
sql('create database tag_browse_integration owner postgres', 'postgres', 'supabase_admin');
try {
  sql(readFileSync(dump, 'utf8'), database, 'supabase_admin');
  assert.equal(sql("select count(*)=4 and bool_and(email like 'zz-home117-%@example.invalid') from auth.users"), 't');
  assert.equal(sql('select count(*) from storage.objects'), '0');
  sql(readFileSync(new URL('../supabase/119_testing_angle_vocabulary.sql', import.meta.url), 'utf8'));
  const schemaBefore = sql("select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where pronamespace='public'::regnamespace and prokind='f'");
  sql(`begin;
    select set_config('request.jwt.claim.sub','11700000-0000-4000-8000-000000000001',true);
    insert into public.tags(name,slug) select 'ZZ TAG BROWSE '||lpad(i::text,4,'0'),'temporary-'||i from generate_series(1,1105) i;
    insert into public.concepts(id,name,body_markdown)
      select ('12000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'ZZ TAG COUNT '||i,'Synthetic count fixture' from generate_series(1,1105) i;
    insert into public.questions(concept_id,prompt,question_type)
      select id,'ZZ TAG COUNT Question','short_answer' from public.concepts where name like 'ZZ TAG COUNT %';
    insert into public.articles(slug,title) select 'zz-tag-count-'||i,'ZZ TAG COUNT Article '||i from generate_series(1,1105) i;
    insert into public.article_tags(article_id,tag_id) select a.id,t.id from public.articles a cross join public.tags t where a.title like 'ZZ TAG COUNT Article %' and t.name='ZZ TAG BROWSE 0001';
    insert into public.concept_tags(concept_id,tag_id)
      select c.id,t.id from public.concepts c cross join public.tags t where c.name like 'ZZ TAG COUNT %' and t.name='ZZ TAG BROWSE 0001';
    insert into public.question_tags(question_id,tag_id)
      select q.id,t.id from public.questions q cross join public.tags t where q.prompt='ZZ TAG COUNT Question' and t.name='ZZ TAG BROWSE 0001';
    commit;`);
  execFileSync('docker', ['run', '-d', '--name', rest, '--network', 'socrates-home117-uat', '--env-file', envPath,
    'public.ecr.aws/supabase/postgrest:v16.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  restCreated = true;
  // Execute HTTP on the isolated Docker network; no public host or Production credential.
  async function apiProof() {
    const { default: assert } = await import('node:assert/strict');
    const { createHmac } = await import('node:crypto');
    const root = 'http://socrates-tag-browse-integration-rest:3000/';
    const ids = { admin: '11700000-0000-4000-8000-000000000001', editor: '11700000-0000-4000-8000-000000000004',
      learner: '11700000-0000-4000-8000-000000000002', library: '11700000-0000-4000-8000-000000000010', concept: '11700000-0000-4000-8000-000000000050' };
    const jwt = (actor, role = 'authenticated') => {
      const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const data = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: actor, role, exp: Math.floor(Date.now() / 1000) + 600 });
      return data + '.' + createHmac('sha256', process.env.PGRST_JWT_SECRET).update(data).digest('base64url');
    };
    const headers = (actor = ids.admin) => ({ Authorization: `Bearer ${jwt(actor)}`, 'Content-Type': 'application/json', Prefer: 'count=exact' });
    async function request(path, { actor = ids.admin, method = 'GET', body } = {}) {
      const response = await fetch(root + path, { method, headers: headers(actor), body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : null, range: response.headers.get('content-range') };
    }
    const checks = [];
    for (let attempt = 0; ; attempt++) {
      try { if ([200, 206].includes((await request('tags?select=id&limit=1')).status)) break; } catch { /* startup */ }
      assert.ok(attempt < 40, 'Disposable REST startup');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const columns = 'id,name,slug,status,concept_tags(count),question_tags(count),article_tags(count)';
    const pages = [];
    for (let offset = 0; offset < 1105; offset += 50) {
      const r = await request('tags?' + new URLSearchParams({ select: columns, order: 'name.asc,id.asc', offset, limit: 50 }));
      assert.equal(r.status, 206); assert.match(r.range, /\/1105$/); assert.ok(r.data.length <= 50); pages.push(...r.data);
    }
    assert.equal(pages.length, 1105); assert.equal(new Set(pages.map(t => t.id)).size, 1105);
    assert.equal(pages[0].name, 'ZZ TAG BROWSE 0001'); assert.equal(pages.at(-1).name, 'ZZ TAG BROWSE 1105');
    assert.deepEqual(pages[0].concept_tags, [{ count: 1105 }]);
    assert.deepEqual(pages[0].question_tags, [{ count: 1105 }]);
    assert.deepEqual(pages[0].article_tags, [{ count: 1105 }]);
    checks.push('50-row deterministic pages expose all 1105 Tags; related counts return 1105 despite the 1000-row API cap');

    async function rpc(name, payload, actor = ids.admin) { return request('rpc/' + name, { method: 'POST', body: payload, actor }); }
    for (const [query, name] of [
      ['A*B', 'ZZ TAG Star A*B'], ['A%B', 'ZZ TAG Percent A%B'], ['A_B', 'ZZ TAG Under A_B'],
      ['A\\B', 'ZZ TAG Slash A\\B'], ['A"B', 'ZZ TAG Quote A"B'], ['A,B', 'ZZ TAG Comma A,B'],
      ['A(B)', 'ZZ TAG Brackets A(B)'], ['Café', 'ZZ TAG Café'],
    ]) {
      const created = await rpc('create_catalog_tag', { p_name: name }); assert.equal(created.status, 200);
      // Escape regex operators, then quote the API grammar; * must not become LIKE's % alias.
      const literal = JSON.stringify(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const result = await request('tags?' + new URLSearchParams({ select: 'id,name', or: `(name.imatch.${literal},slug.imatch.${literal})`, order: 'name.asc,id.asc', limit: 50 }));
      assert.equal(result.status, 200); assert.deepEqual(result.data.map(t => t.id), [created.data.id]);
    }
    const late = await request('tags?select=id,name&or=(name.imatch."1105",slug.imatch."1105")&limit=50');
    assert.deepEqual(late.data.map(t => t.id), [pages.at(-1).id]);
    const slug = await request('tags?select=id,name&or=(name.imatch."tag-browse-1105",slug.imatch."tag-browse-1105")&limit=50');
    assert.deepEqual(slug.data.map(t => t.id), [pages.at(-1).id]);
    checks.push('literal name/slug search finds late-page Tags and safely treats wildcard, regex, quote, comma, backslash and Unicode text');

    const created = await rpc('create_catalog_tag', { p_name: 'ZZ TAG Lifecycle' }, ids.editor); assert.equal(created.status, 200);
    const id = created.data.id;
    const renamed = await rpc('rename_catalog_tag', { p_tag_id: id, p_name: 'ZZ TAG Renamed' }, ids.editor);
    assert.equal(renamed.status, 200); assert.equal(renamed.data.id, id);
    assert.equal((await rpc('archive_catalog_tag', { p_tag_id: id }, ids.editor)).data.status, 'archived');
    assert.equal((await request(`tags?id=eq.${id}&status=eq.active&select=id`)).data.length, 0);
    assert.equal((await request(`tags?id=eq.${id}&select=id,status`)).data[0].status, 'archived');
    assert.equal((await rpc('reactivate_catalog_tag', { p_tag_id: id }, ids.editor)).data.status, 'active');
    assert.ok((await rpc('create_catalog_tag', { p_name: 'zz tag renamed' })).status >= 400);
    for (const [fn, payload] of [['create_catalog_tag', { p_name: 'ZZ TAG Forbidden' }], ['rename_catalog_tag', { p_tag_id: id, p_name: 'ZZ TAG Forbidden' }], ['archive_catalog_tag', { p_tag_id: id }], ['reactivate_catalog_tag', { p_tag_id: id }], ['delete_development_content', { p_record_type: 'tag', p_record_id: id }]]) {
      assert.ok((await rpc(fn, payload, ids.learner)).status >= 400, fn);
    }
    const anonymous = await fetch(root + 'tags?select=id&limit=1'); assert.ok([200, 401, 403].includes(anonymous.status));
    if (anonymous.status === 200) assert.deepEqual(await anonymous.json(), []);
    const directWrite = await request('tags?id=eq.' + id, { method: 'PATCH', body: { name: 'ZZ TAG Direct Denied' } });
    assert.ok(directWrite.status >= 400);
    checks.push('Admin/Editor keep management; normalized duplicate rejected; archived choices excluded; learner management/direct table writes denied');

    const conceptPayload = { p_concept_id: null, p_name: 'ZZ TAG Saved Concept', p_body_markdown: 'ZZ TAG Concept body',
      p_active_library_id: ids.library, p_library_node_ids: ['11700000-0000-4000-8000-000000000020'], p_tag_ids: [id],
      p_status: 'published', p_references: [], p_prerequisites: [] };
    const conceptSaved = await rpc('save_concept_with_format', { p_active_library_id: ids.library, p_expected_version: null,
      p_expected_updated_at: null, p_body_format: 'legacy', p_payload: conceptPayload });
    assert.equal(conceptSaved.status, 200, JSON.stringify(conceptSaved.data));
    const savedConcept = conceptSaved.data;
    assert.equal((await rpc('get_concept_tags', { p_concept_id: savedConcept.concept_id })).data[0].id, id);
    const conceptUpdated = await rpc('save_concept_with_format', { p_active_library_id: ids.library, p_expected_version: savedConcept.version_id,
      p_expected_updated_at: savedConcept.updated_at, p_body_format: 'legacy', p_payload: { ...conceptPayload, p_concept_id: savedConcept.concept_id, p_body_markdown: 'ZZ TAG Edited Concept' } });
    assert.equal(conceptUpdated.status, 200, JSON.stringify(conceptUpdated.data));
    assert.equal((await rpc('get_concept_tags', { p_concept_id: savedConcept.concept_id })).data[0].id, id);
    checks.push('Concept first-save, edit and fresh readback retain exact Tag UUID through the released format/prerequisite transaction');

    const base = { p_question_id: null, p_concept_id: ids.concept, p_question_type: 'short_answer', p_prompt: 'ZZ TAG Saved Question',
      p_prompt_format: 'legacy', p_explanation: null, p_status: 'published', p_review_article_concept_id: null, p_sort_order: 0,
      p_difficulty: 'medium', p_testing_angle: 'General Understanding', p_accepted_answers: [{ answer_text: 'ZZ TAG Answer', answer_format: 'legacy', sort_order: 0 }],
      p_options: null, p_source_ids: null, p_tag_ids: [id], p_active_library_id: ids.library, p_related_concept_ids: [], p_additional_testing_angles: [] };
    const saved = await rpc('save_question_with_format', { p_active_library_id: ids.library, p_expected_version: null, p_expected_updated_at: null, p_payload: base });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const question = saved.data;
    assert.equal((await request(`question_tags?question_id=eq.${question.id}&select=tag_id`)).data[0].tag_id, id);
    await rpc('archive_catalog_tag', { p_tag_id: id });
    const updated = await rpc('save_question_with_format', { p_active_library_id: ids.library, p_expected_version: question.current_version_id, p_expected_updated_at: question.updated_at,
      p_payload: { ...base, p_question_id: question.id, p_prompt: 'ZZ TAG Edited Question', p_accepted_answers: [{ ...base.p_accepted_answers[0], id: question.question_accepted_answers[0].id }] } });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    const rejected = await rpc('save_question_with_format', { p_active_library_id: ids.library, p_expected_version: null, p_expected_updated_at: null, p_payload: base });
    assert.ok(rejected.status >= 400); assert.match(rejected.data.message, /Archived tags cannot be newly assigned/);
    await rpc('reactivate_catalog_tag', { p_tag_id: id });
    await rpc('rename_catalog_tag', { p_tag_id: id, p_name: 'ZZ TAG Current Label' });
    const summary = await rpc('get_development_delete_summary', { p_record_type: 'tag', p_record_id: id });
    assert.equal(summary.status, 200); assert.match(summary.data.warning, /permanently remove those assignments/);
    assert.equal((await rpc('delete_development_content', { p_record_type: 'tag', p_record_id: id })).status, 200);
    assert.equal((await request(`tags?id=eq.${id}&select=id`)).data.length, 0);
    assert.equal((await request(`question_tags?question_id=eq.${question.id}&select=tag_id`)).data.length, 0);
    checks.push('Question save/readback keeps UUIDs; archived existing association survives edit; new archived association rejected; released permanent Delete removes current assignments');
    console.log(JSON.stringify({ checks, historicalConcept: savedConcept.concept_id, historicalQuestion: question.id, historicalTag: id, expectedHistoricalName: 'ZZ TAG Renamed' }));
  }
  const proof = JSON.parse(execFileSync('docker', ['run', '--rm', '-i', '--network', 'socrates-home117-uat', '--env-file', envPath,
    'node:24-bookworm-slim', 'node', '--input-type=module'], { input: `await (${apiProof.toString()})();`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  assert.equal(sql(`select count(*) from public.question_versions where question_id='${proof.historicalQuestion}' and tags_snapshot @> '[{"tag_id":"${proof.historicalTag}","name":"${proof.expectedHistoricalName}"}]'::jsonb`), '2');
  assert.equal(sql(`select count(*) from public.concept_versions where concept_id='${proof.historicalConcept}' and tags_snapshot @> '[{"tag_id":"${proof.historicalTag}","name":"${proof.expectedHistoricalName}"}]'::jsonb`), '2');
  proof.checks.push('both immutable Concept versions retain original Tag UUID/name after rename and permanent catalog deletion');
  proof.checks.push('both immutable Question versions retain original Tag UUID/name after rename and permanent catalog deletion');
  assert.equal(sql("select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where pronamespace='public'::regnamespace and prokind='f'"), schemaBefore);
  assert.equal(sql('select count(*) from storage.objects'), '0');
  writeFileSync(join(evidence, 'data-api-integration.json'), JSON.stringify({ ...proof, schemaUnchanged: true, production: false, cleanup: 'dedicated database and REST container destroyed in finally' }, null, 2) + '\n');
  console.log(proof.checks.map(name => 'PASS: ' + name).join('\n'));
} finally {
  if (restCreated) execFileSync('docker', ['rm', '-f', rest], { stdio: ['ignore', 'pipe', 'pipe'] });
  sql('drop database tag_browse_integration', 'postgres', 'supabase_admin');
  unlinkSync(envPath);
}
