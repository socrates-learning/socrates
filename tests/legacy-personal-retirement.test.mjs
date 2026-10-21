import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { resolveCreatorCommandRoute } from '../lib/creator-command-contracts.ts';
import { resolveStudyCreatorSelection } from '../lib/study-creator-context.ts';
import { loadCreatorPersonalContent } from '../lib/creator-personal-content.ts';
import { editor, nodes, text } from './fixtures/creator-question-workflow.mjs';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import * as conceptTree from '../lib/concept-topic-tree.ts';
import * as topicGraph from '../lib/topic-placement-graph.ts';
import { projectLegacyRetirement } from './fixtures/legacy-personal-retirement.mjs';

const owner='owner';
const concept={id:'concept',owner_id:owner,topic_id:'topic',name:'Historical Concept',description:'Explanation',source_reference:'https://example.invalid/source'};
const card={id:'legacy-card',owner_id:owner,concept_id:'concept',question:'Front',answer:'Back',source_reference:'Original reference'};
const topic={id:'topic',owner_id:owner,parent_id:null,name:'My Topic',sort_order:0};
const deck={id:'deck',owner_id:owner,name:'Historical Deck'};
const event={preventDefault(){}};
function database() {
 const rows={personal_topics:[{...topic}],personal_concepts:[{...concept}],personal_cards:[{...card}],personal_concept_official_placements:[],personal_topic_official_placements:[],personal_collections:[{...deck}],personal_collection_cards:[]};
 const writes=[];
 return {rows,writes,from(table){
  let filters=[],op='select',values,single=false;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},single(){single=true;return q;},update(v){op='update';values=v;return q;},insert(v){op='insert';values=v;return q;},delete(){op='delete';return q;},then(resolve,reject){
   if(op!=='select')writes.push({table,op,values,filters});
   let selected=(rows[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v));
   if(op==='update')selected.forEach(r=>Object.assign(r,values));
   if(op==='insert'){selected=Array.isArray(values)?values:[values];rows[table].push(...selected);}
   if(op==='delete')rows[table]=rows[table].filter(r=>!selected.includes(r));
   return Promise.resolve({data:single?selected[0]:selected.map(r=>({...r})),error:null}).then(resolve,reject);
  }};return q;
 },rpc(name,args){writes.push({rpc:name,args});return Promise.resolve({data:[],error:null});}};
}
// Runs the actual component handlers, without replacing their authorization or
// mutation logic. Browser geometry and database RLS are checked separately.
function compatibilityHarness(component,db) {
 const slots=[];let cursor=0;
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(v){const i=cursor++;return slots[i]??=( {current:v} );},useMemo:f=>f(),useCallback:f=>f,useEffect(){}};
 const jsx=(type,props)=>({type,props:props||{}});
 const exposed=component==='StudyCreatorClient'?'loadMaterial,openConceptEditor,openCardEditor,openOverlayEditor,addCardForOfficialConcept,saveOverlayConcept,saveConcept,saveCard,editorModal,setEditorModal,overlayEditor,setOverlayEditor,error,setConceptName,setConceptDescription,setConceptSourceReference,setConceptTopicId,setCardQuestion,setCardAnswer,setCardSourceReference,setCardConceptId,concepts,cards':'loadCollections,collections,memberships,setSelectedId,setDialog,dialog,setName,saveCollection,addCards,removeCard,error';
 let source=readFileSync(new URL('../components/'+component+'.tsx',import.meta.url),'utf8');
 const anchor=component==='StudyCreatorClient'?'  if (isLoading) {':'  return (\n    <>';
 assert.equal(source.split(anchor).length,2);
 source=source.replace(anchor,'  globalThis.api = {'+exposed+'};\n'+anchor);
 const context={exports:{},URLSearchParams,HTMLElement:class{},window:{location:{search:''},localStorage:{getItem(){return null;},setItem(){}}},document:{activeElement:null},require(name){
  if(name==='react')return hooks;
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='@/lib/supabase')return{supabase:db};
  if(name==='@/lib/study-creator-context')return{resolveStudyCreatorSelection};
  if(name.endsWith('.css'))return{default:new Proxy({},{get:(_,k)=>String(k)})};
  return new Proxy({},{get:(_,k)=>String(k)});
 }};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return{render(){cursor=0;const props=component==='StudyCreatorClient'?{ownerId:owner,officialBrowser:null}:{ownerId:owner,material:{topics:[topic],concepts:[concept],cards:[card]}};const tree=context.exports[component](props);return{...context.api,tree};}};
}

