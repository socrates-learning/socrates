// Local synthetic PostgreSQL only. No hosted backend or Storage service is used.
// Creates and destroys its own database; never modifies the source fixture database.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const container = process.env.ANGLE_DISPOSABLE_CONTAINER;
const dump = process.env.ANGLE_DISPOSABLE_DUMP;
if (process.env.ANGLE_DISPOSABLE_ACK !== 'testing-angle119-only'
  || container !== 'socrates-home117-uat-db' || !dump) throw Error('Explicit synthetic angle119 environment required');
const config = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(config.HostConfig.NetworkMode, 'socrates-home117-uat');
assert.ok(!config.HostConfig.PortBindings || Object.keys(config.HostConfig.PortBindings).length === 0);
const database = 'testing_angle119_integration';
const args = (db = database, user = 'postgres') => ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1'];
const sql = (statement, db = database, user = 'postgres') => execFileSync('docker', args(db, user), {
  input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const sourceDb = 'home118_card_compatibility';
assert.equal(sql("select count(*)=4 and bool_and(email like 'zz-home117-%@example.invalid') from auth.users", sourceDb), 't');
assert.equal(sql('select count(*) from storage.objects', sourceDb), '0');
assert.equal(sql(`select count(*) from pg_database where datname=${quote(database)}`, 'postgres'), '0', 'Never overwrite an existing database');
const ids = { admin: '11700000-0000-4000-8000-000000000001', editor: '11700000-0000-4000-8000-000000000004',
  learner: '11700000-0000-4000-8000-000000000002', library: '11700000-0000-4000-8000-000000000010', concept: '11700000-0000-4000-8000-000000000050' };
const auth = actor => `select set_config('request.jwt.claim.sub',${quote(actor)},true);set local role authenticated;`;
const staff = (statement, actor = ids.admin) => sql(`begin;${auth(actor)}${statement}commit;`).split('\n').filter(Boolean).at(-1);
const base = { p_question_id: null, p_active_library_id: ids.library, p_concept_id: ids.concept,
  p_question_type: 'short_answer', p_prompt: 'ZZ ANGLE119 integration', p_prompt_format: 'legacy', p_explanation: null,
  p_status: 'published', p_review_article_concept_id: null, p_sort_order: 0, p_difficulty: 'medium', p_testing_angle: 'General Understanding',
  p_accepted_answers: [{ answer_text: 'ZZ ANGLE119 Answer', answer_format: 'legacy', sort_order: 0 }],
  p_options: null, p_source_ids: null, p_tag_ids: [], p_related_concept_ids: [], p_additional_testing_angles: [] };
const save = (payload, previous) => `select public.save_question_with_format(${quote(ids.library)},${previous ? quote(previous.current_version_id) : 'null'},${previous ? quote(previous.updated_at) : 'null'},${json(payload)});`;
const create = name => JSON.parse(staff(`select to_jsonb(public.create_testing_angle(${quote(name)}));`));
const retire = entry => `select to_jsonb(public.set_testing_angle_retired(${quote(entry.id)},true,${entry.revision}));`;
const checks = [];
const pass = name => { checks.push(name); console.log('PASS:', name); };
function snapshot() {
  const tables = JSON.parse(sql("select json_agg(relname order by relname) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') and relname<>'testing_angle_vocabulary'"));
  return Object.fromEntries(tables.map(table => [table, JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') from public."${table}" x`))]));
}
function lockedWriter(statement) {
  const child = spawn('docker', args(), { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '', unlock, fail;
  const locked = new Promise((resolve, reject) => { unlock = resolve; fail = reject; });
  child.stdout.on('data', bytes => { output += bytes; if (output.includes('ANGLE119_LOCKED')) unlock(); });
  child.stderr.on('data', bytes => { error += bytes; });
  const complete = new Promise((resolve, reject) => {
    child.on('error', err => { fail(err); reject(err); });
    child.on('close', code => {
      if (code) { const err = Error(error); fail(err); reject(err); }
      else resolve(output);
    });
  });
  child.stdin.end(`begin;set local statement_timeout='8s';${auth(ids.admin)}${statement}select 'ANGLE119_LOCKED';select pg_sleep(0.5);commit;`);
  return { locked, complete };
}

sql(`create database ${database} owner postgres`, 'postgres', 'supabase_admin');
try {
  sql(readFileSync(dump, 'utf8'), database, 'supabase_admin');
  assert.equal(sql("select count(*)=4 and bool_and(email like 'zz-home117-%@example.invalid') from auth.users"), 't');
  assert.equal(sql("select to_regclass('public.testing_angle_vocabulary') is null"), 't');
  const sourceBefore = snapshot();
  const current = JSON.parse(staff(save({ ...base, p_testing_angle: 'ZZ ANGLE119 Current Custom', p_additional_testing_angles: ['ZZ ANGLE119 Current Additional'] })));
  const historical = JSON.parse(staff(save({ ...base, p_testing_angle: 'ZZ ANGLE119 History Primary', p_additional_testing_angles: ['ZZ ANGLE119 History Additional'] })));
  staff(save({ ...base, p_question_id: historical.id }, historical));
  sql(`insert into public.review_attempts(user_id,concept_id,result,score,testing_angle) values(${quote(ids.learner)},${quote(ids.concept)},'average',100,'ZZ ANGLE119 Attempt Only');
    select public.apply_user_concept_evidence(${quote(ids.learner)},${quote(ids.concept)},'average','ZZ ANGLE119 Evidence Only',now(),'medium');`);
  const seededBefore = snapshot();
  sql(readFileSync(new URL('../supabase/119_testing_angle_vocabulary.sql', import.meta.url), 'utf8'));
  assert.deepEqual(snapshot(), seededBefore);
  const catalog = JSON.parse(sql('select jsonb_agg(to_jsonb(v) order by sort_order) from public.testing_angle_vocabulary v'));
  assert.deepEqual(catalog.slice(0, 9).map(v => [v.storage_key, v.status]), [
    'General Understanding', 'Recognition / Definition', 'Mechanism / Pathophysiology', 'Clinical Manifestations',
    'Assessment / Interpretation', 'Clinical Application', 'Intervention / Management', 'Complications / Outcomes', 'Differentiation / Comparison',
  ].map(name => [name, 'active']));
  for (const suffix of ['Current Custom', 'Current Additional']) assert.equal(catalog.find(v => v.storage_key === `ZZ ANGLE119 ${suffix}`).status, 'active');
  for (const suffix of ['History Primary', 'History Additional', 'Attempt Only', 'Evidence Only']) assert.equal(catalog.find(v => v.storage_key === `ZZ ANGLE119 ${suffix}`).status, 'retired');
  pass('migration seeds nine defaults, current custom values and all four historical sources without changing any original table row');
  sql(readFileSync(new URL('../supabase/verify_119_testing_angle_vocabulary.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('./testing-angle-vocabulary.sql', import.meta.url), 'utf8'));
  assert.deepEqual(snapshot(), seededBefore);
  pass('installed verifier and rollback-only role/save/version contracts pass with exact fixture preservation');

  // Original text keys continue to drive both Primary and Additional Search.
  const entry = catalog.find(v => v.storage_key === current.testing_angle);
  const renamed = JSON.parse(staff(`select to_jsonb(public.rename_testing_angle(${quote(entry.id)},'ZZ ANGLE119 Current Label',1));`));
  staff(retire(renamed));
  const primaryResults = JSON.parse(staff(`select coalesce(jsonb_agg(x->>'id'),'[]') from public.search_creator_questions_with_media(${quote(ids.library)},p_primary_testing_angle=>${quote(current.testing_angle)}) x;`));
  assert.ok(primaryResults.includes(current.id));
  const additionalResults = JSON.parse(staff(`select coalesce(jsonb_agg(x->>'id'),'[]') from public.search_creator_questions_with_media(${quote(ids.library)},p_additional_testing_angle=>'ZZ ANGLE119 Current Additional') x;`));
  assert.ok(additionalResults.includes(current.id));
  assert.deepEqual(snapshot(), seededBefore);
  pass('Rename/Remove leave all Questions, versions, attempts and evidence unchanged; exact original Search keys still find current Questions');

  const duplicate = lockedWriter("select public.create_testing_angle('ZZ ANGLE119 Concurrent Add');");
  await duplicate.locked;
  assert.throws(() => staff("select public.create_testing_angle(' zz angle119 concurrent add ');", ids.editor), /already used or reserved/);
  await duplicate.complete;
  assert.equal(sql("select count(*) from public.testing_angle_vocabulary where lower(storage_key)='zz angle119 concurrent add'"), '1');
  pass('concurrent duplicate Add creates one identity and rejects the competing normalized name');

  const stale = create('ZZ ANGLE119 Concurrent Rename');
  const renameWriter = lockedWriter(`select public.rename_testing_angle(${quote(stale.id)},'ZZ ANGLE119 New Label',1);`);
  await renameWriter.locked;
  assert.throws(() => staff(retire(stale), ids.editor), /changed; reload/);
  await renameWriter.complete;
  assert.equal(sql(`select status||':'||revision from public.testing_angle_vocabulary where id=${quote(stale.id)}`), 'active:2');
  pass('concurrent stale retirement cannot overwrite a completed rename');

  const first = create('ZZ ANGLE119 Save First');
  const beforeSave = Number(sql('select count(*) from public.questions'));
  const saveWriter = lockedWriter(save({ ...base, p_testing_angle: first.storage_key }));
  await saveWriter.locked;
  staff(retire(first), ids.editor);
  await saveWriter.complete;
  assert.equal(Number(sql('select count(*) from public.questions')), beforeSave + 1);
  assert.equal(sql(`select count(*) from public.questions where testing_angle=${quote(first.storage_key)}`), '1');
  pass('save-first locks the vocabulary until commit; subsequent retirement preserves the saved association');

  const second = create('ZZ ANGLE119 Retire First');
  const beforeRetire = snapshot();
  const retirement = lockedWriter(retire(second));
  await retirement.locked;
  assert.throws(() => staff(save({ ...base, p_testing_angle: second.storage_key }), ids.editor), /removed from future availability/);
  await retirement.complete;
  assert.deepEqual(snapshot(), beforeRetire);
  pass('retire-first blocks/rejects the competing new assignment atomically with zero Question/version residue');

  // Older writer and image transaction remain separate entrypoints, reaching the
  // same validation before any Question, relationship or version is committed.
  const legacyArgs = primary => `${quote(ids.concept)},'short_answer','ZZ ANGLE119 old writer',null,'published',null,0,'medium',${quote(primary)},'[{"answer_text":"ZZ Answer"}]'::jsonb,null,null::uuid[],array[]::uuid[]`;
  assert.throws(() => staff(`select public.save_question_with_version(null,${legacyArgs(second.storage_key)});`), /removed from future availability/);
  assert.throws(() => staff(`select public.save_question_with_relationships_v2(null,${legacyArgs(second.storage_key)},${quote(ids.library)},array[]::uuid[],array[]::text[]);`), /removed from future availability/);
  const legacy = JSON.parse(staff(`select to_jsonb(public.save_question_with_version(null,${legacyArgs('General Understanding')}));`));
  assert.throws(() => staff(`select public.save_question_with_version(${quote(legacy.id)},${legacyArgs(second.storage_key)});`), /removed from future availability/);
  const mediaDraft = sql('select gen_random_uuid()');
  sql(`begin;select set_config('request.jwt.claim.sub',${quote(ids.admin)},true);select public.m115_draft(${quote(ids.admin)},${quote(ids.library)},${quote(mediaDraft)},null,null,'create');commit;`);
  const mediaSave = primary => `select public.m115_save(${quote(ids.library)},null,${quote(mediaDraft)},null,${json({ ...base, p_testing_angle: primary, front: [], answer: [] })});`;
  const beforeFailure = snapshot();
  assert.throws(() => staff(mediaSave(second.storage_key)), /removed from future availability/);
  assert.deepEqual(snapshot(), beforeFailure);
  assert.equal(sql(`select state from public.question_media_drafts where id=${quote(mediaDraft)}`), 'open');
  const media = JSON.parse(staff(mediaSave('General Understanding')));
  const receipt = JSON.parse(staff(mediaSave('General Understanding')));
  assert.deepEqual(receipt, media);
  assert.equal(sql(`select count(*) from public.question_versions where question_id=${quote(media.id)}`), '1');
  pass('legacy/version/relationship/media save paths reject retired new assignments; media failure preserves draft and corrected retry creates one version');

  // Catalog state is not an eligibility predicate. Compare released selection in
  // the same transaction, including Cram; the full function verifier pins scoring.
  sql(`begin;select set_config('request.jwt.claim.sub',${quote(ids.admin)},true);
    -- The data-free reference omits this released Migration 073 configuration row.
    insert into public.study_priority_source_policy(policy_name,official_source_weight,personal_source_weight,max_source_absence,max_official_run,max_personal_run)
    values('normal_default',2,1,4,3,2) on conflict do nothing;
    do $$ declare a public.testing_angle_vocabulary; d uuid; s uuid; before_candidates jsonb; after_candidates jsonb; mode boolean; begin
      a:=public.create_testing_angle('ZZ ANGLE119 Eligibility');
      perform public.save_question_with_format(${quote(ids.library)},null,null,${json({ ...base, p_testing_angle: 'ZZ ANGLE119 Eligibility' })});
      perform set_config('request.jwt.claim.sub',${quote(ids.learner)},true);
      d:=(public.get_or_create_active_study_deck(${quote(ids.library)})).id;
      perform public.set_study_deck_node_selection(d,(select id from public.library_nodes where library_id=${quote(ids.library)} and parent_id is null limit 1),true);
      select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) into before_candidates from public.resolve_study_candidates(d) c;
      perform set_config('request.jwt.claim.sub',${quote(ids.admin)},true);
      perform public.rename_testing_angle(a.id,'ZZ ANGLE119 Eligibility Label',1);
      perform public.set_testing_angle_retired(a.id,true,2);
      perform set_config('request.jwt.claim.sub',${quote(ids.learner)},true);
      select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) into after_candidates from public.resolve_study_candidates(d) c;
      if before_candidates is distinct from after_candidates then raise exception 'Catalog changed candidate eligibility'; end if;
      foreach mode in array array[false,true] loop
        update public.study_decks set cram_mode=mode where id=d;
        s:=public.start_study_session(d,50);
        if public.select_next_study_candidate_with_media(s,false) is null then raise exception 'Study/Cram selection missing'; end if;
        perform public.end_study_session(s);
      end loop;
    end $$;rollback;`);
  pass('Rename/Remove leave Study candidate set unchanged; ordinary Study and Cram continue selecting through released functions');
  assert.equal(sql('select count(*) from storage.objects'), '0');
  assert.equal(sql("select count(*)=4 and bool_and(email like 'zz-home117-%@example.invalid') from auth.users"), 't');
  if (process.env.ANGLE_DISPOSABLE_REPORT) writeFileSync(process.env.ANGLE_DISPOSABLE_REPORT, JSON.stringify({ container, database, checks,
    originalTables: Object.keys(sourceBefore).length, historicalMigrationPreserved: true, storageObjects: 0, cleanup: 'entire dedicated integration database destroyed in finally' }, null, 2));
} finally {
  sql(`drop database ${database}`, 'postgres', 'supabase_admin');
}
console.log('PASS: dedicated integration database destroyed; source fixtures and browser validation database untouched');
