import { projectIndependentTopicLocations } from './fixtures/independent-topic-locations.mjs';
import { projectStatsProgress } from './fixtures/stats-progress-presentation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as advisor from '../lib/study-advisor.ts';
import * as goalModel from '../lib/study-goals.ts';
import {evidence,goals} from './fixtures/study-advisor.mjs';
import {loadConceptModule,hookHarness,jsx} from './fixtures/concept-media-authoring.mjs';
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'||typeof n==='number'?String(n):'';
const settle=()=>new Promise(r=>setImmediate(r));
function setup(handler=()=>({data:evidence(),error:null})) {
 const hooks=hookHarness(),calls=[];let props={libraryId:'library',requestScope:'learner',goals:goals()};
 const {StudyAdvisor}=loadConceptModule('components/study-planner/StudyAdvisor.tsx',{react:hooks.hooks,'react/jsx-runtime':jsx,'@/lib/supabase':{supabase:{rpc:(name,args)=>{calls.push({name,args});return Promise.resolve(handler(name,args));}}},'@/lib/study-advisor':advisor,'@/lib/study-goals':goalModel,'./StudyGoals.module.css':{__esModule:true,default:new Proxy({},{get:(_o,k)=>k})}});
 const render=()=>hooks.render(()=>StudyAdvisor(props));
 return {hooks,calls,render,text:()=>text(render()),props:patch=>{props={...props,...patch};},button:()=>nodes(render()).find(n=>n.type==='button'),async load(){render();hooks.effects();await settle();return render();}};
}
test('learner Advisor uses only its authorized read and renders observed/why/consider without mutation controls',async()=>{
 const s=setup();await s.load();assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'get_study_advisor');assert.deepEqual(Object.keys(s.calls[0].args),['p_library_id']);assert.match(s.text(),/Observed:/);assert.match(s.text(),/Why it matters:/);assert.match(s.text(),/Consider:/);assert.match(s.text(),/Advisory only/);
 assert.equal(nodes(s.render()).filter(n=>['input','select','form'].includes(n.type)).length,0);assert.equal(nodes(s.render()).filter(n=>n.type==='button').length,1);
});
test('insufficient evidence reports uncertainty, not invented good progress',async()=>{
 const s=setup(()=>({data:evidence([]),error:null}));s.props({goals:null});await s.load();assert.match(s.text(),/No specific recommendation yet/);assert.match(s.text(),/too little recent evidence/);assert.match(s.text(),/deadline advice is withheld/);assert.doesNotMatch(s.text(),/Steady recall/);
});
test('failed reads show an error and Retry without false zero or healthy progress',async()=>{
 let fail=true;const s=setup(()=>fail?{data:null,error:{message:'private internal failure'}}:{data:evidence(),error:null});await s.load();assert.match(s.text(),/could not load/);assert.doesNotMatch(s.text(),/private internal|No specific|Observed:/);
 fail=false;s.button().props.onClick();await s.load();assert.match(s.text(),/Observed:/);assert.doesNotMatch(s.text(),/could not load/);
});
test('wrong actor and Library aggregates fail closed',async()=>{
 for(const patch of [{actor_id:'other'},{library_id:'other'}]){const s=setup(()=>({data:{...evidence(),...patch},error:null}));await s.load();assert.match(s.text(),/could not load/);assert.doesNotMatch(s.text(),/Observed:/);}
});
test('scope change immediately hides old evidence, and stale reads cannot replace the new actor',async()=>{
 const pending=[];const s=setup(()=>new Promise(r=>pending.push(r)));s.render();s.hooks.effects();const old=pending.shift();
 s.props({requestScope:'other',goals:null});s.render();s.hooks.effects();pending.shift()({data:{...evidence([]),actor_id:'other'},error:null});await settle();old({data:evidence(),error:null});await settle();assert.doesNotMatch(s.text(),/Revisit Anatomy|Observed:/);
});
test('late reads after unmount do not install evidence',async()=>{
 let resolve;const s=setup(()=>new Promise(r=>{resolve=r;}));s.render();s.hooks.effects();s.hooks.cleanup();resolve({data:evidence(),error:null});await settle();assert.doesNotMatch(s.text(),/Observed:/);
});
test('Goal refresh reloads evidence and changed goals are recomputed without writing',async()=>{
 const s=setup();await s.load();assert.match(s.text(),/Review the pace for Finals/);
 s.props({goals:{...goals([]),as_of:'2026-10-11T13:00:00Z'}});await s.load();assert.doesNotMatch(s.text(),/Review the pace for Finals/);assert.equal(s.calls.length,2);assert.ok(s.calls.every(c=>c.name==='get_study_advisor'));
});
// Reverse only the two exact presentation hunks approved in 56680ff.
// The existing projections and frozen digest still check every remaining byte.
function projectApprovedGoalTopicTree(source) {
  const hunks = [
  [
    "import { StudyGoalTopicTree } from './StudyGoalTopicTree';\n",
    ""
  ],
  [
    "      <StudyGoalTopicTree topics={data.topics} selected={draft.topics} query={query} busy={busy} onChange={topics => setDraft({ ...draft, topics })} />\n",
    "      <fieldset className={styles.topics}><legend>Topics and subject areas ({draft.topics.length} selected)</legend>\n        {data.topics.filter(t => t.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(t => <label key={topicKey(t)}><input type=\"checkbox\" disabled={busy} checked={draft.topics.includes(topicKey(t))} onChange={e => setDraft({ ...draft, topics: e.target.checked ? [...draft.topics, topicKey(t)] : draft.topics.filter(k => k !== topicKey(t)) })} /><span>{t.path}{t.source === 'personal' ? ' (My Topic)' : ''}</span></label>)}\n        {!data.topics.some(t => t.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>No matching Topics.</p>}\n      </fieldset>\n"
  ]
];
  for (const [approved, previous] of hunks) {
    assert.equal(source.split(approved).length, 2, 'Approved Goal Topic Tree integration must occur exactly once');
    source = source.replace(approved, previous);
  }
  return source;
}
function assertPreservedGoalIntegration(input) {
 let source=projectStatsProgress('components/study-planner/StudyGoals.tsx',projectIndependentTopicLocations('components/study-planner/StudyGoals.tsx',projectApprovedGoalTopicTree(input)));
 for(const [a,b] of [["import { StudyAdvisor } from './StudyAdvisor';\n",''],['return <><section','return <section'],['</section><StudyAdvisor libraryId={libraryId} requestScope={requestScope} goals={loading || error ? null : data} /></>;','</section>;']]){assert.equal(source.split(a).length,2);source=source.replace(a,b);}
 // Original frozen Goal component identity, not a regenerated broad fingerprint.
 assert.equal(createHash('sha256').update(source).digest('hex'),'006a0e9267200159384be8884b753ee0a1efa5d19d70eccf29c9081e0de66086');
}
test('Goal integration preserves original code via only the exact import, fragment, and sibling addition',()=>{
 assertPreservedGoalIntegration(readFileSync(new URL('../components/study-planner/StudyGoals.tsx',import.meta.url),'utf8'));
});

