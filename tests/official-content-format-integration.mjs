// Ordinary concurrent application saves only. Never hosted, Production or Storage-provider probes.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const container = process.env.FORMAT_DISPOSABLE_CONTAINER;
if (process.env.FORMAT_DISPOSABLE_ACK !== 'format116-only' || !/^socrates-format116-[a-z0-9-]+-db$/.test(container || '')) throw Error('Explicit isolated format116 environment required');
const config = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(config.Config.Labels['socrates.disposable'], 'official-format116-validation');
assert.equal(config.HostConfig.NetworkMode, 'none');
assert.ok(!config.HostConfig.PortBindings || Object.keys(config.HostConfig.PortBindings).length === 0);
const args = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'format116', '-v', 'ON_ERROR_STOP=1'];
const sql = text => execFileSync('docker', args, { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const quote = text => `'${String(text).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
assert.equal(sql('select current_database()'), 'format116');
assert.equal(sql("select count(*)=4 and bool_and(email like 'zz-format116-%@example.test') from auth.users"), 't');
const ids = { admin: '11600000-0000-4000-8000-000000000001', editor: '11600000-0000-4000-8000-000000000002', library: '11600000-0000-4000-8000-000000000010', concept: '11600000-0000-4000-8000-000000000030', article: '11600000-0000-4000-8000-000000000050' };
const tables = JSON.parse(sql("select json_agg(relname order by relname) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p')"));
const snapshot = () => Object.fromEntries(tables.map(table => [table, JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') from public."${table}" x`))]));
const before = snapshot();
const checks = [];
const record = name => { checks.push(name); console.log('PASS', name); };
const base = {
  p_question_id: null, p_active_library_id: ids.library, p_concept_id: ids.concept,
  p_question_type: 'short_answer', p_prompt: 'ZZ FORMAT116 concurrent legacy **literal**', p_prompt_format: 'legacy',
  p_explanation: null, p_status: 'published', p_review_article_concept_id: null, p_sort_order: 0,
  p_difficulty: 'medium', p_testing_angle: 'General Understanding',
  p_accepted_answers: [{ answer_text: 'ZZ FORMAT116 unchanged _Answer_', answer_format: 'legacy', sort_order: 0 }],
  p_options: null, p_source_ids: null, p_tag_ids: [], p_related_concept_ids: [], p_additional_testing_angles: [],
};
const auth = actor => `select set_config('request.jwt.claim.sub',${quote(actor)},true); set local role authenticated;`;
const save = (payload, version = null, updated = null) => `select save_question_with_format(${quote(ids.library)},${version ? quote(version) : 'null'},${updated ? quote(updated) : 'null'},${json(payload)});`;
function asStaff(statement, actor = ids.admin) {
  return sql(`begin;${auth(actor)}${statement}commit;`).split('\n').filter(Boolean).at(-1);
}
function startWriter(statement) {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', resolveLocked, rejectLocked;
  const locked = new Promise((resolve, reject) => { resolveLocked = resolve; rejectLocked = reject; });
  child.stdout.on('data', bytes => { stdout += bytes; if (stdout.includes('FORMAT116_LOCKED')) resolveLocked(); });
  child.stderr.on('data', bytes => { stderr += bytes; });
  const complete = new Promise((resolve, reject) => {
    child.on('error', error => { reject(error); rejectLocked(error); });
    child.on('close', code => {
      if (code) { const error = Error(stderr); reject(error); rejectLocked(error); }
      else { if (!stdout.includes('FORMAT116_LOCKED')) rejectLocked(Error('Writer did not reach its save')); resolve(stdout); }
    });
  });
  // Ordinary row-lock serialization. No timing/claim/Storage policy is changed.
  child.stdin.end(`begin;set local statement_timeout='8s';${auth(ids.admin)}${statement}select 'FORMAT116_LOCKED';select pg_sleep(0.4);commit;`);
  return { locked, complete };
}