for(const role of ['learner','admin'])test(`${role}: legacy creation commands denied, historical edits retained`,()=>{
 const caps=deriveCreatorCapabilities({role,userId:owner,library:{activeLibraryId:'library',canAccessActiveLibrary:true,canManageActiveLibrary:role==='admin'}});
 for(const command of [
  {type:'create-concept',target:'personal',ownerId:owner,topicKey:'personal:topic:topic'},
  {type:'create-card',target:'personal',ownerId:owner,conceptKey:'personal:concept:concept'},
  {type:'create-concept-overlay',target:'personal',ownerId:owner,officialTopicKey:'official:topic:topic',officialConceptKey:null},
 ])assert.throws(()=>resolveCreatorCommandRoute(command,caps),/not permitted|identity/);
 assert.equal(resolveCreatorCommandRoute({type:'update-concept',target:'personal',ownerId:owner,conceptKey:'personal:concept:concept'},caps),'personal-concept-owner-write');
 assert.equal(resolveCreatorCommandRoute({type:'update-card',target:'personal',ownerId:owner,cardKey:'personal:card:legacy-card'},caps),'personal-card-owner-write');
});

for(const role of ['admin','learner','editor'])test(`${role}: compatibility navigation requires relevant owned records`,()=>{
 for(const kind of ['none','standalone','topic','concept','legacy-card','deck']){
  const h=editor({role});const p=h.props.initialPersonalContent;
  p.concepts=kind==='concept'?[{...concept}]:[];p.cards=kind==='legacy-card'?[{...card,created_at:'2026-01-01',updated_at:'2026-01-01'}]:[];
  p.topics=kind==='topic'?[{...topic}]:[];p.standaloneCards=kind==='standalone'?[{...card,concept_id:null,personal_topic_id:'topic',created_at:'2026-01-01',updated_at:'2026-01-01'}]:[];
  p.hasLegacyCollections=kind==='deck';
  const link=nodes(h.render().tree).find(n=>n.type==='button'&&text(n)==='Historical personal content');
  assert.equal(Boolean(link),['concept','legacy-card','deck'].includes(kind),kind);
  if(link){link.props.onClick();assert.deepEqual(h.routes,['/study-creator']);}
 }
});

test('Deck-only discovery stays owner-scoped and fails closed on foreign results',async()=>{
 const db=database();db.rows.personal_concepts=[];db.rows.personal_cards=[];
 assert.equal((await loadCreatorPersonalContent(db,owner)).hasLegacyCollections,true);
 db.rows.personal_collections[0].owner_id='foreign';
 // Simulate a faulty backend ignoring its own owner predicate.
 const original=db.from;db.from=t=>{const q=original(t);if(t==='personal_collections')q.eq=()=>q;return q;};
 await assert.rejects(loadCreatorPersonalContent(db,owner),/crossed the authenticated owner boundary/);
});

