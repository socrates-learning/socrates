import assert from 'node:assert/strict';
import test from 'node:test';
import { filterLearnerCards, learnerCardTopics, EMPTY_LEARNER_CARD_FILTERS } from '../lib/learner-card-search.ts';
import { moveStandaloneCard, saveStandaloneCard } from '../lib/standalone-custom-cards.ts';

const original = { id: 'card', owner_id: 'owner', concept_id: null, library_node_id: 'official', library_id: 'library', personal_topic_id: null,
  question: '**Front**', answer: '## Back', source_reference: 'Reference', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' };
function store() {
  let row = { ...original }, failure = null, loseAcknowledgement = false;
  const writes = [];
  return { writes, get row() { return row; }, set row(value) { row = value; }, fail(value) { failure = value; }, loseNextAcknowledgement() { loseAcknowledgement = true; }, from(table) {
    assert.equal(table, 'personal_cards'); let payload; const filters = [];
    const q = { update(value) { payload = value; return q; }, eq(key, value) { filters.push([key, value]); return q; },
      is(key, value) { filters.push([key, value]); return q; }, select() { return q; }, async single() {
        writes.push({ payload, filters }); if (failure) return { data: null, error: failure };
        if (!filters.every(([key,value]) => row[key] === value)) return { data: null, error: { code: 'PGRST116' } };
        row = { ...row, ...payload, updated_at: '2026-10-20T00:01:00Z' };
        if (loseAcknowledgement) { loseAcknowledgement = false; return { data: null, error: { message: 'Lost acknowledgement' } }; }
        return { data: { ...row }, error: null };
      } }; return q;
  } };
}
test('move updates attachment only, preserves content and ID, and uses the saved owner/revision', async () => {
  const db = store(); const moved = await moveStandaloneCard(db, 'owner', original, { source: 'personal', topicId: 'mine' });
  assert.deepEqual(db.writes[0].payload, { library_node_id: null, library_id: null, personal_topic_id: 'mine' });
  assert.deepEqual(db.writes[0].filters, [['id','card'],['owner_id','owner'],['concept_id',null],['updated_at',original.updated_at]]);
  for (const key of ['id','owner_id','concept_id','question','answer','source_reference','created_at']) assert.equal(moved[key], original[key]);
  const official = await moveStandaloneCard(db, 'owner', moved, { source: 'official', topicId: 'another', libraryId: 'library' });
  assert.equal(official.library_node_id, 'another'); assert.equal(official.personal_topic_id, null);
});
test('ownership, legacy format and same-destination failures perform no writes', async () => {
  const db = store();
  await assert.rejects(moveStandaloneCard(db,'other',original,{source:'personal',topicId:'mine'}), /owned/);
  await assert.rejects(moveStandaloneCard(db,'owner',{...original,concept_id:'legacy'},{source:'personal',topicId:'mine'}), /standalone/);
  await assert.rejects(moveStandaloneCard(db,'owner',original,{source:'official',topicId:'official',libraryId:'library'}), /different/);
  assert.equal(db.writes.length, 0); assert.deepEqual(db.row, original);
});
test('stale moves and stale editor saves do not overwrite a newer move or edit', async () => {
  const db = store(); db.row = { ...original, updated_at:'2026-10-20T00:00:01Z', answer:'A newer edit' }; const before = { ...db.row };
  await assert.rejects(moveStandaloneCard(db,'owner',original,{source:'personal',topicId:'mine'}), /changed/);
  await assert.rejects(saveStandaloneCard(db,'owner',{source:'official',topicId:'official',libraryId:'library'},'Stale','Stale',original), /changed/);
  assert.deepEqual(db.row, before);
});
test('database failures leave the original Card and attachment intact; a later retry can succeed', async () => {
  const db = store(); db.fail({ code:'42501', message:'Internal database details' });
  await assert.rejects(moveStandaloneCard(db,'owner',original,{source:'personal',topicId:'mine'}), error => !error.message.includes('Internal') && /could not be confirmed/.test(error.message));
  assert.deepEqual(db.row, original); db.fail(null);
  assert.equal((await moveStandaloneCard(db,'owner',original,{source:'personal',topicId:'mine'})).personal_topic_id, 'mine');
});
test('lost acknowledgement requests reload and cannot repeat or overwrite the committed move', async () => {
  const db=store();db.loseNextAcknowledgement();
  await assert.rejects(moveStandaloneCard(db,'owner',original,{source:'personal',topicId:'mine'}),/Reload/);
  const committed={...db.row};assert.equal(committed.id,original.id);assert.equal(committed.personal_topic_id,'mine');
  await assert.rejects(moveStandaloneCard(db,'owner',original,{source:'personal',topicId:'different'}),/changed/);
  assert.deepEqual(db.row,committed);
});

const cards = [
  {id:'a',front:'Alpha',back:'Needle',sourceReference:'Book A',topicKeys:['official:topic:same'],createdAt:'2026-01-01T23:59:59Z',updatedAt:'2026-10-19T00:00:00Z'},
  {id:'b',front:'Beta',back:'Other',sourceReference:'https://reference.invalid/Needle',topicKeys:['personal:topic:same'],createdAt:'2026-02-02T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'},
  {id:'legacy',front:'Literal **punctuation**',back:'Legacy',sourceReference:'Original source',topicKeys:['personal:topic:child'],createdAt:null,updatedAt:null},
];
const ids = filters => filterLearnerCards(cards,{...EMPTY_LEARNER_CARD_FILTERS,...filters}).map(card=>card.id);
test('search matches Front, Back and Source / Reference without altering legacy text', () => {
  assert.deepEqual(ids({text:'alpha'}),['a']); assert.deepEqual(ids({text:'NEEDLE'}),['a','b']);
  assert.deepEqual(ids({text:'reference.invalid'}),['b']); assert.deepEqual(ids({text:'**punctuation**'}),['legacy']);
  assert.equal(cards[2].front,'Literal **punctuation**');
});
test('canonical exact Topic filter distinguishes personal/official IDs and never expands descendants', () => {
  assert.deepEqual(ids({topic:'official:topic:same'}),['a']); assert.deepEqual(ids({topic:'personal:topic:same'}),['b']);
  assert.deepEqual(ids({topic:'official:topic:parent'}),[]);
});
test('inclusive date ranges and combined filters use authoritative timestamps', () => {
  assert.deepEqual(ids({from:'2026-01-01',to:'2026-01-01'}),['a']);
  assert.deepEqual(ids({dateField:'updatedAt',from:'2026-10-20',text:'needle',topic:'personal:topic:same'}),['b']);
  assert.deepEqual(ids({from:'2027-01-01',to:'2026-01-01'}),[]);
  assert.deepEqual(ids({}),['a','b','legacy']);
});
test('hierarchy supplies canonical deduplicated destinations with independent shared paths', () => {
  const node = (source,id,name,children=[]) => ({source,id,key:`${source}:topic:${id}`,name,children});
  const roots=[node('official','root','Root',[
    node('official','a','A',[node('official','shared','Shared',[node('personal','mine','Mine')])]),
    node('official','b','B',[node('official','shared','Shared',[node('official','other','Other child')])]),
  ])];
  const result=learnerCardTopics(roots,['other']);
  assert.equal(result.filter(t=>t.topicId==='shared').length,1);
  assert.deepEqual(result.find(t=>t.topicId==='shared').paths,['Root › A › Shared','Root › B › Shared']);
  assert.deepEqual(result.find(t=>t.topicId==='mine').paths,['Root › A › Shared › Mine']);
  assert.equal(result.find(t=>t.topicId==='other').canMove,false);
});
