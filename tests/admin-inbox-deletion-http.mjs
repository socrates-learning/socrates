// Run only against the named disposable PostgreSQL/PostgREST fixture.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const url = process.env.INBOX_DELETION_TEST_URL;
const secret = process.env.INBOX_DELETION_TEST_JWT_SECRET;
const database = 'admin_inbox128_deletion131_20261016';
assert.equal(url, 'http://127.0.0.1:58531');
assert.ok(secret);
function sql(query) {
  return execFileSync('docker', ['exec', '-i', 'socrates-creator-navy-uat-db', 'psql', '-U', 'postgres', '-d', database, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8' }).trim();
}
assert.equal(sql('select current_database();'), database);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(role, sub) {
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, ...(sub ? { sub } : {}), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
async function request(token, path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${url}/${path}`, { method, headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log(`PASS: ${label}`); }
const actors = Object.fromEntries(['admin', 'secondAdmin', 'editor', 'learner'].map(role => [role, randomUUID()]));
for (const [role, id] of Object.entries(actors)) {
  sql(`insert into auth.users(id,email) values('${id}','deletion-${id}@example.invalid');
    insert into public.user_roles(user_id,role) values('${id}','${role === 'secondAdmin' ? 'admin' : role}');
    insert into public.user_libraries(user_id,library_id) values('${id}','12200000-0000-4000-8000-000000000010');`);
}
const admin = jwt('authenticated', actors.admin), secondAdmin = jwt('authenticated', actors.secondAdmin);
const service = jwt('service_role');
const historyQuery = `select md5(coalesce(string_agg(data::text,'' order by data::text),'')) from (
 select to_jsonb(t) data from public.review_attempts t union all select to_jsonb(t) from public.study_sessions t
 union all select to_jsonb(t) from public.user_concept_mastery t union all select to_jsonb(t) from public.questions t
) history;`;
const originalHistory = sql(historyQuery);
const originalMessages = JSON.parse(sql('select coalesce(jsonb_agg(to_jsonb(m) order by id),\'[]\') from public.admin_inbox_messages m;'));
const read = id => request(admin, `admin_inbox_messages?id=eq.${id}`);
const remove = (row, token = admin) => request(token, 'rpc/delete_admin_inbox_message', { p_id: row.id, p_expected_revision: row.revision });
const create = () => {
  const id = sql("select admin_inbox_internal.create_message('Synthetic deletion test','Synthetic body','Other','study_mode');");
  return read(id).then(result => result.data[0]);
};

const target = await create();
for (const [label, token] of [['Learner', jwt('authenticated', actors.learner)], ['Editor', jwt('authenticated', actors.editor)], ['Anonymous', jwt('anon')], ['service JWT', service]]) {
  const denied = await remove(target, token);
  ok([401, 403].includes(denied.status), `${label} cannot execute deletion`);
}
ok((await request(admin, `admin_inbox_messages?id=eq.${target.id}`, undefined, 'DELETE')).status === 403, 'Admin browser has no direct DELETE permission');
ok((await read(target.id)).data.length === 1, 'denied callers leave the message intact');
ok((await request(admin, 'rpc/delete_admin_inbox_message', { p_id: target.id, p_expected_revision: target.revision, p_actor: actors.admin })).status >= 400, 'forged actor argument is not accepted');
ok((await request(admin, 'rpc/delete_admin_inbox_message', { p_id: 'invalid', p_expected_revision: target.revision })).status === 400, 'invalid identity rejected');

const concurrentDeletes = await Promise.all([remove(target), remove(target, secondAdmin), remove(target)]);
ok(concurrentDeletes.every(result => result.status === 200 && result.data.id === target.id && result.data.deleted === true), 'concurrent Admin deletes converge to one safe result');
ok((await read(target.id)).data.length === 0, 'fresh read confirms deletion');
ok(Object.keys(concurrentDeletes[0].data).sort().join() === 'deleted,id', 'deletion receipt discloses no message content');
ok((await remove(target)).status === 200, 'lost deletion acknowledgement can be retried');

for (let index = 0; index < 6; index++) {
  const row = await create();
  const [saved, deleted] = await Promise.all([
    request(secondAdmin, 'rpc/save_admin_inbox_message', { p_id: row.id, p_status: 'In Review', p_admin_notes: 'Concurrent Admin edit', p_expected_revision: row.revision }),
    remove(row),
  ]);
  const remaining = await read(row.id);
  if (saved.status === 200) {
    ok(deleted.status >= 400 && deleted.data.code === '40001' && remaining.data[0]?.admin_notes === 'Concurrent Admin edit', 'concurrent save wins: stale deletion preserves the latest notes');
  } else {
    ok(deleted.status === 200 && saved.status >= 400 && saved.data.code === '40001' && remaining.data.length === 0, 'concurrent deletion wins: stale save cannot recreate the row');
  }
}

const submission = { p_actor: actors.learner, p_request_id: randomUUID(), p_library_id: '12200000-0000-4000-8000-000000000010', p_question_id: null, p_category: 'Other', p_content: 'Synthetic deletion retry verification' };
const submit = body => request(service, 'rpc/submit_study_suggestion_internal', body);
const accepted = await submit(submission);
assert.equal(accepted.status, 200);
const study = (await read(accepted.data.id)).data[0];
// Inject a transaction failure after receipt creation but before the DELETE completes.
sql(`create function admin_inbox_internal.deletion_test_abort() returns trigger language plpgsql as $$ begin
 if old.id='${study.id}'::uuid then raise exception 'Synthetic interrupted delete' using errcode='40001'; end if;
 return old; end $$;
 create trigger deletion_test_abort before delete on public.admin_inbox_messages for each row execute function admin_inbox_internal.deletion_test_abort();`);
try {
  const interrupted = await remove(study);
  ok(interrupted.status >= 400 && interrupted.data.code === '40001', 'interrupted transaction fails visibly');
  ok((await read(study.id)).data.length === 1, 'failed deletion preserves the message');
  ok(sql(`select count(*) from admin_inbox_internal.deleted_study_receipts where message_id='${study.id}'`) === '0', 'failed transaction rolls back the receipt as well');
} finally {
  sql('drop trigger deletion_test_abort on public.admin_inbox_messages; drop function admin_inbox_internal.deletion_test_abort();');
}
const retryRace = await Promise.all([remove(study), ...Array.from({ length: 8 }, () => submit(submission))]);
ok(retryRace.every(result => result.status === 200), 'concurrent submission retries and deletion complete safely');
ok(retryRace.slice(1).every(result => result.data.id === study.id), 'all concurrent submission retries retain the original identity');
ok((await read(study.id)).data.length === 0, 'submission retry cannot resurrect a deleted message');
ok((await submit(submission)).data.id === study.id, 'fresh submission retry recognizes the content-free receipt');
ok((await submit({ ...submission, p_content: 'Different message' })).status === 409, 'changed content cannot reuse a deleted request');
const burst = await Promise.all(Array.from({ length: 6 }, (_, index) => submit({ ...submission, p_request_id: randomUUID(), p_content: `Synthetic rate check ${index}` })));
ok(burst.filter(result => result.status === 200).length === 4 && burst.filter(result => result.data.code === 'P0429').length === 2, 'deleted submission still counts against the original rate limit');

const fresh = await request(secondAdmin, 'rpc/get_admin_inbox_messages', {});
ok(fresh.status === 200 && !fresh.data.some(message => message.id === study.id), 'fresh Admin session sees persistent deletion');
const finalMessages = new Map(JSON.parse(sql('select coalesce(jsonb_agg(to_jsonb(m)),\'[]\') from public.admin_inbox_messages m;')).map(message => [message.id, message]));
for (const message of originalMessages) assert.deepEqual(finalMessages.get(message.id), message);
ok(true, 'all preexisting messages and administrator notes remain unchanged');
ok(sql(historyQuery) === originalHistory, 'all learning history and educational content remain unchanged');
console.log(`${checks} isolated deletion HTTP checks passed.`);
