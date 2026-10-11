import test from 'node:test';
import assert from 'node:assert/strict';
import {graphFixture} from './fixtures/shared-topic-branches.mjs';
import {topicOccurrencePath,descendantOccurrenceKey,requireTopicGraph,indexTopicGraph,topicDescendantIds,topicGraphOccurrences,effectiveGraphTopicIds,originalTopicOccurrenceKey} from '../lib/topic-placement-graph.ts';
import {buildConceptTopicTree,collectConceptTopicSearchIds} from '../lib/concept-topic-tree.ts';
import {composeUnifiedCreatorTopicTree,flattenUnifiedCreatorTopics} from '../lib/creator-unified-topic-tree.ts';
import {composeHomeGroups} from '../lib/home-deck-settings.ts';

test('graph validates Library, canonical identity, unique incoming edges and cycles',()=>{
 const g=graphFixture();assert.equal(requireTopicGraph(g,'library'),g);
 assert.throws(()=>requireTopicGraph(g,'other'));
 for(const mutate of [x=>x.edges.push({...x.edges[0]}),x=>x.edges.push({edge_key:'placement:cycle',parent_id:'child',topic_id:'a',kind:'placement',sort_order:0}),x=>x.nodes[2].library_id='other',x=>x.edges.splice(0,1)]) {
  const bad=structuredClone(g);mutate(bad);assert.throws(()=>indexTopicGraph(bad));
 }
});
test('canonical reachability is unique while occurrences retain independent full paths',()=>{
 const g=graphFixture(),root=topicGraphOccurrences(g)[0],a=root.children[0].children[0],b=root.children[1].children[0];
 assert.equal(a.id,b.id);assert.notEqual(a.occurrenceKey,b.occurrenceKey);assert.notEqual(a.children[0].occurrenceKey,b.children[0].occurrenceKey);
 assert.equal(a.originalPath,true);assert.equal(b.originalPath,false);assert.deepEqual([...indexTopicGraph(g).shared].sort(),['child','t']);
 assert.equal(topicDescendantIds(g,'root').size,5);assert.equal(originalTopicOccurrenceKey(g,'t'),a.occurrenceKey);
 assert.deepEqual([...collectConceptTopicSearchIds(buildConceptTopicTree(g.nodes,true,g),'child')].sort(),['a','b','child','root','t']);
});
test('inclusive selection retains independent shared seeds and ignores only shared exclusions',()=>{
 const g=graphFixture();
 const effective=(s,e=[])=>[...effectiveGraphTopicIds(g,new Set(s),new Set(e))].sort();
 assert.deepEqual(effective(['a']),['a','child','t']);assert.deepEqual(effective(['b'],['t']),['b','child','t']);
 assert.deepEqual(effective(['a','b'],['a']),['b','child','t']);assert.deepEqual(effective(['t']),['child','t']);
 assert.deepEqual(effective([],['t']),[]);assert.deepEqual(effective(['root'],['a','b']),['root']);
});
test('personal branch remains only under the original occurrence, with source-qualified collisions',()=>{
 const g=graphFixture(),p={id:'t',name:'personal',parent_id:null,sort_order:0,owner_id:'owner'},place={personal_topic_id:'t',library_node_id:'t',owner_id:'owner'};
 const tree=composeUnifiedCreatorTopicTree({officialTopics:buildConceptTopicTree(g.nodes,true,g),ownerId:'owner',personalTopics:[p],topicPlacements:[place]});
 const root=tree.officialRoots[0],a=root.children[0].children[0],b=root.children[1].children[0];
 assert.equal(a.children.filter(n=>n.source==='personal').length,1);assert.equal(b.children.filter(n=>n.source==='personal').length,0);
 assert.equal(flattenUnifiedCreatorTopics([root]).length,6);
 const home=composeHomeGroups(g.nodes,[p],[place],[],g)[0];
 assert.equal(home.children[0].children[0].children.filter(n=>n.source==='personal').length,1);
 assert.equal(home.children[1].children[0].children.filter(n=>n.source==='personal').length,0);
 assert.throws(()=>composeHomeGroups(g.nodes,[p],[{...place,library_node_id:'missing'}],[],g));
});
test('layered diamond graphs stay bounded without a path cap or eager occurrence expansion',()=>{
 const g={version:122,library_id:'library',revision:'b'.repeat(32),root_id:'root',nodes:[{id:'root',name:'root',parent_id:null,sort_order:0}],edges:[]};
 let parents=['root'];
 for(let level=0;level<24;level++) {
  const current=[`a${level}`,`b${level}`];
  for(const id of current) {g.nodes.push({id,name:id,parent_id:parents[0],sort_order:0});parents.forEach((parent,i)=>g.edges.push({edge_key:i?`placement:${parent}-${id}`:`primary:${id}`,parent_id:parent,topic_id:id,kind:i?'placement':'primary',sort_order:0}));} parents=current;
 }
 const start=performance.now();assert.equal(topicDescendantIds(g,'root').size,49);
 const tree=composeUnifiedCreatorTopicTree({officialTopics:buildConceptTopicTree(g.nodes,true,g),ownerId:'owner',personalTopics:[],topicPlacements:[]});
 assert.equal(flattenUnifiedCreatorTopics(tree.officialRoots).length,49);assert.ok(performance.now()-start<1000);
});

test('clicked occurrence context follows real incoming edges and rejects stale paths',()=>{
 const g=graphFixture(), alias='primary:root/primary:b/placement:alias';
 assert.deepEqual(topicOccurrencePath(g,alias).map(n=>n.id),['root','b','t']);
 assert.equal(descendantOccurrenceKey(g,alias,'child'),alias+'/primary:child');
 assert.equal(descendantOccurrenceKey(g,alias,'a'),null);
 assert.equal(topicOccurrencePath(g,'primary:root/placement:alias'),null);
 assert.equal(topicOccurrencePath(g,alias.replace('placement:alias','placement:deleted')),null);
});
