// Disposable Auth + Data API proof. Never accepts a hosted URL or real accounts.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {requireAdvisor,studyAdvice} from '../lib/study-advisor.ts';
import {requireStudyGoals} from '../lib/study-goals.ts';
const base=process.env.ADVISOR_TEST_URL,key=process.env.ADVISOR_TEST_ANON_KEY;
if(!base||!['127.0.0.1','localhost'].includes(new URL(base).hostname)||!key||!process.env.ADVISOR_TEST_ACCOUNTS)throw Error('Explicit disposable loopback configuration required.');
const accounts=JSON.parse(readFileSync(process.env.ADVISOR_TEST_ACCOUNTS,'utf8'));
if(!Object.values(accounts).every(a=>a.email.endsWith('@example.invalid')&&a.id.startsWith('12300000-')))throw Error('Synthetic Goal/Advisor accounts required.');
const id=n=>`12300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sessions=[];let checks=0;
const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log(`PASS: ${label}`);};
async function request(path,token,body){const r=await fetch(base+path,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token??key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)};}
const rpc=(name,token,body)=>request('/rest/v1/rpc/'+name,token,body);
try {
 for(const role of ['learner','other','admin','editor']){
  const auth=await request('/auth/v1/token?grant_type=password',null,{email:accounts[role].email,password:accounts[role].password});assert.ok(auth.ok,`Disposable ${role} login`);const token=auth.data.access_token;sessions.push(token);
  const res=await rpc('get_study_advisor',token,{p_library_id:id(10)});ok(res.ok,`${role} retains authorized Advisor read`);
  const e=requireAdvisor(res.data,id(10),accounts[role].id);ok(e.actor_id===accounts[role].id,`${role} current actor verified`);
  if(role==='learner'){
   const g=await rpc('get_study_goals',token,{p_library_id:id(10)});assert.ok(g.ok);const goals=requireStudyGoals(g.data,id(10));
   const advice=studyAdvice(e,goals);ok(advice.some(a=>a.kind==='retention'),'real SQL evidence drives conservative retention advice');ok(advice.some(a=>a.kind==='coverage'),'owner-qualified personal Topic evidence drives coverage advice');ok(advice.some(a=>a.kind==='deadline'),'existing Goal projections drive deadline advice');ok(advice.filter(a=>a.kind==='retention').length===1,'overlapping shared material does not repeat retention suggestions');
   const fresh=await rpc('get_study_advisor',token,{p_library_id:id(10)});ok(JSON.stringify(fresh.data.topics)===JSON.stringify(e.topics),'fresh read preserves evidence and canonical counts');
   ok(!e.topics.some(t=>t.key.endsWith(id(42))||t.key.endsWith(id(43))),'owner and cross-Library personal evidence excluded');
   const extra=await rpc('get_study_advisor',token,{p_library_id:id(10),p_user_id:accounts.other.id});ok(!extra.ok,'client cannot supply another actor');
  }else ok(e.topics.every(t=>t.responses===0),'no other learner history exposed to '+role);
  if(role==='other')ok(!(await rpc('get_study_advisor',token,{p_library_id:id(11)})).ok,'unassigned Library read rejected');
 }
 ok(!(await rpc('get_study_advisor',null,{p_library_id:id(10)})).ok,'anonymous API read rejected');
 console.log(`${checks} disposable authenticated Advisor checks passed.`);
}finally{
 for(const token of sessions){const r=await request('/auth/v1/logout?scope=local',token,{});assert.ok(r.ok||[401,403].includes(r.status),'Disposable session cleanup failed');}
 console.log('Only disposable API sessions were created and logged out; no application writes.');
}
