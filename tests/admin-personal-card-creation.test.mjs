import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { resolveCreatorCommandRoute } from '../lib/creator-command-contracts.ts';
import { editor, nodes, text } from './fixtures/creator-question-workflow.mjs';
import { projectConceptNavigation } from './fixtures/creator-concept-navigation.mjs';
import { projectIndependentTopicLocations } from './fixtures/independent-topic-locations.mjs';

const library={activeLibraryId:'library',canAccessActiveLibrary:true,canManageActiveLibrary:true};
const manifest=role=>deriveCreatorCapabilities({role,userId:'owner',library});

for(const role of ['admin','learner','editor']) {
  test(`${role}: new creation restrictions preserve historical access`,()=>{
    const capabilities=manifest(role);
    assert.deepEqual(capabilities.personal,{
      createTopic:true,createConcept:role==='editor',createCard:role!=='admin',editOwnContent:true,
      deleteOwnContent:true,createOfficialContextOverlay:role==='editor',managePersonalDecks:true,manageFlags:true,
    });
    const command={type:'create-card',target:'personal',ownerId:'owner',conceptKey:'personal:concept:owned'};
    if(role!=='editor') assert.throws(()=>resolveCreatorCommandRoute(command,capabilities),/creation is not permitted/);
    else assert.equal(resolveCreatorCommandRoute(command,capabilities),'personal-card-owner-write');
    assert.equal(resolveCreatorCommandRoute({type:'update-card',target:'personal',ownerId:'owner',cardKey:'personal:card:owned'},capabilities),'personal-card-owner-write');
    assert.throws(()=>resolveCreatorCommandRoute({...command,ownerId:'other'},capabilities),/only the signed-in owner/);
    assert.throws(()=>resolveCreatorCommandRoute({type:'update-card',target:'personal',ownerId:'other',cardKey:'personal:card:owned'},capabilities),/only the signed-in owner/);
    assert.equal(capabilities.official.saveConcept,role!=='learner');
    assert.equal(capabilities.official.saveQuestion,role!=='learner');
    assert.equal(capabilities.official.manageTopicTree,role==='admin');
    assert.equal(capabilities.administration.manageUsersAndRoles,role==='admin');
  });
  test(`${role}: actual released Creator UI preserves personal access and authorized creation`,()=>{
    const h=editor({role,placed:true});let e=h.render();
    const action=nodes(e.tree).find(n=>n.type==='button'&&text(n)==='Add Custom Card');
    assert.equal(Boolean(action),role==='editor');
    assert.equal(e.creationDestination,role==='learner'?'personal':'official');
    assert.equal(e.showPersonalCreatorTopics,true);
    e.setStandaloneCards([{id:'old-card',owner_id:'owner',concept_id:null,question:'Old Front',answer:'Old Back',library_node_id:'topic',library_id:'library',personal_topic_id:null,created_at:'2026-01-01',updated_at:'2026-01-01'}]);
    h.render().selectExistingQuestion({source:'personal',id:'old-card',conceptId:null});e=h.render();
    assert.equal(e.standaloneRequest.card.id,'old-card');
    assert.equal(e.standaloneRequest.card.owner_id,'owner');
    assert.deepEqual(h.calls,[]);
  });
}

test('Admin official Concept and Question commands retain Library authorization',()=>{
  const capabilities=manifest('admin');
  const concept={type:'create-concept',target:'official',libraryId:'library',topicKeys:['official:topic:topic']};
  const question={type:'create-question',libraryId:'library',conceptKey:'official:concept:concept'};
  assert.equal(resolveCreatorCommandRoute(concept,capabilities),'official-concept-versioned-save');
  assert.equal(resolveCreatorCommandRoute(question,capabilities),'official-question-versioned-save');
  assert.throws(()=>resolveCreatorCommandRoute({...concept,libraryId:'other'},capabilities),/Library|library/);
  assert.throws(()=>resolveCreatorCommandRoute({...question,libraryId:'other'},capabilities),/Library|library/);
});

const path='components/CreatorStudioV2Client.tsx';
const currentSource=readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('historical fixture recognizes the exact released integrations',()=>{
  const beforeNavigation=projectConceptNavigation(path,currentSource);
  const historical=projectIndependentTopicLocations(path,beforeNavigation);
  assert.doesNotMatch(historical,/import.*TopicDetachmentDialog/);
  assert.match(historical,/async function savePersonalCard/);
});
for(const [name,from,to] of [
  ['ownership filter',".eq('owner_id', ownerId)",".eq('owner_id', 'foreign')"],
  ['personal create guard',"creationDestination !== 'personal'","creationDestination === 'personal'"],
  ['new unrelated import',"import { useEffect", "import { unrelated } from 'unapproved';\nimport { useEffect"],
]) test(`historical fixture rejects unrelated ${name} changes`,()=>{
  // Append is used for the import probe so it does not depend on import formatting.
  const changed=name==='new unrelated import'?currentSource+"\nimport 'unapproved';\n":currentSource.replace(from,to);
  assert.notEqual(changed,currentSource);
  assert.throws(()=>projectConceptNavigation(path,changed),/Exact (Concept navigation candidate|learner Card tools integration)/);
});
test('detachment projection independently rejects edits outside its approved hunks',()=>{
  const beforeNavigation=projectConceptNavigation(path,currentSource);
  assert.throws(()=>projectIndependentTopicLocations(path,beforeNavigation+'\n// unrelated change\n'),/Changes outside Topic detachment integration/);
});