const goalSource = () => readFileSync(new URL('../components/study-planner/StudyGoals.tsx',import.meta.url),'utf8');
for (const [description, before, after] of [
 ['save operation', "supabase.rpc('save_placement_study_goal'", "supabase.rpc('save_study_goal'"],
 ['placement scope', 'p_official_location_ids:', 'p_official_topic_ids:'],
 ['revision safeguard', 'p_expected_revision: draft.revision', 'p_expected_revision: null'],
 ['Advisor evidence guard', 'goals={loading || error ? null : data}', 'goals={data}'],
 ['tree selection binding', 'selected={draft.topics}', 'selected={[]}'],
]) test(`Goal preservation rejects an unrelated change to the ${description}`,()=>{
 const source=goalSource();
 assert.equal(source.split(before).length,2,'Negative probe must change exactly one existing fragment');
 assert.throws(()=>assertPreservedGoalIntegration(source.replace(before,after)));
});
for (const [description, fragment] of [
 ['tree import', "import { StudyGoalTopicTree } from './StudyGoalTopicTree';\n"],
 ['tree rendering', "      <StudyGoalTopicTree topics={data.topics} selected={draft.topics} query={query} busy={busy} onChange={topics => setDraft({ ...draft, topics })} />\n"],
]) test(`Goal preservation rejects a missing or duplicated approved ${description}`,()=>{
 const source=goalSource();
 assert.equal(source.split(fragment).length,2);
 assert.throws(()=>assertPreservedGoalIntegration(source.replace(fragment,'')));
 assert.throws(()=>assertPreservedGoalIntegration(source.replace(fragment,fragment+fragment)));
});
test('Goal preservation rejects changes outside both approved presentation hunks',()=>{
 assert.throws(()=>assertPreservedGoalIntegration(goalSource()+'\n// Unapproved source change\n'));
});
