import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {adaptStudyCandidateRow,selectNextStudyCandidate,startStudySessionWithCandidate} from '../lib/study-candidates.ts';
const row={candidate_type:'official',candidate_id:'q',official_question_id:'q',official_concept_id:'c',personal_card_id:null,personal_concept_id:null,personal_topic_id:null,prompt:'P',answer:'A',explanation:null,difficulty:'medium',testing_angle:'General Understanding',candidate_position:0,created_at:'date'};
test('one selector/start request preserves candidate fields, session, null and errors; only optional official metadata is additive',async()=>{
 const calls=[];const hint={questionId:'q',versionId:'v',libraryId:'lib',front:true,answer:false};
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='select_next_study_candidate_with_media'?{...row,question_media_hint:hint}:{session_id:'session',candidate:{...row,question_media_hint:hint}},error:null};}};
 const next=await selectNextStudyCandidate(client,'session');assert.deepEqual(next,{...adaptStudyCandidateRow(row),mediaHint:hint});assert.equal(calls.length,1);assert.deepEqual(calls[0],{name:'select_next_study_candidate_with_media',args:{p_study_session_id:'session',p_include_debug:false}});
 const started=await startStudySessionWithCandidate(client,'deck',50,'session');assert.deepEqual(started,{sessionId:'session',candidate:next});assert.equal(calls.length,2);assert.equal(calls[1].name,'start_study_session_with_candidate_and_media');
 assert.equal(await selectNextStudyCandidate({rpc:async()=>({data:null,error:null})},'s'),null);
 await assert.rejects(selectNextStudyCandidate({rpc:async()=>({data:null,error:{message:'Original failure'}})},'s'),/Original failure/);
});
test('personal candidates never acquire official media hints or lose standalone ancestry',()=>{
 const personal={...row,candidate_type:'personal',candidate_id:'card',personal_card_id:'card',personal_concept_id:null,personal_topic_id:'topic',official_question_id:null,official_concept_id:null,difficulty:null,testing_angle:null,question_media_hint:{front:true}};
 const result=adaptStudyCandidateRow(personal);assert.equal(result.kind,'personal');assert.equal(result.personalTopicId,'topic');assert.equal(result.personalConceptId,null);assert.equal('mediaHint' in result,false);
});
test('all four database read wrappers delegate exactly once; no selector is rerun for metadata',()=>{
 const sql=readFileSync(new URL('../supabase/115_question_media_authoring.sql',import.meta.url),'utf8');
 for(const [wrapper,original] of [['get_creator_questions_with_media','get_creator_questions'],['search_creator_questions_with_media','search_creator_questions'],['select_next_study_candidate_with_media','select_next_study_candidate'],['start_study_session_with_candidate_and_media','start_study_session_with_candidate']]){
  const start=sql.indexOf(`create function public.${wrapper}(`);assert.ok(start>=0);const body=sql.slice(start,sql.indexOf('end $$;',start));
  assert.equal((body.match(new RegExp(`public\\.${original}\\(`,'g'))||[]).length,1);
  assert.doesNotMatch(body,/perform.*record|apply_user|update public|insert into public|loop.*select_next/s);
 }
 const start=sql.indexOf('create function public.m115_candidate_hint');const body=sql.slice(start,sql.indexOf('end $$;',start));assert.doesNotMatch(body,/select_next|start_study_session|record_study/);assert.match(body,/unavailable/);
});
