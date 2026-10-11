// Real Auth/RLS proof on a loopback-only cloned database with synthetic users.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {loadFlaggedReview,loadFlaggedConcept,personalCardEditorHref,reviewAnswers} from '../lib/stats-flagged-review.ts';
const url=process.env.FLAGGED_TEST_URL,key=process.env.FLAGGED_TEST_ANON_KEY;
if(!url||new URL(url).hostname!=='127.0.0.1'||!key||!process.env.FLAGGED_TEST_ACCOUNTS)throw Error('Explicit disposable loopback configuration required');
const accounts=JSON.parse(readFileSync(process.env.FLAGGED_TEST_ACCOUNTS,'utf8'));
assert.ok(Object.values(accounts).every(a=>a.email.endsWith('@example.invalid')&&a.id.startsWith('12300000-')));
const id=n=>`12300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let count=0;const check=(value,label)=>{assert.ok(value,label);count++;console.log('PASS: '+label);};
const sessions=[];
try {
 for(const role of ['learner','admin','editor','other']){
  const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const login=await c.auth.signInWithPassword({email:accounts[role].email,password:accounts[role].password});assert.ok(!login.error,'Synthetic login');sessions.push(c);
  const uid=accounts[role].id,signal=new AbortController().signal;
  const items=await loadFlaggedReview(c,uid,id(10),signal);
  check(items.length>0&&items.every(i=>i.flag.user_id===uid),role+' sees only own flags');
  check(items.some(i=>i.card&&personalCardEditorHref(i,uid,id(10))),role+' own Card has existing-editor link');
  if(role!=='other'){
   const official=items.find(i=>i.question);check(official?.question.prompt&&reviewAnswers(official)[0]?.answer_text,role+' complete official Front and Answer');
   check(!personalCardEditorHref(official,uid,id(10)),role+' review does not expose official editing');
   const concept=await loadFlaggedConcept(c,official,uid,id(10),signal);check(concept?.conceptId===official.question.concept_id,role+' published full Concept review');
  }
  const foreign=await c.from('study_candidate_flags').select('id').eq('user_id',role==='learner'?accounts.other.id:accounts.learner.id);
  check(!foreign.error&&foreign.data.length===0,role+' cannot read another user flags');
  const cards=await c.from('personal_cards').select('id').eq('id',role==='other'?id(81):id(932));check(!cards.error&&cards.data.length===0,role+' cannot read another owner Card');
  if(role==='learner'){
   const personal=items.find(i=>i.card?.concept_id);check((await loadFlaggedConcept(c,personal,uid,id(10),signal))?.conceptId===id(70),'full owner Concept and source preserved');
   const wrongLibrary=await loadFlaggedReview(c,uid,id(11),signal);check(!wrongLibrary.some(i=>i.question),'official Questions excluded from wrong Library');
   const write=await c.from('questions').update({prompt:'UNAUTHORIZED'}).eq('id',id(60)).select('id');check(Boolean(write.error)||write.data.length===0,'learner direct official write denied');
   const otherFlag=await c.from('study_candidate_flags').delete().eq('id',id(948)).select('id');check(!otherFlag.error&&otherFlag.data.length===0,'another owner Unflag denied');
   const add=await c.from('study_candidate_flags').insert({user_id:uid,question_id:id(62),note:'Disposable removal proof'}).select('id').single();assert.ok(!add.error);
   try{const removed=await c.from('study_candidate_flags').delete().eq('id',add.data.id).eq('user_id',uid).select('id');check(!removed.error&&removed.data.length===1,'own Unflag succeeds');const fresh=await c.from('study_candidate_flags').select('id').eq('id',add.data.id);check(!fresh.error&&fresh.data.length===0,'Unflag persists on fresh read');}
   finally{await c.from('study_candidate_flags').delete().eq('id',add.data.id).eq('user_id',uid);}
   const refreshed=await c.auth.refreshSession();assert.ok(!refreshed.error);check((await loadFlaggedReview(c,uid,id(10),signal)).length===items.length,'session refresh preserves review and untouched flags');
  }
 }
 const anon=createClient(url,key,{auth:{persistSession:false}});const result=await anon.from('study_candidate_flags').select('id');check(Boolean(result.error)||result.data.length===0,'anonymous flags denied');
 console.log(`${count} authenticated Flagged Review checks passed.`);
}finally{
 for(const c of sessions){const r=await c.auth.signOut({scope:'local'});assert.ok(!r.error,'Disposable session cleanup');}
 console.log('Disposable API sessions logged out. No study attempts, mastery, content or preference writes.');
}
