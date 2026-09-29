import assert from 'node:assert/strict';
import test from 'node:test';
import { editor, nodes } from './fixtures/creator-role-workspaces.mjs';
import { getTopicSelectionPresentation } from '../lib/topic-selection-presentation.ts';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { groupSelection } from '../lib/home-deck-settings.ts';
const topic = { id: 'topic', key: 'official:topic:topic', name: 'Topic', source: 'official', children: [] };
const personal = { id: 'mine-topic', key: 'personal:topic:mine-topic', name: 'Personal Topic', source: 'personal', children: [], parent_id: null };
const snapshot = () => ({ nodes: [{ id: 'topic', parent_id: null }, { id: 'child', parent_id: 'topic' }], placements: [{ concept_id: 'concept', library_node_id: 'child' }], selected_node_ids: [], excluded_node_ids: [], concept_overrides: {}, unified_deck_settings: { version: 109, included_topic_ids: [], excluded_topic_ids: [], selected_collection_ids: [], topic_states: [{ group_key: personal.key, topic_id: personal.id, selected: false, direct: false, inherited: false, excluded: false, partial: false }] }, personal_topic_preferences: {}, personal_collection_preferences: {} });
function ready(h, data = snapshot()) { h.render().setLearnerDeck({ libraryId: 'library', deckId: 'deck', snapshot: data }); return h.render(); }
function tick() { return new Promise(resolve => setImmediate(resolve)); }

test('render and attachment activation never write selection or borrow Concept-assignment state', () => {
 const h = editor({ role: 'learner', placed: true }); let e = ready(h);
 assert.deepEqual([...e.selectedTopicIds], ['topic']);
 assert.equal(e.renderLearnerStudyCheckbox(topic).props.checked, false);
 nodes(e.tree).find(n => n.props?.['aria-label'] === 'Make Topic the active topic').props.onClick();
 e = h.render(); assert.equal(e.standaloneRequest.attachment.topicId, 'topic');
 assert.equal(e.renderLearnerStudyCheckbox(topic).props.checked, false); assert.equal(h.calls.length, 0);
});

test('official checkbox presentation matches Home for direct, inherited, excluded, partial and overrides', () => {
 const h = editor({ role: 'learner' });
 for (const [selected, excluded, overrides] of [[[],[],{}],[['topic'],[],{}],[['topic'],['child'],{}],[['child'],[],{}],[['topic'],[],{concept:'excluded'}],[['child'],['topic'],{}]]) {
  const s = {...snapshot(),selected_node_ids:selected,excluded_node_ids:excluded,concept_overrides:overrides}; const e = ready(h,s);
  for (const id of ['topic','child']) {
   const expected=getTopicSelectionPresentation(id,s.nodes,s.placements,new Set(selected),new Set(excluded),overrides);
   const input=e.renderLearnerStudyCheckbox({...topic,id}).props; const dom={}; input.ref(dom);
   assert.equal(input.checked,expected.checked); assert.equal(dom.indeterminate,expected.partial); assert.equal(input['aria-checked'],expected.partial?'mixed':expected.checked);
  }
 }
});

test('personal selection uses unified state and does not inherit canonical placement', () => {
 const h=editor({role:'learner',placed:true}); const s=snapshot();s.selected_node_ids=['topic'];
 let e=ready(h,s);assert.equal(e.renderLearnerStudyCheckbox(personal).props.checked,false);
 for(const state of [{selected:true,direct:true,inherited:false,excluded:false,partial:false},{selected:true,direct:false,inherited:true,excluded:false,partial:false},{selected:false,direct:false,inherited:false,excluded:true,partial:false},{selected:false,direct:false,inherited:false,excluded:false,partial:true}]) {
  s.unified_deck_settings.topic_states[0]={...s.unified_deck_settings.topic_states[0],...state};e=ready(h,s);
  const expected=groupSelection(personal,s);const actual=e.renderLearnerStudyCheckbox(personal).props;assert.equal(actual.checked,expected.checked);assert.equal(actual['aria-checked'],expected.partial?'mixed':expected.checked);
 }
});

test('official save reads back and reloads without touching saved Card or draft state; duplicate events write once',async()=>{
 const persisted=snapshot();persisted.selected_node_ids=['topic'];let release;
 const h=editor({role:'learner',placed:true,response(name){
  if(name==='set_study_deck_node_selection')return new Promise(r=>{release=r;});
  if(name==='get_home_study_bootstrap')return {data:persisted,error:null};
  if(name==='get_existing_home_study_bootstrap')return {data:{deck:{id:'deck'},bootstrap:persisted},error:null};
  throw Error(name);
 }});
 let e=ready(h);e.setQuestionPrompt('Unsaved Front');e.setQuestionAnswer('Unsaved Back');
 const card={id:'card',owner_id:'owner',concept_id:null,library_node_id:'topic',library_id:'library',personal_topic_id:null,question:'Saved',answer:'Back',created_at:'2026-01-01'};
 e.setStandaloneCards([card]);e=h.render();e.selectExistingQuestion(e.filterPersonalCardsForSearch({ text: '', difficulty: '', primaryTestingAngle: '', additionalTestingAngle: '', primaryConceptId: '', relatedConceptId: '', status: '', tagId: '' }).find(item => item.id === card.id));e=h.render();
 e.setQuestionPrompt('Unsaved Front');e.setQuestionAnswer('Unsaved Back');e=h.render();const attachment=e.standaloneRequest;
 const pending=e.saveLearnerTopicSelection(topic,true);await e.saveLearnerTopicSelection(topic,true);
 assert.equal(h.calls.filter(c=>c.name==='set_study_deck_node_selection').length,1);
 assert.equal(h.render().renderLearnerStudyCheckbox(topic).props.checked,false);
 release({data:{selected_node_ids:['topic'],excluded_node_ids:[]},error:null});await pending;e=h.render();
 assert.equal(e.renderLearnerStudyCheckbox(topic).props.checked,true);assert.equal(e.standaloneRequest,attachment);assert.equal(e.questionPrompt,'Unsaved Front');assert.equal(e.questionAnswer,'Unsaved Back');
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].payload)),{p_deck_id:'deck',p_node_id:'topic',p_should_include:true});
 h.runSelectionEffect();await tick();assert.equal(h.render().renderLearnerStudyCheckbox(topic).props.checked,true);
});

