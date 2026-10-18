import test from 'node:test';
import assert from 'node:assert/strict';
import { graphFromNodes } from './fixtures/shared-topic-branches.mjs';
import { editor, nodes } from './fixtures/creator-question-workflow.mjs';
import { topicGraphOccurrences, topicDescendantIds, topicOccurrencePath, indexTopicLocations, locationKey } from '../lib/topic-placement-graph.ts';
import { composeHomeGroups, locationSelection, requireHomeSettings } from '../lib/home-deck-settings.ts';
import { buildConceptTopicTree } from '../lib/concept-topic-tree.ts';
import { planTopicPosition } from '../lib/creator-topic-positioning.ts';

function graph() {
  const g=graphFromNodes('library',[
    {id:'root',name:'Library',parent_id:null}, {id:'a',name:'Branch A',parent_id:'root'},
    {id:'b',name:'Branch B',parent_id:'root'}, {id:'shared',name:'Shared Topic',parent_id:'a'},
    {id:'one',name:'Original-only child',parent_id:'shared'}, {id:'two',name:'Other child',parent_id:'b'},
  ]);
  return {...g,version:132,locations:[
    ...g.nodes.map(n=>({id:n.id,library_id:g.library_id,topic_id:n.id,parent_location_id:n.parent_id,sort_order:n.sort_order,is_original:true})),
    {id:'alias',library_id:g.library_id,topic_id:'shared',parent_location_id:'b',sort_order:2,is_original:false},
    {id:'alias-child',library_id:g.library_id,topic_id:'two',parent_location_id:'alias',sort_order:0,is_original:false},
  ]};
}
function fixture(role='admin',response) {
  const g=graph(),h=editor({role,response});h.props.initialTopics=buildConceptTopicTree(g.nodes,true);h.props.initialTopicGraph=g;h.props.initialConcept.placementIds=[];
  return {g,h};
}
test('same Topic has independent children, stable paths and deduplicated canonical descendants',()=>{
  const g=graph(),root=topicGraphOccurrences(g)[0];
  assert.deepEqual([...topicDescendantIds(g,locationKey('shared'))],['shared','one']);
  assert.deepEqual([...topicDescendantIds(g,locationKey('alias'))],['shared','two']);
  assert.equal(root.children[1].children.find(n=>n.id==='shared').children[0].id,'two');
  assert.equal(topicDescendantIds(g,locationKey('root')).size,6);
  assert.deepEqual(topicOccurrencePath(g,locationKey('alias')).map(n=>n.id),['root','b','shared']);
});
test('personal children stay at their original authorized anchor',()=>{
  const g=graph(),root=composeHomeGroups(g.nodes,[{id:'p',name:'Private',parent_id:null,sort_order:0}],[{personal_topic_id:'p',library_node_id:'shared'}],[],g)[0];
  assert.equal(root.children[0].children[0].children.filter(n=>n.source==='personal').length,1);
  assert.equal(root.children[1].children.find(n=>n.id==='shared').children.filter(n=>n.source==='personal').length,0);
});
for (const [label,mutate] of [
  ['cross-Library',g=>{g.locations[1].library_id='foreign';}],
  ['cycle',g=>{g.locations[1].parent_location_id='one';}],
  ['duplicate sibling',g=>{g.locations.push({...g.locations[4],id:'duplicate'});}],
  ['lost original anchor',g=>{g.locations[4].is_original=false;}],
]) test(`invalid ${label} location graph fails closed`,()=>{const g=graph();mutate(g);assert.throws(()=>indexTopicLocations(g));});
test('Home checkboxes distinguish locations and retain mixed descendants',()=>{
  const g=graph(),s={official_topic_graph:g,location_selection:{version:132,graph_revision:g.revision,states:g.locations.map(l=>({location_id:l.id,topic_id:l.topic_id,included:['alias','alias-child'].includes(l.id),direct:l.id==='alias',source_location_id:'alias',distance:0}))}};
  assert.equal(locationSelection({occurrenceKey:locationKey('alias')},s).checked,true);
  assert.equal(locationSelection({occurrenceKey:locationKey('shared')},s).checked,false);
  assert.equal(locationSelection({occurrenceKey:locationKey('b')},s).partial,true);
  assert.throws(()=>requireHomeSettings({...s,unified_deck_settings:{version:109,topic_states:[],included_topic_ids:[],excluded_topic_ids:[],selected_collection_ids:[],topic_preference_state:{library_id:'library'}},personal_topic_preferences:{},personal_collection_preferences:{},location_selection:{...s.location_selection,graph_revision:'stale'}}),/selection/);
});
for(const role of ['admin','editor']) test(`${role} retains per-location Concepts and its authorized placement controls`,async()=>{
  const {h}=fixture(role);let e=h.render();e.setQuestionConceptsByTopicId({shared:[{id:'shared-content',name:'Shared'}],one:[{id:'only-a',name:'A'}],two:[{id:'only-b',name:'B'}]});e.setQuestionPrompt('Unsaved Front');e.setQuestionAnswer('Unsaved Back');e=h.render();
  const root=e.visibleTopicComposition.officialRoots[0],a=root.children[0].children[0],b=root.children[1].children.find(n=>n.id==='shared');
  assert.deepEqual(Array.from(e.conceptsForTopicDisclosure(a),c=>c.id).sort(),['only-a','shared-content']);
  assert.deepEqual(Array.from(e.conceptsForTopicDisclosure(b),c=>c.id).sort(),['only-b','shared-content']);
  const plan=planTopicPosition(e.positioningContext,locationKey('one'),locationKey('b'),'inside');
  if(role==='editor'){assert.equal(plan,null);assert.equal(e.renderPlacementControls(),null);assert.equal(h.calls.length,0);assert.equal(e.questionPrompt,'Unsaved Front');assert.equal(e.questionAnswer,'Unsaved Back');return;}
  assert.equal(plan.rpc,'change_official_topic_location');await e.positionTopicFromTree(plan);e=h.render();
  assert.equal(e.locationRequest.kind,'drop');assert.equal(h.calls.length,0);
  e.setLocationRequest(null);e=h.render();assert.equal(h.calls.length,0);assert.equal(e.questionPrompt,'Unsaved Front');assert.equal(e.questionAnswer,'Unsaved Back');
});
test('confirmed duplicate sends exact location, scope and captured revision; failure retains draft and request',async()=>{
  const {h,g}=fixture('admin',(name)=>name==='change_official_topic_location'?{data:null,error:{message:'The tree changed. Reload.'}}:undefined);
  let e=h.render();e.setQuestionPrompt('Keep draft');e.setLocationRequest({kind:'drop',graph:g,sourceId:'one',destinationId:'b'});e=h.render();
  await e.submitLocationChange({action:'duplicate',scope:'all',sourceId:'one',destinationId:'b',includeChildren:true,beforeId:null});e=h.render();
  const write=h.calls.find(c=>c.name==='change_official_topic_location');assert.equal(write.payload.p_location_id,'one');assert.equal(write.payload.p_scope,'all');assert.equal(write.payload.p_expected_revision,g.revision);
  assert.ok(e.locationRequest);assert.match(e.locationError,/tree changed/);assert.equal(e.questionPrompt,'Keep draft');
});
for(const role of ['learner','editor']) test(`${role} receives no official placement actions and cannot dispatch a forged location request`,async()=>{
  const {h,g}=fixture(role);let e=h.render();assert.equal(e.renderPlacementControls(),null);e.setLocationRequest({kind:'drop',graph:g,sourceId:'one',destinationId:'b'});e=h.render();
  await e.submitLocationChange({action:'duplicate',scope:'this',sourceId:'one',destinationId:'b',includeChildren:false,beforeId:null});assert.equal(h.calls.length,0);
  assert.ok(!nodes(e.tree).some(n=>n.type==='button'&&n.props.children==='Duplicate'));
});

test('personal Topic movement accepts its original official anchor, never a shared alias',()=>{
  const {h}=fixture('learner'),e=h.render();
  const context={...e.positioningContext,nodes:[...e.positioningContext.nodes,{key:'personal:topic:private',id:'private',source:'personal',name:'Private branch',parentKey:null,placementKey:'official:topic:shared',sort_order:0,ownerId:e.positioningContext.ownerId}]};
  assert.equal(planTopicPosition(context,'personal:topic:private',locationKey('alias'),'inside'),null);
  const plan=planTopicPosition(context,'personal:topic:private',locationKey('b'),'inside');
  assert.equal(plan.rpc,'position_personal_topic');
  assert.equal(plan.destinationKey,'official:topic:b');
});
