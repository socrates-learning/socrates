import test from 'node:test';
import assert from 'node:assert/strict';
import {editor,nodes} from './fixtures/creator-question-workflow.mjs';
import {graphFixture} from './fixtures/shared-topic-branches.mjs';
import {buildConceptTopicTree} from '../lib/concept-topic-tree.ts';
import {planTopicPosition} from '../lib/creator-topic-positioning.ts';
import {getTopicSelectionPresentation} from '../lib/topic-selection-presentation.ts';
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}) {
 const g=graphFixture(),h=editor(options);h.props.initialTopics=buildConceptTopicTree(g.nodes,true);h.props.initialTopicGraph=g;h.props.initialConcept.placementIds=[];
 return {h,g};
}
function rows(e){const root=e.visibleTopicComposition.officialRoots[0];return {root,a:root.children[0],b:root.children[1],original:root.children[0].children[0],alias:root.children[1].children[0]};}
function click(e,label,tree=e.tree){const b=nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===label||n.props.children===label));assert.ok(b,label);b.props.onClick();}
for(const role of ['admin','editor']) test(`${role}: occurrences have independent expansion/disclosure while canonical association and count remain shared`,()=>{
 const {h}=fixture({role});let e=h.render();e.setQuestionConceptsByTopicId({t:[{id:'one',name:'Shared concept'}],child:[{id:'one',name:'Shared concept'},{id:'two',name:'Child'}]});e=h.render();const {original,alias}=rows(e);
 assert.equal(e.conceptsForTopicDisclosure(original).length,2);assert.equal(e.conceptsForTopicDisclosure(alias).length,2);
 e.toggleExpanded(alias.occurrenceKey);e=h.render();assert.ok(e.expandedTopicIds.has(alias.occurrenceKey));assert.ok(!e.expandedTopicIds.has(original.occurrenceKey));
 const button=e.renderConceptCountControl(alias,'content');button.props.onClick({stopPropagation(){}});e=h.render();assert.ok(e.contentConceptDisclosureKeys.has(alias.occurrenceKey));assert.ok(!e.contentConceptDisclosureKeys.has(original.occurrenceKey));
 assert.equal(h.calls.length,0);assert.equal(e.isDirty,false);
});
test('shared selection projection distinguishes direct selection from an included parent without inventing exclusion',()=>{
 const g=graphFixture(),p=(s,x=[])=>getTopicSelectionPresentation('t',g.nodes,[],new Set(s),new Set(x),{},g);
 assert.equal(p(['b'],['t']).effective,true);assert.equal(p(['b']).inherited,true);assert.equal(p(['b']).partial,true);
 assert.equal(p(['t']).explicit,true);assert.equal(p(['t']).checked,true);assert.equal(p([]).effective,false);
});
test('moving an alias asserts the incoming edge and complete mixed sibling snapshot',()=>{
 const {h,g}=fixture();const e=h.render();const plan=planTopicPosition(e.positioningContext,'placement:alias','official:topic:a','inside');
 assert.equal(plan,null,'duplicate parent/target pair is invalid');
 const move=planTopicPosition(e.positioningContext,'primary:child','official:topic:b','inside');
 assert.equal(move.rpc,'position_official_topic_placement');assert.equal(move.args.p_edge_key,'primary:child');assert.equal(move.args.p_expected_graph_revision,g.revision);
 assert.deepEqual(plain(move.args.p_expected_destination_edge_keys),['placement:alias']);
 assert.equal(planTopicPosition(e.positioningContext,'placement:alias','official:topic:child','inside'),null,'cycle rejected before RPC');
});
test('Add existing Topic captures graph revision and preserves the dirty Question editor',async()=>{
 let write;const {h,g}=fixture({response:(name,args)=>{if(name==='add_official_topic_placement'){write=args;return {data:g,error:null};}}});
 let e=h.render();e.setActiveCreatorTab('questions');e.setQuestionPrompt('Retain Front');e.setQuestionAnswer('Retain Answer');e.setActiveTopicId('b');e=h.render();
 click(e,'Add existing Topic here',e.renderPlacementControls());e=h.render();e.setPlacementChoice('a');e=h.render();await e.submitPlacementChange();e=h.render();
 assert.equal(write.p_parent_id,'b');assert.equal(write.p_topic_id,'a');assert.equal(write.p_expected_graph_revision,g.revision);
 assert.equal(e.questionPrompt,'Retain Front');assert.equal(e.questionAnswer,'Retain Answer');assert.equal(e.questionId,null);assert.equal(e.isQuestionDirty,true);
});
test('Remove placement uses the selected alias, never permanent deletion or an arbitrary promotion',async()=>{
 const requests=[];const {h}=fixture({response:(name,args)=>{if(name==='remove_official_topic_placement'){requests.push(args);return {data:{},error:null};}}});
 let e=h.render();e.setActiveTopicId('t');e.setActiveTopicEdge('placement:alias');e=h.render();click(e,'Remove this placement',e.renderPlacementControls());e=h.render();await e.submitPlacementChange();
 assert.equal(requests[0].p_edge_key,'placement:alias');assert.equal(requests[0].p_replacement_primary_edge_key,null);
 e=h.render();e.setActiveTopicEdge('primary:t');e=h.render();click(e,'Remove this placement',e.renderPlacementControls());e=h.render();const dialog=e.renderPlacementDialog();
 assert.equal(nodes(dialog).find(n=>n.type==='button'&&n.props.children==='Remove placement').props.disabled,true);
 assert.ok(!h.calls.some(c=>c.name==='delete_official_topic_with_impact'));
});
test('learner cannot obtain placement-management controls',()=>{const {h}=fixture({role:'learner'});assert.equal(h.render().renderPlacementControls(),null);});
test('wrong-Library, failed and out-of-order graph reads cannot replace the confirmed tree',async()=>{
 const pending=[];const {h,g}=fixture({response:(name)=>name==='get_official_topic_graph'?new Promise(resolve=>pending.push(resolve)):undefined});
 let e=h.render();const first=e.reloadRealTopicTree(),second=e.reloadRealTopicTree();
 const newest={...g,revision:'d'.repeat(32)};pending[1]({data:newest,error:null});await second;pending[0]({data:g,error:null});await first;assert.equal(h.render().topicGraph.revision,newest.revision);
 const wrong=h.render().reloadRealTopicTree();pending[2]({data:{...g,library_id:'foreign'},error:null});await assert.rejects(wrong,/Library/);assert.equal(h.render().topicGraph.revision,newest.revision);
 const failed=h.render().reloadRealTopicTree();pending[3]({data:null,error:{message:'offline'}});await assert.rejects(failed,/offline/);assert.equal(h.render().topicGraph.revision,newest.revision);
});