test('historical Concept and Card edits save and reload without inserts or identity changes',async()=>{
 const db=database(),h=compatibilityHarness('StudyCreatorClient',db);await h.render().loadMaterial();
 h.render().openConceptEditor(concept);let e=h.render();e.setConceptName('Edited historical');e.setConceptDescription('**Preserved explanation**');e.setConceptSourceReference('https://example.invalid/updated');await h.render().saveConcept(event);
 e=h.render();assert.equal(e.concepts[0].id,concept.id);assert.equal(e.concepts[0].description,'**Preserved explanation**');assert.equal(e.editorModal,null);
 e.openCardEditor(card);e=h.render();e.setCardQuestion('**Updated Front**');e.setCardAnswer('Back with reference');await h.render().saveCard(event);
 await h.render().loadMaterial();e=h.render();assert.equal(e.cards[0].id,card.id);assert.equal(e.cards[0].concept_id,concept.id);assert.equal(e.cards[0].question,'**Updated Front**');assert.equal(e.cards[0].source_reference,'Original reference');
 assert.equal(db.writes.length,2);for(const w of db.writes){assert.equal(w.op,'update');assert.ok(w.filters.some(([k,v])=>k==='owner_id'&&v===owner));}
});

test('compatibility creation handlers fail closed even if invoked without visible controls',async()=>{
 const db=database(),h=compatibilityHarness('StudyCreatorClient',db);await h.render().loadMaterial();
 for(const f of ['openConceptEditor','openCardEditor'])h.render()[f](null);
 h.render().openOverlayEditor({libraryNodeId:'official'});h.render().addCardForOfficialConcept({libraryNodeId:'official'});
 let e=h.render();e.setEditorModal({kind:'concept',record:null});e.setConceptName('New');e.setConceptTopicId('topic');await h.render().saveConcept(event);
 e=h.render();e.setEditorModal({kind:'card',record:null});e.setCardQuestion('New');e.setCardAnswer('Back');e.setCardConceptId('concept');await h.render().saveCard(event);
 e=h.render();e.setOverlayEditor({libraryNodeId:'official'});await h.render().saveOverlayConcept(event);
 assert.equal(db.writes.length,0);assert.match(h.render().error,/Create new Cards in Creator Studio/);
});

test('historical Deck renaming and membership changes persist, creation is blocked',async()=>{
 const db=database(),h=compatibilityHarness('PersonalDecksBrowser',db);await h.render().loadCollections();let e=h.render();e.setSelectedId(deck.id);e.setDialog({kind:'rename',collection:deck});e.setName('Renamed historical Deck');await h.render().saveCollection(event);
 await h.render().loadCollections();assert.equal(h.render().collections[0].name,'Renamed historical Deck');
 await h.render().addCards([card.id]);assert.equal(h.render().memberships[0].personal_card_id,card.id);await h.render().removeCard(card);assert.equal(h.render().memberships.length,0);
 e=h.render();e.setDialog({kind:'create'});e.setName('Forbidden');const writes=db.writes.length;await h.render().saveCollection(event);assert.equal(db.writes.length,writes);assert.match(h.render().error,/creation is retired/);
 assert.equal(db.rows.personal_cards[0].id,card.id);assert.equal(db.rows.personal_concepts[0].id,concept.id);
});

test('navigation source projection rejects unrelated code and ownership changes',()=>{
 const path='components/CreatorStudioV2Client.tsx',source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 projectLegacyRetirement(path,source);
 for(const changed of [source+'\n// unrelated\n',source.replace('item.owner_id === initialPersonalContent.ownerId','true'),source.replace("navigateFromCreator('/study-creator')","window.location.assign('/study-creator')")])assert.throws(()=>projectLegacyRetirement(path,changed),/Exact learner Card tools integration/);
});


