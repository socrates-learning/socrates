import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as cards from '../lib/standalone-custom-cards.ts';
import { loadCreatorPersonalContent } from '../lib/creator-personal-content.ts';
import { adaptStudyCandidateRow } from '../lib/study-candidates.ts';
import { adaptPersonalStudyAttemptResult } from '../lib/personal-study-attempts.ts';

const target = { source: 'official', topicId: 'topic', libraryId: 'library' };
const initial = { id: 'card', owner_id: 'owner', concept_id: null, library_node_id: 'topic', library_id: 'library', personal_topic_id: null,
  question: 'Front', answer: 'Back', source_reference: null, created_at: '2026-09-27', updated_at: '2026-09-27' };
function store() {
  const rows = new Map(); const writes = []; let failure = null;
  return { rows, writes, fail(message) { failure = message; }, from(table) {
    let op = 'select', payload, filters = [];
    const q = {
      select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, is(k,v) { filters.push([k,v]); return q; }, order() { return q; },
      insert(p) { op='insert'; payload=p; return q; }, update(p) { op='update';payload=p;return q; }, delete() { op='delete';return q; },
      async single() {
        writes.push({table,op,payload,filters});
        if (failure) return {data:null,error:{message:failure}};
        if (op==='insert') { const row={...initial,...payload};rows.set(row.id,row);return {data:row,error:null}; }
        const row=[...rows.values()].find(row => filters.every(([k,v]) => row[k]===v));
        if (!row) return {data:null,error:{message:'No owned Card'}};
        if(op==='delete') rows.delete(row.id); else rows.set(row.id,{...row,...payload});
        return {data: op==='delete' ? {id:row.id} : rows.get(row.id),error:null};
      },
      then(resolve,reject) { return Promise.resolve({data:table==='personal_cards' ? [...rows.values()].filter(row=>filters.every(([k,v])=>row[k]===v)) : [],error:null}).then(resolve,reject); }
    };return q;
  }};
}

test('standalone save, fresh bootstrap reload, edit and delete retain owner and real Card identity', async () => {
  const db=store();const saved=await cards.saveStandaloneCard(db,'owner',target,' Front ',' Back ',null);
  assert.equal(saved.concept_id,null);assert.equal(saved.library_node_id,'topic');
  const loaded=await loadCreatorPersonalContent(db,'owner');assert.equal(loaded.cards.length,0);assert.equal(loaded.standaloneCards[0].id,saved.id);
  const edited=await cards.saveStandaloneCard(db,'owner',target,'Changed','Back',loaded.standaloneCards[0]);
  assert.equal((await loadCreatorPersonalContent(db,'owner')).standaloneCards[0].question,'Changed');
  assert.deepEqual(db.writes[1].payload,{question:'Changed',answer:'Back'});
  assert.deepEqual(db.writes[1].filters,[['id','card'],['owner_id','owner'],['concept_id',null]]);
  await cards.deleteStandaloneCard(db,'owner',edited);assert.equal((await loadCreatorPersonalContent(db,'owner')).standaloneCards.length,0);
});

test('attachment forms remain source-qualified even when Topic UUIDs collide', async () => {
  assert.equal(cards.standaloneCardMatchesTopic(initial,{source:'personal',topicId:'topic'}),false);
  assert.equal(cards.standaloneCardMatchesTopic(initial,{...target,libraryId:'other'}),false);
  assert.throws(()=>cards.standaloneCardAttachment({...initial,personal_topic_id:'topic'}));
  const db=store();const saved=await cards.saveStandaloneCard(db,'owner',{source:'personal',topicId:'topic'},'F','B',null);
  assert.equal(saved.library_node_id,null);assert.equal(saved.library_id,null);assert.equal(saved.personal_topic_id,'topic');
  assert.equal(saved.concept_id,null);
});

test('forged ownership or attachment changes fail before client mutation', async () => {
  const db=store();
  await assert.rejects(cards.saveStandaloneCard(db,'other',target,'F','B',initial));
  await assert.rejects(cards.deleteStandaloneCard(db,'other',initial));
  await assert.rejects(cards.saveStandaloneCard(db,'owner',{...target,topicId:'other'},'F','B',initial));
  assert.equal(db.writes.length,0);
});

test('standalone Study delivery preserves null Concept and attempt response rejects fabricated state', () => {
  const row={candidate_type:'personal',candidate_id:'card',personal_card_id:'card',personal_concept_id:null,personal_topic_id:null,
    official_question_id:null,official_concept_id:null,prompt:'F',answer:'B',explanation:null,difficulty:null,testing_angle:null,candidate_position:1,created_at:'now'};
  const adapted=adaptStudyCandidateRow(row);assert.equal(adapted.personalConceptId,null);assert.equal(adapted.cardId,'card');
  const response={attemptId:'a',sequencePosition:1,studySessionId:'s',studyDeckId:'d',personalCardId:'card',personalConceptId:null,result:'easy',state:null};
  assert.equal(adaptPersonalStudyAttemptResult(response).state,null);
  assert.throws(()=>adaptPersonalStudyAttemptResult({...response,state:{evidenceCount:1}}),/must not contain Concept/);
  assert.throws(()=>adaptPersonalStudyAttemptResult({...response,personalConceptId:'real'}),/missing state/);
});

