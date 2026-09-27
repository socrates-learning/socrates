import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planTopicPosition, executeTopicPosition, canPosition} from '../lib/creator-topic-positioning.ts';
import {compareCreatorTopics} from '../lib/creator-topic-order.js';
import {buildConceptTopicTree} from '../lib/concept-topic-tree.ts';
const key=(id,source='official')=>`${source}:topic:${id}`;
function fixture(source='official') {
  const node=(id,parent,rank)=>({id,key:key(id,source),source,name:id,parentKey:parent?key(parent,source):null,placementKey:null,sort_order:rank,ownerId:'owner'});
  return {libraryId:'library',ownerId:'owner',canManageOfficial:true,nodes:[node('root',null,0),node('p','root',0),node('q','root',1),node('a','p',0),node('b','p',1),node('c','p',2),node('d','p',3)]};
}
for(const source of ['official','personal']) {
 for(const [label,moving,target,intent,anchor] of [['earlier','c','a','before','a'],['later','a','c','after','d'],['first','d','a','before','a'],['last','a','d','after',null],['adjacent','b','a','before','a']]) {
  test(`${source}: ${label} supplies complete sibling assertions and anchor`,()=>{
   const p=planTopicPosition(fixture(source),key(moving,source),key(target,source),intent);
   assert.equal(p.noop,false);assert.equal(p.args.p_before_sibling_id,anchor);
   assert.deepEqual(p.args.p_expected_source_ids,['a','b','c','d']);assert.deepEqual(p.args.p_expected_destination_ids,['a','b','c','d']);
   assert.equal(p.rpc,source==='official'?'position_library_node_in_library':'position_personal_topic');
   if(source==='official')assert.equal(p.args.p_library_id,'library');
  });
 }
 test(`${source}: reparent into empty parent retains populated source`,()=>{
  const p=planTopicPosition(fixture(source),key('b',source),key('q',source),'inside');
  assert.equal(p.args.p_expected_parent_id,'p');assert.equal(p.args.p_destination_parent_id,'q');assert.deepEqual(p.args.p_expected_source_ids,['a','b','c','d']);assert.deepEqual(p.args.p_expected_destination_ids,[]);
 });
 test(`${source}: no-op skips RPC and refresh`,async()=>{
  for(const [moving,target,intent] of [['a','b','before'],['d','p','inside'],['b','b','after']]) {
   const p=planTopicPosition(fixture(source),key(moving,source),key(target,source),intent);assert.equal(p.noop,true);
   const r=await executeTopicPosition(p,{current:false},()=>assert.fail('RPC'),()=>assert.fail('refresh'));assert.equal(r.kind,'noop');
  }
 });
 test(`${source}: cycles and root-child conversion rejected`,()=>{
  const c=fixture(source);assert.equal(planTopicPosition(c,key('p',source),key('a',source),'inside'),null);
  assert.equal(planTopicPosition(c,key('a',source),key('root',source),'before'),null);
  assert.equal(planTopicPosition(c,key('root',source),key('p',source),'inside'),null);
 });
}
test('personal roots: placement and Unplaced retain canonical null parent',()=>{
 const c=fixture('personal');c.nodes=c.nodes.filter(n=>n.id!=='p'&&n.id!=='q'&&n.parentKey===null);
 c.nodes.push(...fixture().nodes);
 const p=planTopicPosition(c,key('root','personal'),key('p'),'inside');
 assert.equal(p.args.p_destination_parent_id,null);assert.equal(p.args.p_destination_official_node_id,'p');
 c.nodes[0].placementKey=key('p');
 const unplaced=planTopicPosition(c,key('root','personal'),'unplaced','inside');assert.equal(unplaced.args.p_expected_official_node_id,'p');assert.equal(unplaced.args.p_destination_official_node_id,null);
});
test('personal root reorder asserts complete owner-only placement group',()=>{
 const c=fixture('personal');c.nodes=c.nodes.filter(n=>n.parentKey===null);
 c.nodes.push({...c.nodes[0],id:'second',key:key('second','personal'),sort_order:1});
 c.nodes.push({...c.nodes[0],id:'foreign',key:key('foreign','personal'),ownerId:'other'});
 const p=planTopicPosition(c,key('second','personal'),key('root','personal'),'before');assert.deepEqual(p.args.p_expected_source_ids,['root','second']);assert.equal(p.args.p_before_sibling_id,'root');
 assert.equal(planTopicPosition(c,key('foreign','personal'),key('root','personal'),'before'),null);
});
test('source-qualified IDs do not confuse official and personal UUIDs',()=>{
 const c=fixture();c.nodes.push(...fixture('personal').nodes);
 assert.equal(planTopicPosition(c,key('a'),key('q','personal'),'inside'),null);
 assert.equal(planTopicPosition(c,key('a','personal'),key('q'),'inside'),null);
 assert.equal(planTopicPosition(c,key('a','personal'),key('q','personal'),'inside').rpc,'position_personal_topic');
});
test('learner cannot initiate official changes; owner personal changes remain available',()=>{
 const c={...fixture(),canManageOfficial:false};assert.equal(canPosition(c,c.nodes[3]),false);assert.equal(planTopicPosition(c,key('a'),key('b'),'after'),null);
 const personal={...fixture('personal'),canManageOfficial:false};assert.ok(planTopicPosition(personal,key('a','personal'),key('b','personal'),'after'));
});
test('canonical comparator: null-last, UTF-8 C names, UUID tie-break',()=>{
 const rows=[{id:'z',name:'a',sort_order:null},{id:'2',name:'Z',sort_order:0},{id:'1',name:'Z',sort_order:0},{id:'a',name:'a',sort_order:0},{id:'e',name:'é',sort_order:0}];
 assert.deepEqual(rows.slice().sort(compareCreatorTopics).map(n=>n.id),['1','2','a','e','z']);
 assert.deepEqual(buildConceptTopicTree(rows.map(n=>({...n,parent_id:null})),true).map(n=>n.id),['1','2','a','e','z']);
});
const plan=()=>planTopicPosition(fixture(),key('a'),key('d'),'after');
test('PT409 refreshes exactly once without retrying stale assertions or exposing raw errors',async()=>{
 let calls=0,refreshes=0;const lock={current:false};
 const result=await executeTopicPosition(plan(),lock,async()=>{calls++;return{error:{code:'PT409',message:'SECRET SQL'}}},async()=>{refreshes++;});
 assert.equal(calls,1);assert.equal(refreshes,1);assert.equal(result.kind,'stale');assert.match(result.message,/refreshed/);assert.doesNotMatch(result.message,/SECRET|SQL/);assert.equal(lock.current,false);
});
test('generic failure leaves authoritative tree unchanged',async()=>{
 const state=fixture();const before=structuredClone(state);let refreshes=0;
 const result=await executeTopicPosition(plan(),{current:false},async()=>({error:{code:'XX000',message:'raw internal error'}}),async()=>{refreshes++;});
 assert.equal(result.kind,'error');assert.equal(refreshes,0);assert.deepEqual(state,before);assert.doesNotMatch(result.message,/raw internal/);
});
test('pending request prevents duplicate submission and unlocks after refresh',async()=>{
 let release,calls=0;const lock={current:false};const rpc=()=>{calls++;return new Promise(r=>release=r)};
 const first=executeTopicPosition(plan(),lock,rpc,async()=>{assert.equal(lock.current,true)});
 assert.equal((await executeTopicPosition(plan(),lock,rpc,async()=>{})).kind,'busy');assert.equal(calls,1);
 release({error:null});assert.equal((await first).kind,'success');assert.equal(lock.current,false);
});
for(const [code,pattern] of [['42501',/permission/],['23505',/already has/],['22023',/not valid/],['P0001',/not valid/]])test(`safe differentiated ${code} error`,async()=>{
 const r=await executeTopicPosition(plan(),{current:false},async()=>({error:{code,message:'raw'}}),async()=>assert.fail());assert.match(r.message,pattern);
});
test('failed authoritative refresh does not claim refreshed/saved UI',async()=>{
 const r=await executeTopicPosition(plan(),{current:false},async()=>({error:{code:'PT409'}}),async()=>{throw Error('offline')});assert.equal(r.kind,'error');assert.match(r.message,/could not be refreshed/);
});
test('keyboard dialog, dedicated handle, Escape, pending guard and existing Move remain wired',()=>{
 const ui=readFileSync(new URL('../components/CreatorTopicTreeInteraction.tsx',import.meta.url),'utf8');
 const creator=readFileSync(new URL('../components/CreatorStudioV2Client.tsx',import.meta.url),'utf8');
 assert.match(ui,/role="dialog"/);assert.match(ui,/Position<select/);assert.match(ui,/Destination<select/);assert.match(ui,/Move Topic/);assert.match(ui,/Escape/);assert.match(ui,/setPointerCapture/);assert.match(ui,/pending.current/);
 assert.match(creator,/async function moveActiveTopic/);assert.match(creator,/reloadRealTopicTree\(activeTopicId\)/);assert.match(creator,/!state.topics.some\(t\s*=>\s*t.id\s*===\s*activePersonalTopicId\)/);
});

