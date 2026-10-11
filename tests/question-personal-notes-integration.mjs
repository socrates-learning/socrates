// Deliberate authentication and concurrency checks; loopback synthetic data only.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {loadQuestionPersonalNote as read,saveQuestionPersonalNote as save,deleteQuestionPersonalNote as remove} from '../lib/question-personal-notes.ts';
const url=process.env.NOTES_TEST_URL,key=process.env.NOTES_TEST_ANON_KEY;
if(!url||new URL(url).hostname!=='127.0.0.1'||!key||!process.env.NOTES_TEST_ACCOUNTS)throw Error('Explicit disposable loopback configuration required');
const accounts=JSON.parse(readFileSync(process.env.NOTES_TEST_ACCOUNTS,'utf8'));
assert.ok(Object.values(accounts).every(a=>a.email.endsWith('@example.invalid')&&a.id.startsWith('12300000-')));
const id=n=>`12300000-0000-4000-8000-${String(n).padStart(12,'0')}`,signal=()=>new AbortController().signal;
const clients=[];let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS: '+label);};
async function login(role){const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});assert.ok(!(await c.auth.signInWithPassword({email:accounts[role].email,password:accounts[role].password})).error,'Synthetic login');clients.push(c);return c;}
const created=[];
try {
 const learner=await login('learner');check(await read(learner,id(10),id(60),signal())===null,'fresh official Question has no note');
 let n=await save(learner,id(10),id(60),'Remember A → B\n🧠 mnemonic',null);created.push([learner,id(60)]);
 check(n.note.includes('🧠'),'learner creates plain Unicode note');
 const fresh=await login('learner');check((await read(fresh,id(10),id(60),signal())).note===n.note,'fresh independent session retrieves same note');
 n=await save(fresh,id(10),id(60),'Updated mnemonic',n.revision);check((await read(learner,id(10),id(60),signal())).note==='Updated mnemonic','edit visible to another own session');
 check(await read(learner,id(10),id(61),signal())===null,'different Question never receives the note');
 const race=await Promise.allSettled([save(learner,id(10),id(60),'Window A',n.revision),save(fresh,id(10),id(60),'Window B',n.revision)]);
 check(race.filter(r=>r.status==='fulfilled').length===1&&race.filter(r=>r.status==='rejected'&&r.reason.code==='40001').length===1,'concurrent stale editors cannot overwrite each other');
 n=await read(learner,id(10),id(60),signal());
 for(const role of ['other','admin','editor']){
  const c=await login(role);
  check(await read(c,id(10),id(60),signal())===null,role+' RPC cannot see learner note');
  const direct=await c.from('personal_question_notes').select('*').eq('user_id',accounts.learner.id);check(!direct.error&&direct.data.length===0,role+' RLS cannot see learner note');
  const attack=await c.rpc('delete_my_question_note',{p_library_id:id(10),p_question_id:id(60),p_expected_revision:n.revision});check(attack.error?.code==='40001',role+' cannot remove learner note using its revision');
  const own=await save(c,id(10),id(60),role+' own mnemonic',null);created.push([c,id(60)]);check(own.note===role+' own mnemonic',role+' maintains an independent personal note');
  check((await read(learner,id(10),id(60),signal())).revision===n.revision,'learner record preserved after '+role+' operation');
 }
 for(const q of [id(64),id(81),'12500000-0000-4000-8000-000000000099']){await assert.rejects(read(learner,id(10),q,signal()),e=>e.code==='42501');check(true,'draft, personal or missing official identity rejected');}
 await assert.rejects(read(learner,id(11),id(60),signal()),e=>e.code==='42501');check(true,'wrong Library rejected');
 const spoof=await learner.rpc('get_my_question_note',{p_library_id:id(10),p_question_id:id(60),p_user_id:accounts.other.id});check(Boolean(spoof.error),'actor spoofing has no RPC signature');
 for(const action of ['insert','update','delete']){
  let query=learner.from('personal_question_notes');query=action==='insert'?query.insert({user_id:accounts.other.id,question_id:id(60),note:'bypass'}):action==='update'?query.update({note:'bypass'}).eq('question_id',id(60)):query.delete().eq('question_id',id(60));
  check(Boolean((await query).error),'direct '+action+' cannot bypass revision/ownership validation');
 }
 check(Boolean((await learner.rpc('m125_require_question',{p_library_id:id(10),p_question_id:id(60)})).error),'private authority helper not exposed');
 check(!(await learner.auth.refreshSession()).error,'session refresh works');check((await read(learner,id(10),id(60),signal())).revision===n.revision,'refresh retains saved note identity');
 await remove(learner,id(10),id(60),n.revision);check(await read(fresh,id(10),id(60),signal())===null,'deletion persists across sessions');
 const recreated=await save(learner,id(10),id(60),'Recreated after removal',null);check(recreated.revision!==n.revision,'new incarnation has a unique revision');
 await assert.rejects(save(fresh,id(10),id(60),'Old browser',n.revision),e=>e.code==='40001');check(true,'old pre-deletion draft cannot overwrite recreated note');
 await assert.rejects(remove(fresh,id(10),id(60),n.revision),e=>e.code==='40001');check(true,'old pre-deletion browser cannot delete recreated note');
 const anon=createClient(url,key,{auth:{persistSession:false}});check(Boolean((await anon.rpc('get_my_question_note',{p_library_id:id(10),p_question_id:id(60)})).error),'anonymous RPC denied');check(Boolean((await anon.from('personal_question_notes').select('*')).error),'anonymous table denied');
 console.log(`${checks} authenticated personal-note checks passed.`);
}finally{
 for(const [c,q] of created){const current=await read(c,id(10),q,signal());if(current)await remove(c,id(10),q,current.revision);}
 for(const c of clients)assert.ok(!(await c.auth.signOut({scope:'local'})).error,'Disposable session logout');
 console.log('Created notes removed and disposable API sessions logged out. No learning-history writes.');
}
