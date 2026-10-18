import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadConceptModule } from './fixtures/concept-media-authoring.mjs';
import * as contract from '../lib/study-suggestions.ts';

const id=n=>`12900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={requestId:id(1),libraryId:id(2),questionId:id(3),category:'Content Correction',message:'  Clarify this explanation.  '};
const receipt={id:id(4),submittedAt:'2026-10-15T20:00:00Z'};
test('suggestion validation allows only the approved fields and categories',()=>{
 assert.equal(contract.parseStudySuggestion(input).message,'Clarify this explanation.');
 for(const category of contract.SUGGESTION_CATEGORIES) assert.equal(contract.parseStudySuggestion({...input,category,questionId:null}).category,category);
 for(const value of [null,[],{...input,userId:id(9)},{...input,topicId:id(9)},{...input,personalCardId:id(9)},
  {...input,admin_notes:'Injected'},{...input,source:'website'},{...input,category:'Account Assistance'},
  {...input,message:' \n\t '},{...input,message:'x'.repeat(4001)},{...input,message:'x\0y'},
  {...input,questionId:'bad'},{...input,libraryId:null},{...input,requestId:null}]) assert.throws(()=>contract.parseStudySuggestion(value));
 assert.equal(contract.parseStudySuggestion({...input,message:'x'.repeat(4000)}).message.length,4000);
 assert.deepEqual(contract.requireSuggestionReceipt({...receipt,admin_notes:'never return'}),receipt);
 assert.throws(()=>contract.requireSuggestionReceipt({}));
});

function endpoint({user={id:id(7)},authError=null,active=true,activeError=null,result={data:receipt},service=true}={}){
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user},error:authError})},rpc:async name=>{calls.push(['account',name]);return {data:active,error:activeError};}};
 const handler=loadConceptModule('lib/study-suggestions-server.ts',{
  'server-only':{},'@/lib/supabase-server':{createSupabaseServerClient:async()=>client},'@/lib/study-suggestions':contract,
  '@supabase/supabase-js':{createClient:(url,key,options)=>{calls.push(['service',url,key,options]);return {rpc:async(name,args)=>{calls.push(['submit',name,args]);return result;}};}},
 },{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:58529',...(service?{SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-only'}:{})}}}).submitStudySuggestion;
 const request=(body=input,options={})=>new Request('http://127.0.0.1:3265/api/study/suggestions',{method:'POST',headers:{host:'127.0.0.1:3265',origin:'http://127.0.0.1:3265','content-type':'application/json',...options.headers},body:typeof body==='string'?body:JSON.stringify(body)});
 return {handler,request,calls};
}
test('server uses verified actor, fixed RPC arguments and returns only a receipt',async()=>{
 const e=endpoint({result:{data:{...receipt,content:'must not leak',admin_notes:'secret'}}});
 const r=await e.handler(e.request());assert.equal(r.status,200);assert.deepEqual(await r.json(),receipt);
 const submission=e.calls.find(x=>x[0]==='submit');
 assert.deepEqual(JSON.parse(JSON.stringify(submission)),['submit','submit_study_suggestion_internal',{p_actor:id(7),p_request_id:id(1),p_library_id:id(2),p_question_id:id(3),p_category:'Content Correction',p_content:'Clarify this explanation.'}]);
 assert.match(r.headers.get('cache-control'),/no-store/);
});
test('origin, session and active-account failures never reach privileged creation',async()=>{
 for(const [config,headers,status] of [[{}, {origin:'https://evil.invalid'},403],[{}, {origin:''},403],
  [{user:null},{},401],[{authError:{message:'expired'}},{},401],[{active:false},{},403],[{activeError:{}},{},503]]){
  const e=endpoint(config);assert.equal((await e.handler(e.request(input,{headers}))).status,status);
  assert.equal(e.calls.some(x=>x[0]==='service'),false);
 }
});
test('invalid, oversized, spoofed and non-JSON requests fail before database creation',async()=>{
 for(const [body,headers,status] of [['{',{},400],[{...input,actor:id(8)},{},400],[{...input,topicId:id(8)},{},400],
  [{...input,message:'x'.repeat(4001)},{},400],['x'.repeat(20001),{},413],[input,{'content-type':'text/plain'},415]]){
  const e=endpoint();assert.equal((await e.handler(e.request(body,{headers}))).status,status);assert.equal(e.calls.some(x=>x[0]==='submit'),false);
 }
});
test('database failures are sanitized and expose retryable outcomes without private content',async()=>{
 for(const [code,status] of [['42501',403],['P0429',429],['23505',409],['22023',400],['22P02',400],['23514',400],['XX000',503]]){
  const e=endpoint({result:{error:{code,message:'private SQL secret'}}});const r=await e.handler(e.request());assert.equal(r.status,status);assert.doesNotMatch(JSON.stringify(await r.json()),/private SQL|secret/);
 }
 const missing=endpoint({service:false});assert.equal((await missing.handler(missing.request())).status,503);
 const bad=endpoint({result:{data:{}}});assert.equal((await bad.handler(bad.request())).status,503);
});
test('Study integration adds only the independent control and excludes Cram',()=>{
 const path='components/StudyPlanner.tsx';let source=readFileSync(path,'utf8');
 const importLine="import { StudySuggestion } from './study-planner/StudySuggestion';\n";
 const control="        {hasStudyCandidate && studyCandidate && userId && activeLibrary && !deck?.cram_mode && (\n          <StudySuggestion key={`${userId}:${activeLibrary.id}:${studyCandidate.candidateId}`} libraryId={activeLibrary.id}\n            questionId={studyCandidate.kind === 'official' ? studyCandidate.questionId : null} disabled={studySubmissionStatus !== 'idle'} />\n        )}\n";
 assert.equal(source.split(importLine).length,2);assert.equal(source.split(control).length,2);
 source=source.replace(importLine,'').replace(control,'');
 assert.equal(createHash('sha256').update(source).digest('hex'),'21a746d71c3c75b17fd919e17740919cf305a9cf580d8eb04f674a471a233231','entire prior StudyPlanner including scheduling, feedback, Flag, Exit and reveal preserved');
});
test('database submission grant is server-only and reuses existing message storage',()=>{
 const sql=readFileSync('supabase/129_study_suggestions.sql','utf8');
 assert.match(sql,/admin_inbox_internal.create_message/);assert.match(sql,/m125_require_question/);assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/grant execute[^;]+to service_role/);assert.doesNotMatch(sql,/grant (insert|update)|to authenticated|create table/i);
 assert.doesNotMatch(sql,/update public\.(questions|study|user_concept)|insert into public\.(review|study)/i);
});
