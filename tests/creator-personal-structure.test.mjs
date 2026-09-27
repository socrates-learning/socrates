import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { movePersonalStructure, personalSiblingIds, refreshPersonalStructure } from '../lib/creator-personal-structure.ts';
const topic = (id, parent_id, sort_order, name = id) => ({ id, owner_id: 'owner', parent_id, sort_order, name });
const original = () => ({ topics: [topic('p', null, 0), topic('q', null, 1), topic('a', 'p', 0), topic('b', 'p', 1)], placements: [] });
function clientFor(finalState, failure = null, refreshFailure = false) {
  const calls = [];
  return { calls,
    rpc: async (name, args) => { calls.push({ name, args }); return { data: { topic_id: args.p_topic_id, destination_ids: ['b'] }, error: failure && { message: failure } }; },
    from: (table) => ({ select: () => ({ eq: async (key, owner) => {
      calls.push({ table, key, owner });
      return { data: table === 'personal_topics' ? finalState.topics : finalState.placements, error: refreshFailure ? { message: 'read failed' } : null };
    } }) }),
  };
}
test('child Move sends exact current parent and complete source/destination assertions, then consumes final group state', async () => {
  const before = original(); const copy = structuredClone(before);
  const final = { topics: before.topics.map(t => t.id === 'b' ? { ...t, parent_id: 'q', sort_order: 0 } : t), placements: [] };
  const c = clientFor(final); const result = await movePersonalStructure(c, before, 'owner', 'b', 'q', null);
  assert.equal(c.calls[0].name, 'position_personal_topic');
  assert.deepEqual(c.calls[0].args, { p_topic_id: 'b', p_expected_parent_id: 'p', p_destination_parent_id: 'q', p_expected_official_node_id: null, p_destination_official_node_id: null, p_before_sibling_id: null, p_expected_source_ids: ['a', 'b'], p_expected_destination_ids: [] });
  assert.deepEqual(result, final); assert.deepEqual(before, copy);
  assert.equal(new Set(result.topics.map(t => t.id)).size, before.topics.length);
});
test('subsequent Move uses refreshed parent and order; moved identity remains an Add Subtopic target', async () => {
  const state = original(); state.topics.find(t => t.id === 'b').parent_id = 'q'; state.topics.find(t => t.id === 'b').sort_order = 0;
  const c = clientFor(state); const result = await movePersonalStructure(c, state, 'owner', 'b', 'p', null);
  assert.equal(c.calls[0].args.p_expected_parent_id, 'q'); assert.deepEqual(c.calls[0].args.p_expected_source_ids, ['b']);
  assert.equal(result.topics.find(t => t.id === 'b').id, 'b');
});
test('same-parent reorder passes the before anchor and identical assertions', async () => {
  const c = clientFor(original()); await movePersonalStructure(c, original(), 'owner', 'b', 'p', null, 'a');
  assert.equal(c.calls[0].args.p_before_sibling_id, 'a'); assert.deepEqual(c.calls[0].args.p_expected_source_ids, c.calls[0].args.p_expected_destination_ids);
});
for (const destination of ['official-next', null]) test(`root relocation to ${destination ?? 'Unplaced'} refreshes Topic ranks and placements`, async () => {
  const state = original(); state.placements = [{ id: 'placement', owner_id: 'owner', personal_topic_id: 'p', library_node_id: 'official-old' }];
  const final = { topics: state.topics.map(t => t.id === 'p' ? { ...t, sort_order: 1 } : t), placements: [] };
  const c = clientFor(final); assert.deepEqual(await movePersonalStructure(c, state, 'owner', 'p', null, destination), final);
  assert.equal(c.calls[0].args.p_expected_official_node_id, 'official-old'); assert.equal(c.calls[0].args.p_destination_official_node_id, destination);
});
test('canonical ordering is null-last, C byte order, UUID fallback and owner scoped', () => {
  const state = { topics: [topic('z','p',null,'A'), topic('b','p',0,'é'), topic('c','p',0,'Z'), topic('a','p',0,'Z'), {...topic('foreign','p',0),owner_id:'other'}], placements: [] };
  assert.deepEqual(personalSiblingIds(state,'owner','p',null),['a','c','b','z']);
});
for (const failure of ['Stale source sequence', 'Stale parent', 'concurrent structural change', 'normalization failure', 'placement failure', 'RPC failure']) test(`${failure}: no refresh or optimistic mutation`, async () => {
  const state=original();const before=structuredClone(state);const c=clientFor(state,failure);
  await assert.rejects(movePersonalStructure(c,state,'owner','b','q',null),new RegExp(failure));
  assert.deepEqual(state,before);assert.equal(c.calls.length,1);
});
test('unauthorized owner is rejected before RPC', async () => {
  const c=clientFor(original());await assert.rejects(movePersonalStructure(c,original(),'other','b','q',null),/signed-in owner/);assert.equal(c.calls.length,0);
});
test('refresh failure is distinguished from failed mutation and does not modify input state', async () => {
  const state=original();const before=structuredClone(state);const c=clientFor(state,null,true);
  await assert.rejects(movePersonalStructure(c,state,'owner','b','q',null),/Topic moved, but the tree could not be refreshed/);assert.deepEqual(state,before);
});
test('refresh rejects unexpected ownership instead of installing foreign state', async () => {
  const state=original();state.topics[0].owner_id='other';await assert.rejects(refreshPersonalStructure(clientFor(state),'owner'),/Unexpected personal Topic owner/);
});
test('canonical UI keeps selection and Add Subtopic context; structural reparent is no longer direct CRUD', () => {
  const source=readFileSync(new URL('../components/CreatorStudioV2Client.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.update\(\{ parent_id: destinationId \}\)/);
  assert.doesNotMatch(source,/\.rpc\('set_personal_topic_official_placement'/);
  assert.match(source,/await movePersonalStructure\([\s\S]*?setPersonalTopics\(refreshed.topics\);[\s\S]*?setActivePersonalTopicId\(activePersonalTopic.id\)/);
  assert.match(source,/parentPersonalTopicId: activePersonalTopic.id/);
  assert.match(source,/\.from\('personal_topics'\)\s*\.update\(\{ name \}\)/);
});
