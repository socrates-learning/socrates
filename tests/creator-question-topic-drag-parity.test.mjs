import test from 'node:test';
import assert from 'node:assert/strict';
import {editor, nodes, expandChrome, settle, question} from './fixtures/creator-question-workflow.mjs';
import {readFileSync} from 'node:fs';
import {planTopicPosition} from '../lib/creator-topic-positioning.ts';
for(const outcome of ['success','denied','stale','readback-failure']) test(`Questions structural ${outcome} preserves dirty editor`, async () => {
 const h=editor({response:(name)=>name==='position_library_node_in_library'?{data:{},error:outcome==='denied'?{code:'42501'}:outcome==='stale'?{code:'PT409'}:null}:undefined,readResponse:table=>table==='library_nodes'?{data:[{id:'root',name:'Root',parent_id:null,sort_order:0},{id:'a',name:'A',parent_id:'root',sort_order:1},{id:'b',name:'B',parent_id:'root',sort_order:0}],error:outcome==='readback-failure'?{message:'offline'}:null}:undefined});
 h.props.initialTopics=[{id:'root',name:'Root',children:[{id:'a',name:'A',children:[]},{id:'b',name:'B',children:[]}]}];
 let e=h.render();e.setActiveCreatorTab('questions');e.setQuestionConceptsByTopicId({a:[{id:'primary',name:'Primary'}]});e.selectQuestionConcept('primary','a');e=h.render();e.setQuestionPrompt('DIRTY question');e.setQuestionAnswer('DIRTY answer');e.setQuestionRelatedConceptIds(['related']);e.setQuestionTestingAngle('Safety');e.setQuestionAdditionalTestingAngles(['Priority']);e.setQuestionTags([{id:'tag',name:'Tag'}]);e=h.render();
 const keys=['questionPrompt','questionAnswer','questionId','primaryQuestionConceptId','questionRelatedConceptIds','questionTestingAngle','questionAdditionalTestingAngles','questionTags','isQuestionDirty','questionConceptId','questionTopicId','questionEditorState'];
 const snapshot=e=>JSON.stringify(Object.fromEntries(keys.map(k=>[k,e[k]])));
 const before=snapshot(e);const plan=planTopicPosition(e.positioningContext,'official:topic:a','official:topic:b','after');assert.ok(plan&&!plan.noop);await e.positionTopicFromTree(plan);e=h.render();assert.equal(snapshot(e),before);assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'position_library_node_in_library');assert.equal(e.isQuestionDirty,true);
 const expected={success:/Topic moved/,denied:/permission/,stale:/refreshed; try/, 'readback-failure':/moved, but the tree could not be refreshed/};
 assert.match(e.questionStatus.message,expected[outcome]);
 assert.equal(e.questionStatus.tone,outcome==='success'?'success':outcome==='stale'?'info':'error');
});

for (const role of ['admin', 'editor']) test(`${role}: provider, viewport and handles remain Topic-only`, () => {
 const h=editor({role,placed:true});let e=h.render();e.setActiveCreatorTab('questions');e=h.render();
 const all=nodes(expandChrome(e.tree));const provider=all.find(n=>n.type?.name==='CreatorTopicTreeInteraction');
 assert.ok(provider);assert.equal(provider.props.viewportLabel,'Question Topic Tree');assert.equal(provider.props.onMove,e.positionTopicFromTree);
 const rows=all.filter(n=>n.type?.name==='TopicDropRow');assert.ok(rows.length);
 for(const row of rows){assert.match(row.props.topicKey,/^(official|personal):topic:/);assert.equal(nodes(row).filter(n=>n.type?.name==='TopicDragHandle').length,1);assert.equal(nodes(row).filter(n=>n.props?.['aria-label']?.startsWith('Associate ')).length,0);assert.equal(row.props.draggable,undefined);}
 e.setActiveCreatorTab('content');e=h.render();assert.equal(nodes(e.tree).find(n=>n.type?.name==='CreatorTopicTreeInteraction').props.viewportLabel,undefined);
});

