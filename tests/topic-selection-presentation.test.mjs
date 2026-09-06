import test from 'node:test';
import assert from 'node:assert/strict';
import { getTopicSelectionPresentation as state } from '../lib/topic-selection-presentation.ts';
const nodes = [{id:'root',parent_id:null},{id:'child',parent_id:'root'},{id:'leaf',parent_id:'child'},{id:'other',parent_id:'root'}];
const placements = [{concept_id:'a',library_node_id:'leaf'},{concept_id:'b',library_node_id:'other'}];
const display = (id, ids = [], overrides = {}) => state(id,nodes,placements,new Set(ids),overrides);
test('root selection includes descendants without adding persisted selections', () => {
 const ids = new Set(['root']);
 assert.deepEqual(state('leaf',nodes,placements,ids,{}),{explicit:false,inherited:true,checked:true,partial:false});
 assert.deepEqual([...ids],['root']);
 assert.equal(display('root',['root']).checked,true);
});
test('concept exclusion makes ancestors and affected inherited topic partial', () => {
 for (const id of ['root','child','leaf']) assert.equal(display(id,['root'],{a:'excluded'}).partial,true);
 assert.equal(display('other',['root'],{a:'excluded'}).checked,true);
});
test('selected child leaves root partial and sibling empty', () => {
 assert.equal(display('root',['child']).partial,true);
 assert.equal(display('leaf',['child']).checked,true);
 assert.equal(display('other',['child']).checked,false);
});
test('explicit child remains distinguishable and survives removing parent', () => {
 assert.equal(display('child',['root','child']).explicit,true);
 assert.equal(display('child',['root','child']).inherited,true);
 assert.equal(display('child',['child']).checked,true);
 assert.equal(display('other',['child']).checked,false);
});
test('included concept and multiply placed concepts use effective override semantics', () => {
 assert.equal(display('root',[],{a:'included'}).partial,true);
 const shared=[...placements,{concept_id:'a',library_node_id:'other'}];
 assert.equal(state('leaf',nodes,shared,new Set(['root']),{a:'excluded'}).partial,true);
});
test('empty inherited topics are checked and cycles terminate', () => {
 assert.equal(state('leaf',nodes,[],new Set(['root']),{}).checked,true);
 assert.equal(state('x',[{id:'x',parent_id:'y'},{id:'y',parent_id:'x'}],[],new Set(),{}).checked,false);
});
