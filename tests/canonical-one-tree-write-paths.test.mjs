import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../components/StudyCreatorClient.tsx', import.meta.url),'utf8');
const handler = source.slice(source.indexOf('  async function saveTopic('), source.indexOf('  async function saveConcept('));
const compiled = ts.transpileModule(handler+'\nglobalThis.saveTopic = saveTopic;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function legacy({parent='',placement='',record=null}={}) {
 const calls=[],errors=[];
 const context={
  editorModal:{kind:'topic',record},topicName:'Custom branch',topicParentId:parent,topicCanonicalId:placement,ownerId:'owner',
  setIsSaving(){},clearFeedback(){},setError:e=>errors.push(e),getErrorMessage:e=>e.message,
  loadMaterial:async()=>{},setSelectedTopicId(){},setExpandedTopicIds(){},setEditorModal(){},setMessage(){},
  supabase:{rpc(name,args){calls.push({name,args});return {single:async()=>({data:{id:'saved'},error:null})};},from(){assert.fail('Creation must use atomic RPC');}},
 };
 vm.runInNewContext(compiled,context);
 return {calls,errors,save:()=>context.saveTopic({preventDefault(){}})};
}
test('retained authoring refuses root creation until a canonical destination is selected',async()=>{
 const h=legacy();await h.save();assert.equal(h.calls.length,0);assert.match(h.errors[0],/canonical Topic/);
});
test('retained root authoring submits explicit canonical placement atomically',async()=>{
 const h=legacy({placement:'official-topic'});await h.save();assert.equal(h.errors.length,0);
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{name:'create_personal_topic',args:{p_name:'Custom branch',p_parent_personal_topic_id:null,p_official_library_node_id:'official-topic',p_sort_order:0}}]);
});
test('retained Add Subtopic uses parent association and never attaches a direct child placement',async()=>{
 const h=legacy({parent:'owned-parent',placement:'stale-official-selection'});await h.save();assert.equal(h.errors.length,0);
 assert.equal(h.calls[0].args.p_parent_personal_topic_id,'owned-parent');assert.equal(h.calls[0].args.p_official_library_node_id,null);
});
test('retained edit cannot detach a child into an unplaced root',async()=>{
 const h=legacy({record:{id:'child',parent_id:'owned-parent'}});await h.save();assert.equal(h.calls.length,0);assert.match(h.errors[0],/beneath another placed Topic/);
});
test('legacy staff route preserves role-derived authority by opening shared Creator',()=>{
 const route=readFileSync(new URL('../app/study-creator/page.tsx',import.meta.url),'utf8');
 assert.match(route,/if \(role === 'admin' \|\| role === 'editor'\) redirect\('\/creator'\)/);
});