test('saved Question and duplicate Concept associations survive actual placement-loading effects after readback', async()=>{
 const placements=[{library_node_id:'a',concepts:{id:'primary',name:'Primary'}},{library_node_id:'b',concepts:{id:'primary',name:'Primary'}},{library_node_id:'b',concepts:{id:'related',name:'Related'}}];
 const h=editor({response:name=>name==='position_library_node_in_library'?{data:{},error:null}:undefined,readResponse:table=>({data:table==='library_nodes'?[{id:'root',name:'Root',parent_id:null,sort_order:0},{id:'a',name:'A',parent_id:'root',sort_order:1},{id:'b',name:'B',parent_id:'root',sort_order:0}]:table==='concept_placements'?placements:[],error:null})});
 h.props.initialTopics=[{id:'root',name:'Root',children:[{id:'a',name:'A',children:[]},{id:'b',name:'B',children:[]}]}];
 let e=h.render();e.setActiveCreatorTab('questions');e.setQuestionConceptsByTopicId({a:[{id:'primary',name:'Primary'}],b:[{id:'primary',name:'Primary'},{id:'related',name:'Related'}]});e=h.render();e.selectExistingQuestion(question());e=h.render();e.browseQuestionConcept('primary','a');e.setQuestionAnswer('Unsaved answer');e=h.render();
 const before=JSON.stringify([e.questionId,e.questionEditorState,e.primaryQuestionConceptId,e.questionRelatedConceptIds,e.questionAnswer,e.questionConceptId,e.isQuestionDirty]);
 await e.positionTopicFromTree(planTopicPosition(e.positioningContext,'official:topic:a','official:topic:b','after'));e=h.render();
 h.runEffect('async function loadQuestionConceptPlacements');await settle();e=h.render();h.runEffect('setQuestionConceptOptions(options)');e=h.render();
 assert.equal(JSON.stringify([e.questionId,e.questionEditorState,e.primaryQuestionConceptId,e.questionRelatedConceptIds,e.questionAnswer,e.questionConceptId,e.isQuestionDirty]),before);
 for (const id of ['a','b']) e.renderConceptCountControl({id,key:`official:topic:${id}`,source:'official',name:id,children:[]}, 'questions').props.onClick({stopPropagation() {}});e=h.render();
 const controls=nodes(expandChrome(e.tree)).filter(n=>n.props?.['aria-label']==='Associate Primary with Question');assert.equal(controls.length,2);assert.ok(controls.every(n=>n.props.checked&&n.props.disabled));
 assert.equal(h.calls.filter(c=>c.name?.startsWith('save_')).length,0);
});


test('both canonical Creator route boundaries remount by Library identity', () => {
 for (const route of ['new', '[id]']) {
  const source=readFileSync(new URL(`../app/creator/concepts/${route}/page.tsx`,import.meta.url),'utf8');
  assert.match(source, /<CreatorStudioV2Client\s+key=\{activeLibrary.id\}/);
 }
});

test('Questions viewport option preserves the shared Content default and Topic-only hit testing', () => {
 const source=readFileSync(new URL('../components/CreatorTopicTreeInteraction.tsx',import.meta.url),'utf8');
 assert.match(source,/viewportLabel = 'Topic Tree'/);
 assert.ok(source.includes('CSS.escape(viewportLabel)'));
 assert.ok(source.includes("closest<HTMLElement>('[data-topic-drop-key]')"));
 assert.ok(source.includes('root.current?.contains(row)'));
});

test('Needs Questions filtering never removes hidden siblings from positioning assertions', () => {
 const h=editor();h.props.initialTopics=[{id:'root',name:'Root',children:[{id:'a',name:'A',children:[]},{id:'b',name:'B',children:[]},{id:'c',name:'C',children:[]}]}];
 let e=h.render();e.setActiveCreatorTab('questions');e.setNeedsQuestionsOnly(true);e=h.render();
 const plan=planTopicPosition(e.positioningContext,'official:topic:a','official:topic:c','after');
 assert.deepEqual(Array.from(plan.args.p_expected_source_ids),['a','b','c']);
 assert.deepEqual(Array.from(plan.args.p_expected_destination_ids),['a','b','c']);
});