test('personal checkbox uses existing mutation plus authoritative bootstrap, never Concept placement',async()=>{
 const s=snapshot();s.unified_deck_settings.topic_states[0].selected=true;
 const h=editor({role:'learner',response(name){return name==='set_study_deck_personal_topic_selection'?{data:{selected_personal_topic_ids:['mine-topic'],excluded_personal_topic_ids:[]},error:null}:{data:s,error:null};}});
 await ready(h).saveLearnerTopicSelection(personal,true);
 assert.deepEqual(h.calls.map(c=>c.name),['set_study_deck_personal_topic_selection','get_home_study_bootstrap']);
 assert.deepEqual(h.calls[0].payload,{p_deck_id:'deck',p_topic_id:'mine-topic',p_include:true});assert.equal(h.render().renderLearnerStudyCheckbox(personal).props.checked,true);
});

test('failed writes and uncertain readbacks retain confirmed state, display error and block retries',async()=>{
 for(const failReadback of [false,true]){
  const h=editor({role:'learner',response(name){return name==='set_study_deck_node_selection'&&failReadback?{data:{selected_node_ids:['topic'],excluded_node_ids:[]},error:null}:{data:null,error:{message:'Injected failure'}};}});
  await ready(h).saveLearnerTopicSelection(topic,true);const e=h.render();assert.match(e.learnerSelectionError,/Reload Creator/);assert.equal(e.renderLearnerStudyCheckbox(topic).props.checked,false);assert.equal(e.renderLearnerStudyCheckbox(topic).props.disabled,true);
  const count=h.calls.length;await e.saveLearnerTopicSelection(topic,true);assert.equal(h.calls.length,count);
 }
});

test('late save response cannot overwrite a new Library context',async()=>{
 let release;const h=editor({role:'learner',response(name){if(name==='set_study_deck_node_selection')return new Promise(r=>{release=r;});return {data:snapshot(),error:null};}});
 let e=ready(h);const pending=e.saveLearnerTopicSelection(topic,true);e.learnerSelectionContext.current={};h.props.activeLibraryId='other';h.props.creatorCapabilities=deriveCreatorCapabilities({role:'learner',userId:'owner',library:{activeLibraryId:'other',canAccessActiveLibrary:true,canManageActiveLibrary:false}});e.setLearnerDeck({libraryId:'other',deckId:'other-deck',snapshot:snapshot()});
 release({data:{selected_node_ids:['topic'],excluded_node_ids:[]},error:null});await pending;assert.equal(h.render().learnerDeck.libraryId,'other');
});

test('staff rendering and handlers never load or mutate learner deck selection',async()=>{
 for(const role of ['admin','editor']){const h=editor({role});const e=ready(h);h.runSelectionEffect();await e.saveLearnerTopicSelection(topic,true);assert.equal(h.calls.length,0);assert.ok(nodes(e.tree).some(n=>n.props?.['aria-label']==='Assign concept to Topic'));assert.equal(nodes(e.tree).filter(n=>n.props?.['aria-label']==='Include Topic in Study').length,0);}
});

test('structural refresh reads authoritative personal state and discards superseded refreshes',async()=>{
 const data=snapshot();data.unified_deck_settings.topic_states=[];let resolve;
 const h=editor({role:'learner',response(name){assert.equal(name,'get_home_study_bootstrap');return new Promise(r=>{resolve=r;});}});
 ready(h,data);assert.equal(h.render().renderLearnerStudyCheckbox(personal).props.disabled,true);
 const cancel=h.runStructureEffect();cancel();resolve({data:snapshot(),error:null});await tick();
 assert.equal(h.render().renderLearnerStudyCheckbox(personal).props.disabled,true);
 h.runStructureEffect();resolve({data:snapshot(),error:null});await tick();
 assert.equal(h.render().renderLearnerStudyCheckbox(personal).props.disabled,false);
 assert.equal(h.render().renderLearnerStudyCheckbox(personal).props.checked,false);
});

test('structural readback failure remains fail-closed without invented selection',async()=>{
 const h=editor({role:'learner',response(){return {data:null,error:{message:'Refresh failure'}};}});ready(h);h.runStructureEffect();await tick();
 const e=h.render();assert.match(e.learnerSelectionError,/Reload Creator/);assert.equal(e.renderLearnerStudyCheckbox(personal).props.disabled,true);
});