test('rendered compatibility browser hides creation while retaining Concept and Card editing',()=>{
 const hooks=hookHarness(),edited=[];
 const component=loadConceptModule('components/SocratesStudyCreatorBrowser.tsx',{
  react:{...hooks.hooks,useMemo:f=>f()},'react/jsx-runtime':jsx,
  '@/lib/topic-placement-graph':topicGraph,'@/lib/concept-topic-tree':conceptTree,
  '@/components/MarkdownContent':{MarkdownContent:()=>null,questionMarkdownKind:()=> 'paragraph',questionMarkdownSummary:v=>v},
  '@/components/QuestionMediaContent':{default:()=>null},'./ConceptMediaContent':{default:()=>null},
  './StudyCreatorIcon':{StudyCreatorIcon:()=>null},'./StudyCreatorClient.module.css':{default:new Proxy({},{get:(_,k)=>k})},
 });
 const props={data:null,filter:'all',material:{topics:[topic],concepts:[concept],cards:[card],overlays:[]},search:'',allowLegacyCreation:false,
 onEditConcept:c=>edited.push(c.id),onEditCard:c=>edited.push(c.id),onEditTopic(){},onCreateTopic(){},onDeleteTopic(){},onDeleteCard(){},onDeleteConcept(){},onDetach(){},
 onAddCard(){assert.fail('Retired Card action called');},onAddConcept(){assert.fail('Retired Concept action called');},onCreateCard(){assert.fail('Retired Card action called');},onCreateConcept(){assert.fail('Retired Concept action called');}};
 const render=()=>hooks.render(()=>component.SocratesStudyCreatorBrowser(props));
 render();hooks.effects();let tree=render();
 const buttons=()=>nodes(tree).filter(n=>n.type==='button');
 for(const name of ['New Personal Concept','Add My Concept','Add My Card','New Card'])assert.ok(!buttons().some(n=>text(n).includes(name)),name);
 assert.ok(buttons().some(n=>text(n).includes('New Custom Topic')));
 const conceptRow=buttons().find(n=>nodes(n).some(c=>c.type==='strong'&&text(c)===concept.name));assert.ok(conceptRow);conceptRow.props.onClick();tree=render();
 buttons().find(n=>text(n)==='Details').props.onClick();tree=render();
 buttons().find(n=>text(n)==='Edit').props.onClick();
 const cardRow=buttons().find(n=>nodes(n).some(c=>c.type==='strong'&&text(c)===card.question));assert.ok(cardRow);cardRow.props.onClick();tree=render();
 buttons().find(n=>text(n)==='Edit Card').props.onClick();assert.deepEqual(edited,[concept.id,card.id]);
 assert.ok(!buttons().some(n=>text(n).includes('New Card')));
});

for(const role of ['admin','editor'])for(const historical of [false,true])test(`${role}: compatibility route ${historical?'opens owned history':'retains canonical authoring redirect'}`,async()=>{
 const db=database();if(!historical){db.rows.personal_concepts=[];db.rows.personal_cards=[];db.rows.personal_collections=[];}
 const page=loadConceptModule('app/study-creator/page.tsx',{
  'react/jsx-runtime':jsx,'@/lib/topic-placement-graph':topicGraph,
  '@/components/Header':{Header:()=>null,HeaderSessionProvider:()=>null},'@/components/StudyCreatorClient':{StudyCreatorClient:()=>null},
  '@/lib/creator-personal-content':{loadCreatorPersonalContent},'@/lib/supabase-server':{createSupabaseServerClient:async()=>db},
  '@/lib/server-auth-context':{getVerifiedRequestAuthContext:async()=>({userId:owner,email:'synthetic@example.invalid',role})},
  '@/lib/library-context':{resolveActiveLibraryContext:async()=>({library:null})},'next/navigation':{redirect:path=>{throw new Error('redirect:'+path);}},
 });
 if(historical){const result=await page.default();assert.ok(result);assert.ok(nodes(result).some(n=>n.props?.ownerId===owner&&n.props?.allowTopicCreation===false));}
 else await assert.rejects(page.default(),/redirect:\/creator/);
});

test('compatibility navigation uses the existing unsaved-change protection',()=>{
 const h=editor({role:'admin',editing:true,confirm:()=>false});h.render().setConcept('Unsaved explanation');
 const link=nodes(h.render().tree).find(n=>n.type==='button'&&text(n)==='Historical personal content');assert.ok(link);link.props.onClick();
 assert.deepEqual(h.routes,[]);assert.equal(h.confirmations.length,1);
});