console.log(sql(readFileSync(new URL('../supabase/verify_116_official_content_text_formats.sql', import.meta.url), 'utf8')));
console.log(sql(readFileSync(new URL('./official-content-format-security.sql', import.meta.url), 'utf8')));
assert.deepEqual(snapshot(), before);
record('installed verifier and rollback-only database matrix leave all application fixtures unchanged');

const created = [];
try {
  for (const competing of ['legacy Article full writer', 'Article metadata writer', 'format-aware Creator writer']) {
    const initial = JSON.parse(asStaff(save(base))); created.push(initial.id);
    const payload = { ...base, p_question_id: initial.id, p_prompt: 'ZZ FORMAT116 **converted while another writer waits**', p_prompt_format: 'visual_markdown_v1' };
    const writer = startWriter(save(payload, initial.current_version_id, initial.updated_at));
    await writer.locked;
    let statement;
    if (competing === 'legacy Article full writer') statement = `select save_question_with_version(${quote(initial.id)},${quote(ids.concept)},'short_answer','stale Article text',null,'published',null,0,'medium','General Understanding','[{"answer_text":"stale Answer"}]'::jsonb,null,null::uuid[],array[]::uuid[]);`;
    else if (competing === 'Article metadata writer') statement = `select save_article_question_metadata(${quote(ids.library)},${quote(ids.article)},${quote(initial.id)},${quote(initial.current_version_id)},${quote(initial.updated_at)},'{"status":"archived"}');`;
    else statement = save({ ...base, p_question_id: initial.id }, initial.current_version_id, initial.updated_at);
    let rejected = '';
    try { asStaff(statement, ids.editor); } catch (error) { rejected = error.stderr?.toString() || error.message; }
    await writer.complete;
    assert.match(rejected, competing === 'legacy Article full writer' ? /Creator Studio/ : /reload before saving/);
    const after = JSON.parse(sql(`select to_jsonb(q) from questions q where id=${quote(initial.id)}`));
    assert.equal(after.prompt, payload.p_prompt); assert.equal(after.prompt_format, 'visual_markdown_v1'); assert.equal(after.status, 'published');
    assert.equal(sql(`select count(*) from question_versions where question_id=${quote(initial.id)}`), '2');
    assert.equal(sql(`select answer_text from question_accepted_answers where question_id=${quote(initial.id)}`), base.p_accepted_answers[0].answer_text);
    record(`concurrent conversion rejects stale ${competing} after the row lock; current and immutable versions remain coherent`);
  }
  // updated_at is separately required: released Archive need not append a version.
  const q = JSON.parse(sql(`select to_jsonb(q) from questions q where id=${quote(created[0])}`));
  asStaff(`select archive_question(${quote(q.id)});`);
  const archive = JSON.parse(sql(`select to_jsonb(q) from questions q where id=${quote(q.id)}`));
  assert.equal(archive.current_version_id, q.current_version_id);
  assert.notEqual(archive.updated_at, q.updated_at);
  assert.throws(() => asStaff(`select save_article_question_metadata(${quote(ids.library)},${quote(ids.article)},${quote(q.id)},${quote(q.current_version_id)},${quote(q.updated_at)},'{"status":"published"}');`), /reload before saving/);
  assert.equal(sql(`select status from questions where id=${quote(q.id)}`), 'archived');
  record('status-only legacy change is detected by expected updated_at even when the immutable version is unchanged');
} finally {
  for (const id of created) asStaff(`select delete_development_content('question',${quote(id)});`);
}
assert.deepEqual(snapshot(), before, 'Exact application-data fixture closure');
assert.equal(sql('select count(*) from storage.objects'), '0');
record('all concurrent-save fixtures permanently removed; original synthetic data unchanged; zero Storage objects');
if (process.env.FORMAT_DISPOSABLE_REPORT) writeFileSync(process.env.FORMAT_DISPOSABLE_REPORT, JSON.stringify({ environment: container, database: 'format116', checks, dataRestored: true, storageObjects: 0 }, null, 2));
