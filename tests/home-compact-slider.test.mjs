import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../components/StudyPlanner.tsx',import.meta.url),'utf8');
const start=source.indexOf('  function renderNode('),end=source.indexOf('  let homeGroups:',start);
const compiled=ts.transpileModule(`export ${source.slice(start,end).trim()}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const node=(id,children=[])=>({id,key:`official:topic:${id}`,source:'official',name:id,children});
const root=node('Nursing',[node('Branch A',[node('Leaf A')]),node('Branch B',[node('Leaf B')])]);
function fixture(){
 const writes=[];
 const context={exports:{},require,configuredGroupKey:root.key,expandedNodeIds:new Set(['Nursing']),expandedPersonalTopicIds:new Set(),
 branchConceptIds:()=>['concept'],libraryAvailabilityQuestionCounts:{concept:4},branchAvailabilityQuestionCount:()=>4,
 getTopicSelectionPresentation:()=>({checked:true,explicit:true,partial:false}),nodes:[],placements:[],selectedNodeIds:new Set(),excludedNodeIds:new Set(),conceptOverrides:{},nodePreferences:{},groupDrafts:{},homeSettings:{},isSaving:false,settingsError:'',isSetupCramMode:false,
 setConfiguredGroupKey:key=>{context.configuredGroupKey=key;},toggleNodeSelection:(...args)=>writes.push(['selection',...args]),persistNodePreference:(...args)=>writes.push(['preference',...args]),
 setNodePreferences:fn=>{context.nodePreferences=fn(context.nodePreferences);},toggleExpandedNode:id=>{const s=context.expandedNodeIds;if(s.has(id))s.delete(id);else s.add(id);}};
 vm.createContext(context);vm.runInContext(compiled,context);
 const render=()=>context.exports.renderNode(root);
 return {context,writes,render};
}
function elements(tree){const result=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'&&n.props){result.push(n);walk(n.props.children);}}walk(tree);return result;}
const find=(f,label)=>elements(f.render()).find(n=>n.props['aria-label']===label);
const sliders=f=>elements(f.render()).filter(n=>n.props.type==='range');
test('only active Topic slider renders beneath compact row and before immediate children',()=>{
 const f=fixture(),tree=f.render();assert.equal(sliders(f).length,1);assert.equal(sliders(f)[0].props.value,50);
 const children=tree.props.children;const row=children.find(n=>n?.props?.style?.minHeight===62);assert.ok(row);assert.equal(elements(row).filter(n=>n.props.type==='range').length,0);
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
test('slider retains saved value, original persistence handlers and Cram disabling',()=>{
 const f=fixture();f.context.nodePreferences={Nursing:73};assert.equal(sliders(f)[0].props.value,73);
 sliders(f)[0].props.onChange({target:{value:'31'}});assert.equal(sliders(f)[0].props.value,31);assert.deepEqual(f.writes,[]);
 sliders(f)[0].props.onPointerUp({currentTarget:{value:'31'}});assert.deepEqual(f.writes,[['preference','Nursing',31]]);
 f.context.isSetupCramMode=true;assert.equal(sliders(f)[0].props.disabled,true);
});
test('eligibility remains separate and inherited rows do not gain unsupported preference writes',()=>{
 const f=fixture();find(f,'Include Branch A in Study').props.onChange({currentTarget:{checked:false}});assert.deepEqual(f.writes,[['selection','Branch A',false]]);
 f.context.getTopicSelectionPresentation=()=>({checked:true,explicit:false,inherited:true,partial:false});assert.equal(sliders(f).length,0);
});

test('Topic rows retain names and right-side counts without concept-count or selection prose',()=>{
 const f=fixture();
 f.context.branchAvailabilityQuestionCount=id=>({Nursing:142,'Branch A':63,'Branch B':82}[id]??60);
 f.context.getTopicSelectionPresentation=id=>({checked:id!=='Branch B',explicit:id==='Nursing',inherited:id==='Branch A',partial:id==='Nursing'});
 const markup=require('react-dom/server').renderToStaticMarkup(f.render());
 for(const name of ['Nursing','Branch A','Branch B']) assert.ok(markup.includes(`>${name}</button>`));
 const badges=elements(f.render()).filter(n=>n.props.title==='Study-ready questions in this branch');
 assert.deepEqual(badges.map(n=>n.props.children),[142,63,82]);
 assert.doesNotMatch(markup,/>[^<]*(?:concepts?|Selected directly|Included by parent|Partially included|Excluded by parent|Excluded)[^<]*</i);
 for(const id of ['Nursing','Branch A','Branch B']) assert.equal(find(f,`Include ${id} in Study`).props['aria-describedby'],undefined);
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
