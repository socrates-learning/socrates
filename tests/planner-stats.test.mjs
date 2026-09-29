import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const jsx=(type,props,key)=>({type,props:props||{},key});
function compile(source,bindings={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,...bindings,require(name){
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  throw Error(`Unexpected presentation dependency: ${name}`);
 }});return exports;
}
function block(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`Missing ordered boundary: ${start}`);return source.slice(a,b);}
function expand(n){if(Array.isArray(n))return n.map(expand);if(!n||typeof n!=='object')return n;if(typeof n.type==='function')return expand(n.type(n.props));return {...n,props:{...n.props,children:expand(n.props.children)}};}
function all(n,p){if(Array.isArray(n))return n.flatMap(x=>all(x,p));if(!n||typeof n!=='object')return [];return [...(p(n)?[n]:[]),...all(n.props?.children,p)];}
function digest(n){function norm(x){if(typeof x==='function')return '[callback]';if(Array.isArray(x))return x.filter(v=>v!==null&&v!==undefined&&v!==false).map(norm);if(!x||typeof x!=='object')return x;return Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,norm(x[k])]));}return createHash('sha256').update(JSON.stringify(norm(expand(n)))).digest('hex');}
class FixtureDate extends Date {toLocaleString(){return `fixture-date:${this.toISOString()}`;}}
const noop=()=>{};
const zero={total_concepts:0,assessed_concepts:0,unseen_concepts:0,assessed_mastery_percent:null,coverage_adjusted_progress_percent:0,evidence_count:0,questions_answered:0};
const metric={...zero,total_concepts:6,assessed_concepts:2,unseen_concepts:4,assessed_mastery_percent:62.6,coverage_adjusted_progress_percent:20.6,questions_answered:9};
const nodes=[{id:'root',name:'Nursing',parent_id:null,node_type:null},{id:'z',name:'Zebra',parent_id:'root',node_type:null},{id:'a',name:'Alpha',parent_id:'root',node_type:null},{id:'deep',name:'Nested',parent_id:'a',node_type:null}];
const sessions=[{id:'s2',study_deck_id:null,deck_name:null,started_at:'2026-09-28T14:00:00Z',ended_at:null,answered_count:0},{id:'s1',study_deck_id:'d',deck_name:'One',started_at:'2026-09-27T12:00:00Z',ended_at:'2026-09-27T12:01:00Z',answered_count:1},{id:'s3',study_deck_id:'d',deck_name:'Many',started_at:'2026-09-26T12:00:00Z',ended_at:null,answered_count:7}];
function fixture(role='learner',tab='progress',patch={}){return {role,tab,libraryName:'Fixture Library',progress:{library_id:'library',summary:{...metric,recent_session_count:3},nodes:[],recent_sessions:sessions},progressError:'',nodes,rootNodes:[nodes[0]],progressByNodeId:new Map([['root',metric],['a',{...metric,assessed_mastery_percent:0}]]),fallbackProgressMetric:zero,expandedNodeIds:new Set(['root','a']),onToggleNode:noop,onTabChange:noop,...patch};}
function cases(){const result={};for(const role of ['learner','editor','admin'])for(const tab of ['progress','history','algorithm'])result[`${role}:${tab}`]=fixture(role,tab);result['collapsed']=fixture('learner','progress',{expandedNodeIds:new Set()});result['error']=fixture('learner','progress',{progressError:'Fixture progress error'});result['empty-progress']=fixture('learner','progress',{rootNodes:[],progress:{library_id:'library',summary:{...zero,recent_session_count:0},nodes:[],recent_sessions:[]}});result['empty-history']=fixture('learner','history',{progress:{library_id:'library',summary:{...zero,recent_session_count:0},nodes:[],recent_sessions:[]},progressError:'Fixture progress error'});return result;}

