import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as model from '../lib/study-goals.ts';
import {loadConceptModule, hookHarness, jsx} from './fixtures/concept-media-authoring.mjs';

const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' && !n.props?.hidden ? [n, ...nodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' || typeof n === 'number' ? String(n) : '';
const settle = () => new Promise(resolve => setImmediate(resolve));
const progress = {total_items:12, covered_items:2, personal_items:3, total_concepts:3, mastered_concepts:1, recent_responses:2, recent_official_responses:1, recent_study_days:1, recent_coverage_gain:2, recent_mastery_cohort:0, observation_days:1, timed_sessions:0, timed_responses:0, seconds_per_response:null};
const goal = {id:'goal', name:'Finals', deadline:'2026-10-01', objective:'coverage', official_topic_ids:['root'], personal_topic_ids:[], revision:2, unavailable_topics:0, progress};
const data = () => ({library_id:'library', today:'2026-10-11', as_of:'2026-10-11T12:00:00Z', mastery_threshold:0.75, topics:[{source:'official', id:'root', name:'Nursing', parent_id:null, path:'Nursing'}, {source:'personal', id:'own', name:'Notes', parent_id:null, path:'My Notes'}], goals:[structuredClone(goal)]});
function setup(handler) {
  const hooks=hookHarness(), calls=[];
  let treeHooks=hookHarness();
  const css={__esModule:true,default:new Proxy({}, {get:(_o,k)=>k})};
  const tree=loadConceptModule('components/study-planner/StudyGoalTopicTree.tsx', {react:{useState:(...args)=>treeHooks.hooks.useState(...args)},'react/jsx-runtime':jsx,'@/lib/study-goals':model,'./StudyGoals.module.css':css});
  const rpc=(name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args))}); return Promise.resolve(handler ? handler(name,args) : {data:data(),error:null});};
  const {StudyGoals}=loadConceptModule('components/study-planner/StudyGoals.tsx', {react:hooks.hooks, 'react/jsx-runtime':jsx, '@/lib/supabase':{supabase:{rpc}}, '@/lib/study-goals':model, './StudyAdvisor':{StudyAdvisor() {}}, './StudyGoalTopicTree':tree, './StudyGoals.module.css':css});
  const mountTree=n=>Array.isArray(n)?n.map(mountTree):n&&typeof n==='object'&&n.props
    ?n.type===tree.StudyGoalTopicTree?treeHooks.render(()=>tree.StudyGoalTopicTree(n.props)):{...n,props:{...n.props,children:mountTree(n.props.children)}}:n;
  const render=()=>{
    const view=hooks.render(()=>StudyGoals({libraryId:'library',requestScope:'learner'}));
    if(!nodes(view).some(n=>n.type===tree.StudyGoalTopicTree))treeHooks=hookHarness();
    return mountTree(view);
  };
  const button=name=>nodes(render()).find(n=>n.type==='button' && text(n)===name);
  const field=label=>nodes(render()).find(n=>n.type==='input'&&(n.props['aria-label']===label||n.props['aria-label']===`${label} (My Topic)`))
    ??nodes(render()).filter(n=>n.type==='label').flatMap(n=>text(n).startsWith(label)?nodes(n).filter(c=>['input','select'].includes(c.type)):[])[0];
  return {hooks,calls,render,button,field,async load(){render();hooks.effects();await settle();return render();}};
}
test('ordinary learner receives goals without privileged calls; coverage and mastery stay distinct and overdue goals visible',async()=>{
 const s=setup();assert.match(text(s.render()),/Loading/);await s.load();const t=text(s.render());
 assert.match(t,/Finals/);assert.match(t,/Overdue/);assert.match(t,/Coverage: 2 \/ 12/);assert.match(t,/Mastery: 1 \/ 3/);assert.match(t,/coverage only/);assert.match(t,/reliable completion date is not available/);
 assert.deepEqual(s.calls,[{name:'get_study_goals',args:{p_library_id:'library'}}]);
});
test('create preserves selections outside search results and sends selected location and personal Topic IDs only',async()=>{
 const s=setup();await s.load();s.button('New goal').props.onClick();
 s.field('Goal name').props.onChange({target:{value:'NCLEX'}});s.field('Deadline').props.onChange({target:{value:'2026-12-01'}});
 s.field('Nursing').props.onChange({target:{checked:true}});s.field('Find Topics').props.onChange({target:{value:'Notes'}});
 assert.equal(s.field('Nursing'),undefined);s.field('My Notes').props.onChange({target:{checked:true}});
 await nodes(s.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(s.calls[1],{name:'save_placement_study_goal',args:{p_library_id:'library',p_name:'NCLEX',p_deadline:'2026-12-01',p_objective:'coverage',p_official_location_ids:['root'],p_personal_topic_ids:['own'],p_goal_id:null,p_expected_revision:null}});
 assert.equal(s.calls[2].name,'get_study_goals');assert.match(text(s.render()),/Goal saved/);assert.equal(nodes(s.render()).filter(n=>n.type==='form').length,0);
});
test('editing deadline/objective retains optimistic revision and associations; opening/cancel does not write',async()=>{
 const s=setup();await s.load();s.button('Edit Finals').props.onClick();s.button('Cancel').props.onClick();assert.equal(s.calls.length,1);
 s.button('Edit Finals').props.onClick();s.field('Deadline').props.onChange({target:{value:'2026-11-01'}});s.field('Completion objective').props.onChange({target:{value:'mastery'}});
 await nodes(s.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(s.calls[1].args.p_goal_id,'goal');assert.equal(s.calls[1].args.p_expected_revision,2);assert.equal(s.calls[1].args.p_deadline,'2026-11-01');assert.equal(s.calls[1].args.p_objective,'mastery');assert.deepEqual(s.calls[1].args.p_official_location_ids,['root']);
});
test('remove requires explicit inline confirmation and only calls goal deletion; cancel preserves goal',async()=>{
 const s=setup();await s.load();s.button('Remove Finals').props.onClick();assert.equal(s.calls.length,1);assert.match(text(s.render()),/Learning history will stay intact/);
 s.button('Keep goal').props.onClick();assert.equal(s.button('Confirm removal'),undefined);
 s.button('Remove Finals').props.onClick();s.button('Confirm removal').props.onClick();await settle();
 assert.deepEqual(s.calls[1],{name:'delete_study_goal',args:{p_library_id:'library',p_goal_id:'goal',p_expected_revision:2}});assert.match(text(s.render()),/learning history is preserved/);
 assert.ok(s.calls.every(c=>['get_study_goals','delete_study_goal'].includes(c.name)));
});
test('failed read is an error, not zero progress; Retry restores authoritative data',async()=>{
 let fail=true;const s=setup(()=>fail?{data:null,error:{message:'Read unavailable'}}:{data:data(),error:null});await s.load();
 assert.match(text(s.render()),/Read unavailable/);assert.doesNotMatch(text(s.render()),/No goals yet/);assert.equal(s.button('New goal').props.disabled,true);
 fail=false;s.button('Retry / refresh goals').props.onClick();await settle();assert.match(text(s.render()),/Finals/);assert.doesNotMatch(text(s.render()),/Read unavailable/);
});
test('stale-save conflict retains the complete unsaved goal form and does not report success',async()=>{
 const s=setup(name=>name==='save_placement_study_goal'?{data:null,error:{message:'Goal changed. Reload before saving.',code:'40001'}}:{data:data(),error:null});await s.load();s.button('Edit Finals').props.onClick();s.field('Goal name').props.onChange({target:{value:'Keep my draft'}});
 await nodes(s.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.match(text(s.render()),/Reload before saving/);assert.equal(s.field('Goal name').props.value,'Keep my draft');assert.doesNotMatch(text(s.render()),/Goal saved/);
});
test('out-of-order refresh and unmounted reads never install obsolete goals',async()=>{
 const pending=[];const s=setup(()=>new Promise(resolve=>pending.push(resolve)));s.render();s.hooks.effects();
 pending.shift()({data:data(),error:null});await settle();s.button('Refresh progress').props.onClick();const older=pending.shift();
 s.button('Refresh progress').props.onClick();const newer=pending.shift();const latest=data();latest.goals[0].name='Latest';newer({data:latest,error:null});await settle();older({data:data(),error:null});await settle();assert.match(text(s.render()),/Latest/);assert.doesNotMatch(text(s.render()),/Finals/);
 s.button('Refresh progress').props.onClick();s.hooks.cleanup();pending.shift()({data:data(),error:null});await settle();assert.match(text(s.render()),/Latest/);
});
test('empty/unavailable scopes do not present false completion; no topic selection disables Save',async()=>{
 const d=data();d.goals[0].unavailable_topics=1;d.goals[0].progress={...progress,total_items:0,covered_items:0,total_concepts:0,mastered_concepts:0};
 const s=setup(()=>({data:d,error:null}));await s.load();assert.match(text(s.render()),/Scope needs attention/);assert.match(text(s.render()),/not marked complete/);
 s.button('New goal').props.onClick();s.field('Goal name').props.onChange({target:{value:'Quiz'}});assert.equal(s.button('Save goal').props.disabled,true);
});
test('Stats integration is additive, lazy, Progress-only and remounts on actor or Library changes',()=>{
 const source=readFileSync(new URL('../components/StudyPlanner.tsx',import.meta.url),'utf8');
 assert.match(source,/const StudyGoals = dynamic\(\(\) => import\('\.\/study-planner\/StudyGoals'\)/);
 assert.ok(source.includes('{statsTab === \'progress\' && userId && <StudyGoals key={`${userId}:${activeLibrary.id}`} libraryId={activeLibrary.id} requestScope={userId} />}'));
});


test('a shared Topic goal saves only the chosen location, not every canonical appearance',async()=>{
 const d=data();d.topics.push({source:'official',id:'shared-alias',topic_id:'canonical-shared',name:'Shared',parent_id:'root',path:'Critical Care › Shared'});
 const s=setup(()=>({data:d,error:null}));await s.load();s.button('New goal').props.onClick();
 s.field('Goal name').props.onChange({target:{value:'Branch-specific goal'}});
 s.field('Critical Care › Shared').props.onChange({target:{checked:true}});
 await nodes(s.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(s.calls[1].args.p_official_location_ids,['shared-alias']);
 assert.equal(s.calls[1].args.p_official_topic_ids,undefined);
});
