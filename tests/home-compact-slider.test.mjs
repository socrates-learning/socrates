import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {composeHomeGroups,locationSelection,requireHomeSettings} from '../lib/home-deck-settings.ts';
import {graphFromNodes} from './fixtures/shared-topic-branches.mjs';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../components/StudyPlanner.tsx',import.meta.url),'utf8');
const start=source.indexOf('  function renderNode('),end=source.indexOf('  let homeGroups:',start);
const compiled=ts.transpileModule(`${source.slice(source.indexOf('  function beginPreferenceGesture('),source.indexOf('  async function toggleSetupCramMode('))}\nexport ${source.slice(start,end).trim()}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const node=(id,children=[])=>({id,key:`official:topic:${id}`,source:'official',name:id,children});
const root=node('Nursing',[node('Branch A',[node('Leaf A')]),node('Branch B',[node('Leaf B')])]);
function fixture(tree=root,settings={unified_deck_settings:{topic_preference_state:{values:{}}}}){
 const writes=[];
 const context={exports:{},require,configuredGroupKey:tree.occurrenceKey||tree.key,expandedNodeIds:new Set([tree.occurrenceKey||tree.id]),expandedPersonalTopicIds:new Set(),
 branchConceptIds:()=>['concept'],libraryAvailabilityQuestionCounts:{concept:4},branchAvailabilityQuestionCount:()=>4,
 getTopicSelectionPresentation:()=>({checked:true,explicit:true,partial:false}),locationSelection,nodes:[],placements:[],selectedNodeIds:new Set(),excludedNodeIds:new Set(),conceptOverrides:{},nodePreferences:{},groupDrafts:{},homeSettings:settings,isSaving:false,settingsError:'',isSetupCramMode:false,
 setConfiguredGroupKey:key=>{context.configuredGroupKey=key;},toggleNodeSelection:(...args)=>writes.push(['selection',...args]),persistNodePreference:(group,value)=>writes.push(['preference',group.id,value]),preferenceGesture:{current:null},saveGroupSetting:(...args)=>writes.push(['group',...args]),setGroupDrafts:fn=>{context.groupDrafts=fn(context.groupDrafts);},
 setNodePreferences:fn=>{context.nodePreferences=fn(context.nodePreferences);},toggleExpandedNode:id=>{const s=context.expandedNodeIds;if(s.has(id))s.delete(id);else s.add(id);}};
 vm.createContext(context);vm.runInContext(compiled,context);
 const render=()=>context.exports.renderNode(tree);
 return {context,writes,render};
}
function elements(tree){const result=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'&&n.props){result.push(n);walk(n.props.children);}}walk(tree);return result;}
const find=(f,label)=>elements(f.render()).find(n=>n.props['aria-label']===label);
const sliders=f=>elements(f.render()).filter(n=>n.props.type==='range');
test('only active Topic slider renders beneath compact row and before immediate children',()=>{
 const f=fixture(),tree=f.render();assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props.value,50);
 const children=tree.props.children;
 const row=children.find(n=>elements(n).some(el=>el.props['aria-label']==='Configure Nursing New to Mastery balance'));
 assert.ok(row);assert.ok(elements(row).some(el=>el.props['aria-label']==='Include Nursing in Study'));
 assert.equal(elements(row).filter(n=>n.props.type==='range').length,0);
 const sliderIndex=children.findIndex(n=>elements(n).some(el=>el.props.type==='range'));
 const childIndex=children.findIndex(n=>elements(n).some(el=>el.props['aria-label']==='Expand Branch A'));
 assert.equal(sliderIndex,children.indexOf(row)+1);assert.ok(childIndex>sliderIndex);
 assert.ok(find(f,'Expand Branch A'));assert.equal(find(f,'Expand Leaf A'),undefined);assert.deepEqual(f.writes,[]);
});
test('configure is source-qualified, moves one slider, and never changes selection or writes',()=>{
 const f=fixture();find(f,'Configure Branch A New to Mastery balance').props.onClick();
 assert.equal(f.context.configuredGroupKey,'official:topic:Branch A');assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props['aria-label'],'Branch A New to Mastery balance');assert.deepEqual(f.writes,[]);
 assert.equal(find(f,'Include Branch A in Study').props.checked,true);
 f.context.configuredGroupKey='personal:topic:Branch A';assert.equal(sliders(f).length,0);
});
test('expansion reveals one next level and leaves other branches collapsed',()=>{
 const f=fixture();find(f,'Expand Branch A').props.onClick();assert.ok(find(f,'Expand Leaf A'));assert.equal(find(f,'Expand Leaf B'),undefined);assert.deepEqual(f.writes,[]);
});
test('slider separates draft from saved value and retains Cram disabling',()=>{
 const f=fixture();f.context.nodePreferences={Nursing:73};assert.equal(sliders(f)[0].props.value,73);
 sliders(f)[0].props.onChange({target:{value:'31'}});assert.equal(sliders(f)[0].props.value,31);assert.equal(f.context.nodePreferences.Nursing,73);assert.deepEqual(f.writes,[]);
 sliders(f)[0].props.onPointerUp({currentTarget:{value:'31'}});assert.deepEqual(f.writes,[['preference','Nursing',31]]);
 f.context.isSetupCramMode=true;assert.equal(sliders(f)[0].props.disabled,true);
});
test('eligibility stays separate while inherited rows expose the supported contextual slider',()=>{
 const f=fixture();find(f,'Include Branch A in Study').props.onChange({currentTarget:{checked:false}});assert.deepEqual(f.writes,[['selection','Branch A',false,undefined]]);
 f.context.getTopicSelectionPresentation=()=>({checked:true,explicit:false,inherited:true,partial:false});assert.equal(sliders(f).length,1);
});

function locatedFixture(){
 const g=graphFromNodes('library',[
  {id:'Nursing',name:'Nursing',parent_id:null},
  {id:'Branch A',name:'Branch A',parent_id:'Nursing'},
  {id:'Leaf A',name:'Leaf A',parent_id:'Branch A'},
  {id:'Nested A',name:'Nested A',parent_id:'Leaf A'},
  {id:'Deep A',name:'Deep A',parent_id:'Nested A'},
  {id:'Branch B',name:'Branch B',parent_id:'Nursing'},
 ]);
 const graph={...g,version:132,locations:[
  ...g.nodes.map(n=>({id:n.id,topic_id:n.id,library_id:g.library_id,parent_location_id:n.parent_id,sort_order:n.sort_order,is_original:true})),
  {id:'alias-a',topic_id:'Leaf A',library_id:g.library_id,parent_location_id:'Branch B',sort_order:0,is_original:false},
 ]};
 const settings=requireHomeSettings({official_topic_graph:graph,
  location_selection:{version:132,graph_revision:g.revision,states:graph.locations.map(l=>({location_id:l.id,topic_id:l.topic_id,included:true,direct:l.id==='Nursing',source_location_id:'Nursing',distance:l.id==='Nursing'?0:1}))},
  unified_deck_settings:{version:109,topic_states:[],included_topic_ids:[],excluded_topic_ids:[],selected_collection_ids:[],
   topic_preference_state:{version:122,deck_id:'deck',library_id:'library',revision:'a'.repeat(32),values:Object.fromEntries(g.nodes.map(n=>[`official:topic:${n.id}`,n.id==='Branch B'?12:73]))}},
  personal_topic_preferences:{},personal_collection_preferences:{}});
 return fixture(composeHomeGroups(g.nodes,[],[],[],graph)[0],settings);
}

test('Topic-name clicks expose immediate and deeply nested inherited sliders without changing eligibility',()=>{
 const f=locatedFixture(),before=JSON.stringify(f.context.homeSettings);
 for(const name of ['Branch A','Leaf A','Nested A','Deep A']){
  const button=find(f,`Configure ${name} New to Mastery balance`);
  assert.ok(button,`${name} is reachable through normal expansion`);button.props.onClick();
  assert.equal(f.context.configuredGroupKey,`location:${name}`);
  assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props['aria-label'],`${name} New to Mastery balance`);
  assert.equal(sliders(f)[0].props.value,73);assert.equal(find(f,`Include ${name} in Study`).props.checked,true);
  assert.equal(locationSelection({occurrenceKey:`location:${name}`},f.context.homeSettings).inherited,true);
  if(name!=='Deep A')find(f,`Expand ${name}`).props.onClick();
 }
 assert.equal(find(f,'Expand Deep A').props.disabled,true);
 assert.equal(JSON.stringify(f.context.homeSettings),before);assert.deepEqual(f.writes,[]);
});

test('shared occurrences keep slider visibility and checkbox targets separate while retaining canonical preferences',()=>{
 const f=locatedFixture();f.context.expandedNodeIds=new Set(f.context.homeSettings.official_topic_graph.locations.map(l=>`location:${l.id}`));
 const named=label=>elements(f.render()).filter(n=>n.props['aria-label']===label);
 const before=JSON.stringify(f.context.homeSettings.unified_deck_settings.topic_preference_state.values);
 assert.equal(named('Configure Leaf A New to Mastery balance').length,2);
 named('Configure Leaf A New to Mastery balance')[0].props.onClick();
 assert.equal(f.context.configuredGroupKey,'location:Leaf A');assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props.value,73);
 named('Include Leaf A in Study')[1].props.onChange({currentTarget:{checked:false}});
 assert.deepEqual(f.writes,[['selection','Leaf A',false,'location:alias-a']]);
 assert.equal(f.context.configuredGroupKey,'location:Leaf A'); // A checkbox does not configure another slider.
 named('Configure Leaf A New to Mastery balance')[1].props.onClick();
 assert.equal(f.context.configuredGroupKey,'location:alias-a');assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props.value,73);
 assert.equal(f.writes.length,1);assert.equal(JSON.stringify(f.context.homeSettings.unified_deck_settings.topic_preference_state.values),before);
 const alias=f.context.homeSettings.location_selection.states.find(s=>s.location_id==='alias-a');
 Object.assign(alias,{included:false,direct:true,source_location_id:'alias-a'});
 assert.equal(named('Include Leaf A in Study')[1].props.checked,false);assert.equal(sliders(f).length,0);
 named('Configure Leaf A New to Mastery balance')[0].props.onClick();
 assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props.value,73);assert.equal(named('Include Leaf A in Study')[0].props.checked,true);
});

test('Topic rows retain names and controls without unlabeled counts or selection prose',()=>{
 const f=fixture();
 f.context.branchAvailabilityQuestionCount=id=>({Nursing:142,'Branch A':63,'Branch B':82}[id]??60);
 f.context.getTopicSelectionPresentation=id=>({checked:id!=='Branch B',explicit:id==='Nursing',inherited:id==='Branch A',partial:id==='Nursing'});
 const markup=require('react-dom/server').renderToStaticMarkup(f.render());
 for(const name of ['Nursing','Branch A','Branch B']) assert.ok(markup.includes(`>${name}</button>`));
 const badges=elements(f.render()).filter(n=>n.props.title==='Study-ready questions in this branch');
 assert.equal(badges.length,0);
 assert.doesNotMatch(markup,/>\s*(?:142|63|82)\s*</);
 assert.doesNotMatch(markup,/>[^<]*(?:concepts?|Selected directly|Included by parent|Partially included|Excluded by parent|Excluded)[^<]*</i);
 for(const id of ['Nursing','Branch A','Branch B']) {
  assert.equal(find(f,`Include ${id} in Study`).props['aria-describedby'],undefined);
  assert.equal(find(f,`Configure ${id} New to Mastery balance`).type,'button');
 }
 assert.deepEqual(f.writes,[]);
});
test('Topic checkboxes retain checked, unchecked and indeterminate states without status text',()=>{
 const f=fixture();
 for(const state of [{checked:true,partial:false},{checked:false,partial:false},{checked:false,partial:true}]) {
  f.context.getTopicSelectionPresentation=()=>state;
  const checkbox=find(f,'Include Nursing in Study'),input={indeterminate:false};
  checkbox.props.ref(input);
  assert.equal(checkbox.props.checked,state.checked);
  assert.equal(input.indeterminate,state.partial);
  assert.equal(checkbox.props['aria-checked'],state.partial?'mixed':state.checked);
 }
 assert.deepEqual(f.writes,[]);
});

for(const name of ['Branch A','Leaf A','Nested A','Deep A']) test(`${name}: checked, configure, uncheck, recheck, click name restores the saved slider`,()=>{
 const f=locatedFixture();f.context.expandedNodeIds=new Set(f.context.homeSettings.official_topic_graph.locations.map(l=>`location:${l.id}`));
 const settings=f.context.homeSettings,before=JSON.stringify(settings.unified_deck_settings.topic_preference_state.values);
 find(f,`Configure ${name} New to Mastery balance`).props.onClick();
 assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props.value,73);
 find(f,`Include ${name} in Study`).props.onChange({currentTarget:{checked:false}});
 const state=settings.location_selection.states.find(s=>s.location_id===name);
 Object.assign(state,{included:false,direct:true,source_location_id:name});
 assert.equal(sliders(f).length,0);assert.equal(find(f,`Include ${name} in Study`).props.checked,false);
 find(f,`Include ${name} in Study`).props.onChange({currentTarget:{checked:true}});
 Object.assign(state,{included:true,direct:true,source_location_id:name});
 find(f,`Configure ${name} New to Mastery balance`).props.onClick();
 assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props['aria-label'],`${name} New to Mastery balance`);assert.equal(sliders(f)[0].props.value,73);
 assert.deepEqual(f.writes,[['selection',name,false,`location:${name}`],['selection',name,true,`location:${name}`]]);
 assert.equal(JSON.stringify(settings.unified_deck_settings.topic_preference_state.values),before);
});