test('actual Creator drop handler preserves selected Topic while installing authoritative state',async()=>{
 const ts=await import('typescript');const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../components/CreatorStudioV2Client.tsx',import.meta.url),'utf8');
 const file=ts.createSourceFile('creator.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='positionTopicFromTree')handler=node.getText(file);ts.forEachChild(node,visit)}visit(file);assert.ok(handler);
 for(const error of [null,{code:'PT409'},{code:'XX000'}]) {
  const state={selected:'selected-personal',official:'selected-official',topics:['before'],placements:[],busy:false};let refreshed=0;
  const scope={isMutatingTopic:false,structuralDropLock:{current:false},executeTopicPosition,supabase:{rpc:async()=>({error})},activeTopicId:state.official,activePersonalTopicId:state.selected,initialPersonalContent:{ownerId:'owner'},
   setIsMutatingTopic:v=>state.busy=v,reloadRealTopicTree:async preferred=>{assert.equal(preferred,state.official);refreshed++},refreshPersonalStructure:async()=>({topics:[{id:'selected-personal'}],placements:[{id:'authoritative'}]}),
   setPersonalTopics:v=>state.topics=v,setPersonalTopicPlacements:v=>state.placements=v,setActivePersonalTopicId:v=>state.selected=v,setExpandedPersonalTopicIds:()=>{},setExpandedTopicIds:()=>{},showStatus:()=>{},
  };
  runInNewContext(ts.transpileModule(handler+';this.invoke=positionTopicFromTree;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,scope);
  await scope.invoke(plan());assert.equal(state.selected,'selected-personal');assert.equal(state.official,'selected-official');assert.equal(state.busy,false);
  assert.equal(refreshed,error?.code==='XX000'?0:1);assert.deepEqual(state.topics,error?.code==='XX000'?['before']:[{id:'selected-personal'}]);
 }
});

test('keyboard activation is not swallowed by a preceding drag click suppression',async()=>{
 const ts=await import('typescript');const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../components/CreatorTopicTreeInteraction.tsx',import.meta.url),'utf8');
 const file=ts.createSourceFile('interaction.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let declaration;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='openKeyboard')declaration=node.getText(file);ts.forEachChild(node,visit)}visit(file);assert.ok(declaration);
 for(const fromPointer of [true,false]){
  let opened=0;const scope={suppressClick:{current:true},disabled:false,pending:{current:false},origin:{current:null},context:fixture(),setSession:()=>opened++,setKeyboard:()=>{},setIntent:()=>{},setTarget:()=>{}};
  runInNewContext(ts.transpileModule('const '+declaration+';this.open=openKeyboard;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,scope);
  scope.open(key('a'),{},fromPointer);assert.equal(opened,fromPointer?0:1);
 }
});

test('commit restores the replaced handle after reparent without stealing editor focus',async()=>{
 const ts=await import('typescript');const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../components/CreatorTopicTreeInteraction.tsx',import.meta.url),'utf8');
 const file=ts.createSourceFile('interaction.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='commit')handler=node.getText(file);ts.forEachChild(node,visit)}visit(file);assert.ok(handler);
 for(const editingElsewhere of [false,true]){
  let focused=0;const body={},editor={};const scope={disabled:false,pending:{current:false},setSubmitting:()=>{},cancel:()=>{},onMove:async()=>{},requestAnimationFrame:fn=>fn(),document:{body,activeElement:editingElsewhere?editor:body},origin:{current:{}},CSS:{escape:s=>s},root:{current:{querySelector:selector=>{assert.match(selector,/official:topic:a/);return{focus:()=>focused++}}}}};
  runInNewContext(ts.transpileModule(handler+';this.invoke=commit;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,scope);
  await scope.invoke(plan());assert.equal(focused,editingElsewhere?0:1);assert.equal(scope.pending.current,false);
 }
});
