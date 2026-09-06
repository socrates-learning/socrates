// Requires a disposable local database and a separate local PostgREST instance
// targeting that database. The JWT secret must belong to that local instance.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const database=process.env.PHASE7D_TEST_DATABASE_URL;
const rest=process.env.PHASE7D_TEST_REST_URL;
const secret=process.env.PHASE7D_TEST_JWT_SECRET;
for(const url of [database,rest]) if(!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('Explicit disposable localhost endpoints required');
if(!secret) throw new Error('Local JWT secret required');
const sql=readFileSync(new URL('./phase7d-question-testing-angles.sql',import.meta.url),'utf8');
const setup=sql.slice(sql.indexOf('begin;'),sql.indexOf('-- Sixty pre-existing'));
const result=spawnSync('psql',[database,'-At','-v','ON_ERROR_STOP=1'],{input:setup+'\nselect row_to_json(f) from phase7d_fixture f;\ncommit;',encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
const fixture=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('{')));
function token(user) {
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const content=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub:user,exp:Math.floor(Date.now()/1000)+3600});
 return content+'.'+createHmac('sha256',secret).update(content).digest('base64url');
}
async function rpc(name,payload,user=fixture.editor) {
 // Each call is a fresh HTTP request; no form state or cached response is reused.
 const response=await fetch(rest+'/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+token(user),'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(payload)});
 const data=await response.json();return {response,data};
}
const payload={p_question_id:null,p_concept_id:fixture.primary_concept,p_question_type:'short_answer',p_prompt:'Phase7D HTTP fresh reload',p_explanation:null,p_status:'published',p_review_article_concept_id:null,p_sort_order:0,p_difficulty:'medium',p_testing_angle:'General Understanding',p_accepted_answers:[{answer_text:'Answer',sort_order:0}],p_options:null,p_source_ids:null,p_tag_ids:[],p_active_library_id:fixture.library,p_related_concept_ids:[fixture.related_a,fixture.related_b],p_additional_testing_angles:[' Recall ','Application','recall']};
let saved=await rpc('save_question_with_relationships_v2',payload);assert.equal(saved.response.status,200,JSON.stringify(saved.data));
payload.p_question_id=saved.data.id;
const browse=async()=>{const r=await rpc('get_creator_questions',{p_active_library_id:fixture.library,p_concept_id:fixture.related_a});assert.equal(r.response.status,200,JSON.stringify(r.data));assert.equal(r.data.length,1);return r.data[0];};
let q=await browse();assert.equal(q.id,payload.p_question_id);assert.equal(q.concept_id,fixture.primary_concept);assert.equal(q.related_concepts.length,2);assert.deepEqual(q.additional_testing_angles,['Application','Recall']);console.log('PASS: committed HTTP save + fresh authenticated Related browse restores all relationships once');
const firstVersion=q.current_version_id;
payload.p_testing_angle=' recall ';payload.p_additional_testing_angles=null;
saved=await rpc('save_question_with_relationships_v2',payload);assert.equal(saved.response.status,200);
q=await browse();assert.deepEqual(q.additional_testing_angles,['Application']);console.log('PASS: Primary promotion persists through fresh HTTP reload');
const legacy={...payload};delete legacy.p_active_library_id;delete legacy.p_related_concept_ids;delete legacy.p_additional_testing_angles;
saved=await rpc('save_question_with_version',legacy);assert.equal(saved.response.status,200);q=await browse();assert.deepEqual(q.additional_testing_angles,['Application']);assert.equal(q.related_concepts.length,2);console.log('PASS: legacy scalar HTTP save preserves both relationship sets');
const previousVersion=q.current_version_id;
saved=await rpc('save_question_with_relationships_v2',{...payload,p_prompt:'Must rollback',p_additional_testing_angles:[' ']});assert.ok(!saved.response.ok);q=await browse();assert.equal(q.prompt,payload.p_prompt);assert.equal(q.current_version_id,previousVersion);console.log('PASS: failed HTTP save is atomic across content and version pointer');
saved=await rpc('save_question_with_relationships_v2',payload,fixture.learner);assert.ok(!saved.response.ok);q=await browse();assert.equal(q.current_version_id,previousVersion);console.log('PASS: learner HTTP mutation rejected without side effects');
saved=await rpc('save_question_with_relationships_v2',{...payload,p_additional_testing_angles:[]});assert.equal(saved.response.status,200);q=await browse();assert.deepEqual(q.additional_testing_angles,[]);assert.equal(q.related_concepts.length,2);console.log('PASS: explicit empty clears Additional and preserves Related');
const verify=spawnSync('psql',[database,'-At','-v','ON_ERROR_STOP=1','-c',`select count(*)=4 and bool_and(snapshot_schema_version=4) from public.question_versions where question_id='${q.id}'; select jsonb_array_length(additional_testing_angles_snapshot)=2 from public.question_versions where id='${firstVersion}';`],{encoding:'utf8'});
assert.equal(verify.status,0,verify.stderr);assert.deepEqual(verify.stdout.trim().split('\n'),['t','t']);console.log('PASS: four successful saves create exactly four complete schema-4 snapshots; first snapshot unchanged');
console.log('PASS 7/7. Fixtures remain ONLY in the explicitly supplied disposable database; drop that database after UAT.');