function workspace(db, request=null, canCreate=true, richText=false) {
  const slots=[];let cursor=0,tree;let props={ownerId:'owner',canCreate,richText,target,topicName:'Topic',cards:[],request,
    onRequest(value){props={...props,request:value};},onSaved(card){props={...props,cards:[card]};},onDeleted(){props={...props,cards:[]};},onEditorState(){}};
  const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(){}};
  const modules={'./CardMarkdownField':{CardMarkdownField: function CardMarkdownField(){}},react:hooks,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'@/lib/supabase':{supabase:db},'@/lib/standalone-custom-cards':cards,'../CreatorStudioV2Client.module.css':new Proxy({}, {get:(_,k)=>k})};
  const context={Error,exports:{},require(name){assert.ok(name in modules);return modules[name];},window:{confirm:()=>true},requestAnimationFrame(){}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/creator/StandaloneCustomCardWorkspace.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  function render(){cursor=0;tree=context.exports.StandaloneCustomCardWorkspace(props);return tree;}
  function nodes(root=tree,result=[]){if(Array.isArray(root))root.forEach(r=>nodes(r,result));else if(root&&typeof root==='object'){result.push(root);if(root.props?.children !== undefined) nodes(root.props.children,result);}return result;}
  function text(node){const c=node?.props?.children;return typeof c==='string'?c:Array.isArray(c)?c.map(x=>typeof x==='string'?x:text(x)).join(''):'';}
  render();return {render,nodes,text,get props(){return props;}};
}

test('actual workspace offers minimal learner authoring, saves and retains failed drafts', async () => {
  const db=store(),ui=workspace(db,{card:null,attachment:target,topicName:'Topic'});
  assert.equal(ui.nodes().filter(n=>n.type==='select').length,0);
  assert.equal(ui.nodes().filter(n=>n.type==='section').length,0);
  let fields=ui.nodes().filter(n=>n.type==='textarea');assert.equal(fields.length,2);
  fields[0].props.onChange({target:{value:'Saved front'}});fields[1].props.onChange({target:{value:'Saved back'}});ui.render();
  ui.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));ui.render();
  assert.equal(ui.props.cards[0].question,'Saved front');assert.equal(ui.props.request.card.concept_id,null);
  fields=ui.nodes().filter(n=>n.type==='textarea');fields[0].props.onChange({target:{value:'Unsaved edit'}});ui.render();db.fail('Library changed');
  ui.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));ui.render();
  assert.equal(ui.nodes().find(n=>n.type==='textarea').props.value,'Unsaved edit');
  assert.equal(ui.text(ui.nodes().find(n=>n.props?.role==='alert')),'Library changed');
  const visible=ui.nodes().map(ui.text).join(' ');assert.doesNotMatch(visible,/Mine|Personal|Official|Concept|Trash|Restore|Archive/);
});

test('closed embedded Card editor renders no separate workspace', () => {
  const ui=workspace(store(),null,false);assert.equal(ui.render(),null);
});


test('rich learner fields retain independent source, limits, explicit saving, duplicate-save guard and failed drafts', async () => {
 const db=store(),ui=workspace(db,{card:null,attachment:target,topicName:'Topic'},true,true);
 const fields=()=>ui.nodes().filter(n=>n.type?.name==='CardMarkdownField');
 assert.equal(fields().length,2);assert.deepEqual(fields().map(n=>n.props.maxLength),[10000,20000]);
 const front='## Front\n**Strong** [link](https://example.com)',back='> Back\n- Item';
 fields()[0].props.onChange(front);fields()[1].props.onChange(back);ui.render();
 assert.equal(ui.props.cards.length,0);assert.deepEqual(fields().map(n=>n.props.value),[front,back]);
 const submit=ui.nodes().find(n=>n.type==='form').props.onSubmit;
 submit({preventDefault(){}});submit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));ui.render();
 assert.equal(ui.props.cards.length,1);assert.equal(ui.props.cards[0].question,front);assert.equal(ui.props.cards[0].answer,back);
 fields()[0].props.onChange('**Unsaved**');ui.render();db.fail('Rejected save');
 ui.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));ui.render();
 assert.equal(fields()[0].props.value,'**Unsaved**');assert.equal(fields()[1].props.value,back);
 assert.equal(ui.text(ui.nodes().find(n=>n.props?.role==='alert')),'Rejected save');
});
