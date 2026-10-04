import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { composeHomeGroups, groupSelection, requireHomeSettings, mutateHomeSettings } from '../lib/home-deck-settings.ts';

const nodes = [{id:'same',name:'Library',parent_id:null},{id:'branch',name:'Branch',parent_id:'same'}];
const topics = [{id:'same',name:'Placed',parent_id:null,sort_order:0},{id:'child',name:'Child',parent_id:'same',sort_order:0},{id:'grandchild',name:'Grandchild',parent_id:'child',sort_order:0}];
const placement = [{personal_topic_id:'same',library_node_id:'branch'}];
const collection = [{id:'same',name:'Saved group'}];
const snapshot = (states=[],included=[],excluded=[],collections=[]) => ({unified_deck_settings:{version:109,topic_states:states,included_topic_ids:included,excluded_topic_ids:excluded,selected_collection_ids:collections},personal_topic_preferences:{},personal_collection_preferences:{}});
const state = (id, values={}) => ({group_key:`personal:topic:${id}`,topic_id:id,selected:false,direct:false,inherited:false,excluded:false,partial:false,...values});
const group = (id='same',source='personal') => ({id,key:`personal:${source==='collection'?'collection':'topic'}:${id}`,name:id,parent_id:null,children:[],source});

test('Creator placement stays nested inside the existing Library hierarchy',()=>{
 const result=composeHomeGroups(nodes,topics,placement,collection);
 assert.equal(result.length,2);
 assert.equal(result[0].children[0].children[0].key,'personal:topic:same');
 assert.equal(result[0].children[0].children[0].children[0].children[0].id,'grandchild');
 assert.equal(result[1].key,'personal:collection:same');
});
test('same UUID across sources and collection remains three independent identities',()=>{
 const result=composeHomeGroups(nodes,topics,placement,collection);
 const keys=[]; const walk=n=>{keys.push(n.key); n.children.forEach(walk);};result.forEach(walk);
 assert.equal(new Set(keys).size,keys.length);
 assert.ok(keys.includes('official:topic:same')); assert.ok(keys.includes('personal:topic:same')); assert.ok(keys.includes('personal:collection:same'));
});
test('unplaced roots fail visibly instead of becoming independent Home roots',()=>{
 assert.throws(()=>composeHomeGroups(nodes,topics,[],[]),/no canonical placement/);
});
test('missing Library placement fails instead of moving a placed Topic to root',()=>{
 assert.throws(()=>composeHomeGroups(nodes,topics,[{personal_topic_id:'same',library_node_id:'missing'}],[]),/outside the loaded Library/);
});
test('cyclic hierarchy fails instead of omitting content',()=>{
 assert.throws(()=>composeHomeGroups([], [{id:'a',name:'A',parent_id:'a',sort_order:0}],[],[]),/unreachable/);
});
for (const [name,values,include,exclude,expected] of [
 ['neutral',{},[],[],{checked:false,explicit:false,partial:false,inherited:false,excluded:false,excludedByAncestor:false}],
 ['direct',{selected:true,direct:true},['same'],[],{checked:true,explicit:true,partial:false,inherited:false,excluded:false,excludedByAncestor:false}],
 ['inherited',{selected:true,inherited:true},['parent'],[],{checked:true,explicit:false,partial:false,inherited:true,excluded:false,excludedByAncestor:false}],
 ['child exclusion',{excluded:true},['parent'],['same'],{checked:false,explicit:false,partial:false,inherited:false,excluded:true,excludedByAncestor:false}],
 ['ancestor exclusion',{excluded:true},['parent'],['ancestor'],{checked:false,explicit:false,partial:false,inherited:false,excluded:false,excludedByAncestor:true}],
 ['re-inclusion',{selected:true,direct:true},['same'],['ancestor'],{checked:true,explicit:true,partial:false,inherited:false,excluded:false,excludedByAncestor:false}],
 ['partial',{selected:true,direct:true,partial:true},['same'],['child'],{checked:true,explicit:true,partial:true,inherited:false,excluded:false,excludedByAncestor:false}],
]) test(`authoritative ${name} presentation`,()=>assert.deepEqual(groupSelection(group(),snapshot([state('same',values)],include,exclude)),expected));
test('visual Library placement supplies no selection inheritance',()=>{
 const placed=composeHomeGroups(nodes,topics,placement,[])[0].children[0].children[0];
 assert.equal(groupSelection(placed,snapshot([state('same')])).checked,false);
});
test('collection selection stays independent of Topic with same UUID',()=>{
 const s=snapshot([state('same')],[],[],['same']);
 assert.equal(groupSelection(group('same','collection'),s).checked,true);
 assert.equal(groupSelection(group(),s).checked,false);
});
test('missing or old snapshot cannot silently present unchecked state',()=>{
 assert.throws(()=>requireHomeSettings({}),/could not be confirmed/);
 assert.throws(()=>groupSelection(group(),snapshot()),/missing/);
});
for (const [kind,name,param,value,response] of [
 ['topic-selection','set_study_deck_personal_topic_selection','p_topic_id',true,{selected_personal_topic_ids:['same'],excluded_personal_topic_ids:[]}],
 ['collection-selection','set_study_deck_personal_collection_selection','p_collection_id',true,{selected_collection_ids:['same']}],
 ['collection-preference','set_study_deck_personal_collection_preference','p_collection_id',75,{group_key:'personal:collection:same',new_mastery_balance:75}],
]) test(`${kind} uses one atomic write and reconciles authoritative readback`,async()=>{
 const calls=[];const saved=snapshot([state('same',{selected:true,direct:true})],['same'],[],['same']);
 const result=await mutateHomeSettings(async(n,a)=>{calls.push([n,a]);return {data:calls.length===1?response:saved,error:null};},'deck','library',kind,'same',value);
 assert.equal(result,saved);assert.equal(calls.length,2);assert.equal(calls[0][0],name);
 assert.deepEqual(calls[0][1],{p_deck_id:'deck',[param]:'same',[typeof value==='number'?'p_balance':'p_include']:value});
 assert.deepEqual(calls[1],['get_home_study_bootstrap',{p_library_id:'library',p_deck_id:'deck'}]);
});
test('denial makes one request, does not retry or overwrite previously confirmed settings',async()=>{
 let calls=0; const previous=snapshot([state('same')]);const before=JSON.stringify(previous);
 await assert.rejects(mutateHomeSettings(async()=>{calls++;return {data:null,error:{message:'Owned active Deck required'}};},'deck','library','topic-selection','same',true),/Owned active Deck/);
 assert.equal(calls,1);assert.equal(JSON.stringify(previous),before);
});
test('successful mutation followed by failed readback reports uncertainty without retry',async()=>{
 let calls=0;await assert.rejects(mutateHomeSettings(async()=>++calls===1?{data:{selected_collection_ids:[]},error:null}:{data:null,error:{message:'offline'}},'deck','library','collection-selection','same',false),/may have saved.*Reload/);
 assert.equal(calls,2);
});
test('branch reset uses the returned bootstrap including removed nested directives',async()=>{
 const reset=snapshot([state('same',{selected:true,direct:true}),state('child',{selected:true,inherited:true}),state('grandchild',{selected:true,inherited:true})],['same']);
 let calls=0;const actual=await mutateHomeSettings(async()=>({data:++calls===1?{selected_personal_topic_ids:['same'],excluded_personal_topic_ids:[]}:reset,error:null}),'deck','library','topic-selection','same',true);
 assert.deepEqual(actual.unified_deck_settings.excluded_topic_ids,[]);assert.equal(groupSelection(group('grandchild'),actual).inherited,true);
});
const planner=readFileSync(new URL('../components/StudyPlanner.tsx',import.meta.url),'utf8');
test('one existing Deck Settings surface, no source label, old section, new style file, or legacy mutation',()=>{
 assert.equal((planner.match(/id="home-v2-setup-title"/g)||[]).length,1);
 assert.doesNotMatch(planner,/My Study Material|Personal Decks|renderPersonalMaterialSection|togglePersonalTopicSelection|togglePersonalCollectionSelection/);
 const render=planner.slice(planner.indexOf('function renderNode('),planner.indexOf('const rootNodes = nodes'));
 assert.match(render,/aria-checked=\{selection.partial \? 'mixed'/);assert.match(render,/input.indeterminate = selection.partial/);
 assert.match(render,/homeGroups = composeHomeGroups/);
 assert.doesNotMatch(render,/>\s*(Official|Personal|My|User content|Admin content)\s*</);
 assert.match(render,/children.map\(\(child\) => renderNode\(child, depth \+ 1\)\)/);
});
test('preference drafts default to 50 without a render write and restore on failure',()=>{
 assert.match(planner,/if \(preference && group.source !== 'collection'\) return persistNodePreference/);
 assert.match(planner,/if \(preference && value === saved\) return/);
 assert.match(planner,/const saved = .*\?\? 50/);
 assert.match(planner,/catch \(error\) \{[\s\S]*setGroupDrafts\(\{\}\)/);
 assert.match(planner,/settingsRequest.current/);
});
test('Study candidates remain backend resolved and Cram controls retained',()=>{
 assert.match(planner,/startStudySessionWithCandidate\(/);
 assert.match(planner,/selectNextStudyCandidate\(/);
 assert.match(planner,/onChange=\{\(\) => void toggleSetupCramMode\(\)\}/);
 assert.match(planner,/disabled=\{isSetupCramMode \|\| isSaving/);
});

test('no new visible loading treatment is introduced',()=>{
 assert.doesNotMatch(planner,/Loading deck settings\.\.\./);
 const shell = readFileSync(new URL('../components/study-planner/LearnerShell.tsx', import.meta.url), 'utf8');
 assert.doesNotMatch(shell,/Loading deck settings\.\.\./);
 assert.match(shell,/Loading your deck…/);
 assert.match(planner,/initialDeckData\?\.homeSettings \|\| null/);
 assert.match(planner,/isLoading: isLoading \|\| Boolean\(deck && !homeSettings && !homeTreeError\)/);
});

test('Topic row markup and styles are identical across sources',async()=>{
 const {default:vm}=await import('node:vm');
 const {default:ts}=await import('typescript');
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const {renderToStaticMarkup}=require('react-dom/server');
 const start=planner.indexOf('  function renderNode('),end=planner.indexOf('  let homeGroups:',start);
 const source=`export ${planner.slice(start,end).trim()}`;
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},fileName:'row.tsx'}).outputText;
 const exports={};const s=snapshot([state('same')]);
 vm.runInNewContext(output,{exports,require,expandedNodeIds:new Set(),expandedPersonalTopicIds:new Set(),
  configuredGroupKey:null,
  branchConceptIds:()=>['c1','c2'],libraryAvailabilityQuestionCounts:{c1:1,c2:2},
  getTopicSelectionPresentation:()=>({checked:false,explicit:false,partial:false,inherited:false,excluded:false,excludedByAncestor:false}),
  nodes:[],placements:[],selectedNodeIds:new Set(),excludedNodeIds:new Set(),conceptOverrides:{},groupSelection,
  homeSettings:s,nodePreferences:{},groupDrafts:{},personalBranchCounts:()=>({concepts:2,cards:3}),
  branchAvailabilityQuestionCount:()=>3,personalCollections:[],isSaving:false,settingsError:'',isSetupCramMode:false,
 });
 const official={...group(),name:'Topic',source:'official',key:'official:topic:same'};
 const personal={...group(),name:'Topic'};
 const html=n=>renderToStaticMarkup(exports.renderNode(n)).replaceAll('official:topic:same','topic:same').replaceAll('personal:topic:same','topic:same');
 assert.equal(html(official),html(personal));
});

test('server bootstrap includes settings and owned Creator placements before first render',async()=>{
 const {default:vm}=await import('node:vm');const {default:ts}=await import('typescript');
 const source=readFileSync(new URL('../lib/study-planner-initial-data.ts',import.meta.url),'utf8');
 const saved=snapshot([state('same')]);const calls=[];const exports={};
 const bootstrap={...saved,available_libraries:[{id:'library'}],nodes,personal_topics:topics};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
  exports,require(name){if(name==='server-only')return {};if(name==='@/lib/supabase-server')return {createSupabaseServerClient:async()=>({
   rpc:async(n)=>{calls.push(n);return {data:{deck:{id:'deck',user_id:'owner'},bootstrap},error:null};},
   from:(table)=>{assert.equal(table,'personal_topic_official_placements');return {select:()=>({eq:async(column,id)=>{assert.equal(column,'owner_id');assert.equal(id,'owner');return {data:placement,error:null};}})};},
  })};throw new Error(name);},
 });
 const loaded=await exports.loadStudyPlannerInitialData({activeLibrary:{id:'library'},role:'learner'});
 assert.deepEqual(JSON.parse(JSON.stringify(loaded.homeSettings.unified_deck_settings)),saved.unified_deck_settings);
 assert.deepEqual(JSON.parse(JSON.stringify(loaded.homeTopicPlacements)),placement);
 assert.equal(loaded.settingsLoadError,'');assert.deepEqual(calls,['get_existing_home_study_bootstrap']);
});
