import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mutateTopicSubtreePreference } from '../lib/home-deck-settings.ts';

const key = 'official:topic:11700000-0000-4000-8000-000000000020';
const child = 'personal:topic:11700000-0000-4000-8000-000000000040';
const state = (revision = 'a'.repeat(32), value = 60) => ({ version: 117, deck_id: 'deck', library_id: 'library', revision, values: { [key]: value, [child]: value } });
const settings = s => ({ unified_deck_settings: { version: 109, topic_states: [], included_topic_ids: [], excluded_topic_ids: [], selected_collection_ids: [], topic_preference_state: s }, personal_topic_preferences: {}, personal_collection_preferences: {} });
const old = settings(state());
const saved = state('b'.repeat(32));
const next = settings(saved);
const run = rpc => mutateTopicSubtreePreference(rpc, 'deck', 'library', old, key, 60);

test('same-value parent recommit makes one source-qualified subtree write then authoritative readback', async () => {
  const calls = [];
  const result = await run(async (name, args) => {
    calls.push([name, args]);
    return { data: calls.length === 1 ? saved : next, error: null };
  });
  assert.equal(result, next);
  assert.deepEqual(calls, [
    ['set_study_deck_topic_subtree_preference', { p_deck_id: 'deck', p_library_id: 'library', p_group_key: key, p_balance: 60, p_expected_revision: 'a'.repeat(32) }],
    ['get_home_study_bootstrap', { p_library_id: 'library', p_deck_id: 'deck' }],
  ]);
  assert.equal(old.unified_deck_settings.topic_preference_state.revision, 'a'.repeat(32));
});

test('personal subtree retains its qualified key and the same atomic contract', async () => {
  const calls = [];
  await mutateTopicSubtreePreference(async (name, args) => { calls.push([name,args]); return {data:calls.length===1?saved:next,error:null}; },'deck','library',old,child,60);
  assert.equal(calls[0][1].p_group_key, child);
  assert.equal(calls.length, 2);
});

for (const [label, before] of [
  ['missing revision', { ...state(), revision: '' }],
  ['other deck', { ...state(), deck_id: 'other' }],
  ['other Library', { ...state(), library_id: 'other' }],
  ['invalid values', { ...state(), values: { [key]: 101 } }],
  ['unqualified key', { ...state(), values: { bad: 60 } }],
  ['unsupported version', { ...state(), version: 109 }],
]) test(`invalid ${label} cannot initiate a write`, async () => {
  let calls = 0;
  await assert.rejects(mutateTopicSubtreePreference(async () => { calls++; assert.fail(); },'deck','library',settings(before),key,60), /could not be confirmed/);
  assert.equal(calls, 0);
});

for (const [label, response, error, expected] of [
  ['conflict', null, { message: 'Deck settings or Topics changed' }, /changed/],
  ['wrong context', { ...saved, library_id: 'other' }, null, /could not be confirmed/],
  ['wrong value', { ...saved, values: { [key]: 20 } }, null, /no confirmed subtree/],
  ['unchanged revision', state(), null, /no confirmed subtree/],
  ['empty response', null, null, /could not be confirmed/],
]) test(`write ${label} fails visibly without replay or readback`, async () => {
  let calls = 0;
  await assert.rejects(run(async () => { calls++;return {data:response,error}; }), expected);
  assert.equal(calls, 1);
});

test('transport uncertainty never retries the reset', async () => {
  let calls = 0;
  await assert.rejects(run(async () => {calls++;throw new Error('lost response');}), /lost response/);
  assert.equal(calls,1);
});

for (const [label, result, expected] of [
  ['failed', {data:null,error:{message:'offline'}}, /may have saved.*Reload/],
  ['missing', {data:{},error:null}, /could not be confirmed/],
  ['concurrent change', {data:settings(state('c'.repeat(32))),error:null}, /changed during readback/],
  ['other Library', {data:settings({...saved,library_id:'other'}),error:null}, /could not be confirmed/],
]) test(`readback ${label} cannot report confirmed success or replay`, async () => {
  let calls=0;
  await assert.rejects(run(async()=>++calls===1?{data:saved,error:null}:result),expected);
  assert.equal(calls,2);
});

const planner=readFileSync(new URL('../components/StudyPlanner.tsx',import.meta.url),'utf8');
function handlerFixture() {
  const a=planner.indexOf('  async function persistNodePreference('),b=planner.indexOf('  function beginPreferenceGesture(',a);
  let finish;const request=new Promise(resolve=>{finish=resolve;});const events=[];
  const c={exports:{},Error,activeLibrary:{id:'library'},deck:{id:'deck'},userId:'owner',homeSettings:old,
    isSaving:false,isSetupCramMode:false,settingsError:'',settingsRequest:{current:false},settingsContext:{current:'deck:library:owner'},
    setIsSaving:v=>events.push(['busy',v]),setMessage:v=>events.push(['message',v]),setGroupDrafts:v=>events.push(['draft',v]),
    router:{refresh:()=>events.push(['refresh'])},setHomeSettings:v=>events.push(['state',v]),setSettingsError:v=>events.push(['error',v]),supabase:{rpc:()=>assert.fail()},
    mutateTopicSubtreePreference:()=>{events.push(['write']);return request;}};
  vm.runInNewContext(ts.transpileModule(`export ${planner.slice(a,b)}`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);
  return {c,events,finish};
}
test('in-flight subtree request prevents duplicate commit writes',async()=>{
  const f=handlerFixture();const first=f.c.exports.persistNodePreference({key},60);
  await f.c.exports.persistNodePreference({key},60);
  assert.equal(f.events.filter(e=>e[0]==='write').length,1);
  f.finish(next);await first;
  assert.equal(f.events.filter(e=>e[0]==='state').length,1);
  assert.equal(f.c.settingsRequest.current,false);
});
test('late response for a previous Library cannot overwrite current Home or report success',async()=>{
  const f=handlerFixture();const first=f.c.exports.persistNodePreference({key},60);
  f.c.settingsContext.current='other-deck:other-library:owner';f.finish(next);await first;
  assert.equal(f.events.filter(e=>e[0]==='state'||e[0]==='draft'||e[0]==='error').length,0);
  assert.equal(f.events.some(e=>e[0]==='message'&&e[1]==='Study preference saved.'),false);
});

test('additive SQL preserves installed migrations and only adapts preference projection/lookup',()=>{
  const sql=readFileSync(new URL('../supabase/117_atomic_topic_subtree_preferences.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/create table public\.|alter table public\.(study_sessions|questions|concepts)|update public\.study_sessions|create or replace function public\.(start_study|resolve_study)/i);
  assert.match(sql,/pg_advisory_xact_lock_shared\(104,20260927\)/);
  assert.match(sql,/for update/);
  assert.match(sql,/is distinct from p_expected_revision/);
  assert.match(sql,/revoke insert,update,delete on public.study_deck_node_preferences from authenticated/);
  assert.match(sql,/revoke execute on function public.set_study_deck_personal_topic_preference/);
  const adapted=[...sql.matchAll(/117 unexpected baseline ([^']+)/g)].map(x=>x[1]);
  assert.deepEqual(adapted,['m109_settings_snapshot(uuid)','select_next_study_question_hardened(uuid,boolean)','m109_card_balance(uuid,jsonb)','m111_card_balance(uuid,jsonb,jsonb)']);
  assert.match(sql,/select distinct \(entry.value->>'origin'\)::uuid/);
  assert.match(sql,/case when g.reset_source is null then g.group_key/);
  assert.doesNotMatch(sql,/new_weight\s*=|review_weight\s*=|personal_priority\s*\*/);
});