const planner=readFileSync(new URL('../components/StudyPlanner.tsx',import.meta.url),'utf8');
const stats=readFileSync(new URL('../components/study-planner/PlannerStats.tsx',import.meta.url),'utf8');
const {PlannerStats}=compile(stats,{Date:FixtureDate});
function render(f){
 const panel=block(planner,"algorithmPanel={",'\n            />').slice('algorithmPanel={'.length,-1);
 const algorithmPanel=compile('export function panel(){return ('+panel+');}',{statsTab:f.tab,canViewAlgorithmDiagnostics:f.role==='editor'||f.role==='admin',activeLibrary:{id:'library'},userId:'fixture-user',CreatorAlgorithmDiagnostics:'Diagnostics'}).panel();
 return PlannerStats({...f,activeTab:f.tab,showAlgorithmTab:f.role==='editor'||f.role==='admin',algorithmPanel});
}
// Frozen from release 845a388 before extraction, using fixed date formatting.
const baseline = {
  "learner:progress": "5d935f9bfe3baad48f3e5668926a54791856cf23ecbf629a9b13368aa9607a92",
  "learner:history": "fa55d3809283e881cf8bd7acc23f2bf9f72fa2fb0560aab33bea763e5e6bc4d5",
  "learner:algorithm": "99cbb890c9405c16a814c7d205d177013b6a7e8d2f3e7e744eef04697905c0d6",
  "editor:progress": "d9770da0cf6925987e0dc0dacebcbc5dcce7bde85644a97cd75c3239dc3873d4",
  "editor:history": "cfbad604c5d3b96f9425df9f017bfe60779104973f59b346044ad8ec3c866fec",
  "editor:algorithm": "bd25f0206a7288ca9f25254ab9986752d72fcdd1060aed1910e3fd77be8e6029",
  "admin:progress": "d9770da0cf6925987e0dc0dacebcbc5dcce7bde85644a97cd75c3239dc3873d4",
  "admin:history": "cfbad604c5d3b96f9425df9f017bfe60779104973f59b346044ad8ec3c866fec",
  "admin:algorithm": "bd25f0206a7288ca9f25254ab9986752d72fcdd1060aed1910e3fd77be8e6029",
  "collapsed": "e6e5d8f03f7cda84df1741a311ab4f9e9423ca307631a02b34ee7e33ee93742d",
  "error": "ad9a0d88ff53180bafa0dfe4132edb6d5f0050fe9231339d39c8185edc6349da",
  "empty-progress": "b6eac7f2df899db0cc0deeade75acf9569ad0c34247d911f0bd7c2889da495f8",
  "empty-history": "ea4df1da8bfdd878ffbbbe63738fa6df02fe7514f858920ac22377216218a416"
}
;
for(const [name,f] of Object.entries(cases()))test(`released Stats rendering: ${name}`,()=>assert.equal(digest(render(f)),baseline[name]));
test('tabs and expansion dispatch once without invoking callbacks during render',()=>{
 const tabs=[],toggles=[];const f=fixture('admin','progress',{onTabChange:t=>tabs.push(t),onToggleNode:id=>toggles.push(id)});
 const tree=expand(render(f));assert.deepEqual(tabs,[]);assert.deepEqual(toggles,[]);
 const buttons=all(tree,n=>n.type==='button'&&n.props.role==='tab');assert.deepEqual(buttons.map(n=>n.props.children),['Progress','Study History','Algorithm']);
 buttons.forEach(n=>n.props.onClick());assert.deepEqual(tabs,['progress','history','algorithm']);
 const root=all(tree,n=>n.type==='button'&&n.props['aria-label']==='Collapse Nursing')[0];root.props.onClick();assert.deepEqual(toggles,['root']);
 assert.deepEqual([...f.expandedNodeIds],['root','a']);
});
test('alphabetical recursion, fallback, rounding, indentation and leaves retain exact output',()=>{
 const tree=expand(render(fixture()));
 assert.deepEqual(all(tree,n=>n.props.className==='home-v2-topic-name').map(n=>n.props.children),['Nursing','Alpha','Nested','Zebra']);
 assert.deepEqual(all(tree,n=>n.props.className==='home-v2-tree-row').map(n=>n.props.style.paddingLeft),[10,44,78,44]);
 assert.deepEqual(all(tree,n=>n.props.className==='home-v2-percent').map(n=>n.props.children[0]),[21,21,0,0]);
 assert.equal(all(tree,n=>n.type==='button'&&n.props.disabled===true).length,2);
 const f=fixture();f.expandedNodeIds=new Set(['a']);assert.equal(all(expand(render(f)),n=>n.props.className==='home-v2-tree-row').length,1);
 f.expandedNodeIds=new Set(['a','root']);assert.equal(all(expand(render(f)),n=>n.props.className==='home-v2-tree-row').length,4);
});
test('History keeps server order, dates, missing names and response/completion wording',()=>{
 const tree=expand(render(fixture('learner','history')));const rows=all(tree,n=>n.type==='article');assert.deepEqual(rows.map(n=>n.key),['s2','s1','s3']);
 const dates=all(tree,n=>n.type==='time');assert.deepEqual(dates.map(n=>n.props.dateTime),sessions.map(n=>n.started_at));assert.ok(dates.every(n=>n.props.suppressHydrationWarning));
 assert.deepEqual(all(tree,n=>n.type==='strong').map(n=>n.props.children),['Study Session','One','Many']);
 assert.deepEqual(all(tree,n=>n.type==='small').map(n=>n.props.children),['In progress','Completed','In progress']);
 assert.deepEqual(all(tree,n=>n.type==='span'&&Array.isArray(n.props.children)).map(n=>Array.from(n.props.children)),[[0,' ','responses'],[1,' ','response'],[7,' ','responses']]);
});
test('parent tab changes preserve authority/hash behavior and make no progress request',()=>{
 const source='export '+block(planner,'function openStatsTab(', '  async function ensureStudySessionWithCandidate(');
 for(const allowed of [false,true]){const calls=[];const state={location:{hash:'#stats'},history:{pushState:(_a,_b,h)=>calls.push(['hash',h])}};
 const open=compile(source,{canViewAlgorithmDiagnostics:allowed,setStatsTab:t=>calls.push(['tab',t]),setMode:m=>calls.push(['mode',m]),window:state,statsTabHashes:{progress:'#stats',history:'#stats-history',algorithm:'#stats-algorithm'}}).openStatsTab;
 open('algorithm');assert.equal(calls.length,allowed?3:0);calls.length=0;open('progress');assert.deepEqual(calls,[['tab','progress'],['mode','stats']]);}
 assert.doesNotMatch(source,/supabase|refreshLearnerProgress|fetch\(/);
});
test('refresh failure retains data; success replaces progress and clears its error',async()=>{
 const source='export '+block(planner,'async function refreshLearnerProgress(', '  async function persistNodePreference(');
 for(const failure of [true,false]){const calls=[];const refresh=compile(source,{activeLibrary:{id:'library'},supabase:{rpc:async(name,args)=>{assert.equal(name,'get_library_learner_progress');assert.equal(args.p_library_id,'library');return failure?{data:null,error:{message:'offline'}}:{data:{marker:'new'},error:null};}},setLearnerProgress:x=>calls.push(['data',x]),setLearnerProgressError:x=>calls.push(['error',x])}).refreshLearnerProgress;
 await refresh();assert.equal(calls.filter(c=>c[0]==='data').length,failure?0:1);assert.equal(calls.at(-1)[1],failure?'Progress could not be loaded: offline':'');}
});
test('Stats remains presentation-only and diagnostics remain parent-owned',()=>{
 assert.doesNotMatch(stats,/\b(?:useEffect|useState|useRef|useRouter|supabase|window|fetch|dynamic)\b/);
 assert.match(planner,/statsTab === 'algorithm' && canViewAlgorithmDiagnostics \? \(/);
 assert.match(planner,/import\('\.\/CreatorAlgorithmDiagnostics'\)/);
 assert.match(planner,/requestScope=\{userId \?\? 'signed-out'\}/);
 assert.match(planner,/mode === 'stats' \? \(/);
 assert.match(planner,/window\.addEventListener\('hashchange', openModeFromHash\)/);
 assert.match(planner,/window\.addEventListener\('popstate', openModeFromHash\)/);
 assert.doesNotMatch(stats,/CreatorAlgorithmDiagnostics|get_creator_algorithm_diagnostics/);
 assert.equal(expand(render(fixture())).type,'fragment');
});
