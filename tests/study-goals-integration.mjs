// Run only with an explicitly supplied disposable account file and loopback API.
// Account records are {learner, other, admin, editor}: {email,password,id}.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.GOALS_TEST_URL, key=process.env.GOALS_TEST_ANON_KEY;
if (!base || !['127.0.0.1','localhost'].includes(new URL(base).hostname) || !key || !process.env.GOALS_TEST_ACCOUNTS) throw Error('Explicit disposable loopback configuration is required.');
const accounts=JSON.parse(readFileSync(process.env.GOALS_TEST_ACCOUNTS,'utf8'));
if (!Object.values(accounts).every(a=>a.email.endsWith('@example.invalid') && a.id.startsWith('12300000-'))) throw Error('Goal-specific synthetic accounts required.');
const id=n=>`12300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sessions=[], created=[];let checks=0;
const verify=(condition,label)=>{assert.ok(condition,label);checks++;console.log(`PASS: ${label}`);};
async function request(path,token,body,method='POST') {
 const res=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${token??key}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{data=null;}return {ok:res.ok,status:res.status,data};
}
async function login(role) {const r=await request('/auth/v1/token?grant_type=password',null,{email:accounts[role].email,password:accounts[role].password});assert.ok(r.ok,`Disposable ${role} authentication failed`);sessions.push(r.data.access_token);return r.data.access_token;}
const rpc=(name,token,args)=>request(`/rest/v1/rpc/${name}`,token,args);
const read=token=>rpc('get_study_goals',token,{p_library_id:id(10)});
const payload=(name,patch={})=>({p_library_id:id(10),p_name:name,p_deadline:'2026-12-31',p_objective:'coverage',p_official_topic_ids:[id(20),id(22)],p_personal_topic_ids:[id(40)],p_goal_id:null,p_expected_revision:null,...patch});
try {
 const owner=await login('learner'),other=await login('other');
 const saved=await rpc('save_study_goal',owner,payload('Disposable persistence goal'));verify(saved.ok,'learner can save own goal through authenticated API');created.push({token:owner,id:saved.data});
 const fresh=await login('learner');let result=await read(fresh);let goal=result.data.goals.find(g=>g.id===saved.data);
 verify(goal?.name==='Disposable persistence goal'&&goal.revision===1,'fresh authenticated client reloads authoritative saved goal');
 verify(goal.progress.total_items===7&&goal.progress.covered_items===6,'available material and unique coverage include both personal Card types');
 verify(goal.progress.mastered_concepts===2&&goal.progress.total_concepts===3,'existing official mastery threshold and separate denominator retained');
 const race=await Promise.all(['Tab one','Tab two'].map(name=>rpc('save_study_goal',owner,payload(name,{p_goal_id:goal.id,p_expected_revision:1}))));
 verify(race.filter(r=>r.ok).length===1&&race.filter(r=>r.data?.code==='40001').length===1,'concurrent same-revision edits have one winner and one explicit conflict');
 result=await read(fresh);goal=result.data.goals.find(g=>g.id===saved.data);verify(goal.revision===2&&['Tab one','Tab two'].includes(goal.name),'fresh reload sees complete winning update');
 verify(!(await read(other)).data.goals.some(g=>g.id===goal.id),'another learner cannot read goal through RPC');
 const direct=await request(`/rest/v1/study_goals?id=eq.${goal.id}`,other,undefined,'GET');verify(direct.ok&&direct.data.length===0,'RLS also prevents direct-table cross-account read');
 verify(!(await rpc('delete_study_goal',other,{p_library_id:id(10),p_goal_id:goal.id,p_expected_revision:2})).ok,'cross-account deletion rejected');
 verify(!(await rpc('get_study_goals',other,{p_library_id:id(11)})).ok,'unassigned Library access rejected');
 verify(!(await request('/rest/v1/study_goals',owner,{user_id:accounts.learner.id,library_id:id(10),name:'Bypass',deadline:'2026-12-31',objective:'coverage',official_topic_ids:[id(20)]})).ok,'direct table write bypass rejected');
 verify(!(await rpc('get_study_goals',null,{p_library_id:id(10)})).ok,'anonymous goal access rejected');
 for(const role of ['admin','editor']) {
  const token=await login(role);verify(!(await read(token)).data.goals.some(g=>g.id===goal.id),`${role} does not receive another learner personal goals`);
  const own=await rpc('save_study_goal',token,payload(`${role} own goal`,{p_personal_topic_ids:[]}));verify(own.ok,`${role} retains ordinary own-goal access`);created.push({token,id:own.data});
 }
 console.log(`${checks} disposable API/concurrency checks passed.`);
} finally {
 for(const item of created) {const r=await read(item.token);const g=r.data?.goals.find(x=>x.id===item.id);if(g){const d=await rpc('delete_study_goal',item.token,{p_library_id:id(10),p_goal_id:g.id,p_expected_revision:g.revision});assert.ok(d.ok,'Disposable goal cleanup failed');}}
 for(const token of sessions) {const r=await request('/auth/v1/logout?scope=local',token,{});assert.ok(r.ok||r.status===401||r.status===403,'Disposable API session logout failed');}
 console.log('Only created disposable goals and test sessions cleaned up.');
}
