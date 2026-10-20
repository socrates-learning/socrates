import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as cards from '../lib/standalone-custom-cards.ts';
import * as search from '../lib/learner-card-search.ts';
import { containTopicDialogFocus } from '../lib/topic-detachment.ts';
import { projectLearnerCardTools } from './fixtures/learner-card-tools.mjs';
import { loadConceptModule } from './fixtures/concept-media-authoring.mjs';
const cardMedia=loadConceptModule('lib/personal-card-media.ts',{});

const initial = { id:'card',owner_id:'owner',concept_id:null,library_node_id:'official',library_id:'library',personal_topic_id:null,
  question:'Front unchanged',answer:'Back unchanged',source_reference:'Book reference',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-10-20T00:00:00Z' };
const topics = [
  {key:'official:topic:official',source:'official',topicId:'official',name:'Official',paths:['Nursing › Official'],canMove:true},
  {key:'personal:topic:mine',source:'personal',topicId:'mine',name:'My notes',paths:['Nursing › My notes'],canMove:true},
  {key:'official:topic:shared',source:'official',topicId:'shared',name:'Shared',paths:['Nursing › A › Shared','Nursing › B › Shared'],canMove:true},
];
const css={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
function compile(file, extra, dom) {
  const modules={react:React,'react/jsx-runtime':jsx,...extra};
  const context={exports:{},Error,URL,HTMLElement:dom.window.HTMLElement,document:dom.window.document,window:dom.window,
    requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),require(name){assert.ok(name in modules, name);return modules[name];}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
  }).outputText,context,{filename:file});
  return context.exports;
}
async function mount() {
  const {JSDOM}=await import('jsdom');
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true,url:'http://local-synthetic.invalid'});
  const saved=new Map();
  for(const key of ['window','document','navigator','HTMLElement','MutationObserver','Event','KeyboardEvent','IS_REACT_ACT_ENVIRONMENT']) {
    saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  }
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  dom.window.confirm=()=>false;
  let row={...initial}, failure=null, release, slow=false, writes=0, current;
  const db={from(table){assert.equal(table,'personal_cards');const filters=[];let payload;
    const q={update(value){payload=value;return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},select(){return q;},
      async single(){writes++;if(slow)await new Promise(resolve=>{release=resolve;});
        if(failure)return {data:null,error:failure};
        if(!filters.every(([k,v])=>row[k]===v))return {data:null,error:{code:'PGRST116'}};
        row={...row,...payload,updated_at:'2026-10-20T00:01:00Z'};return {data:{...row},error:null};}};return q;}};
  const {MoveCardDialog}=compile('components/creator/MoveCardDialog.tsx',{'@/lib/topic-detachment':{containTopicDialogFocus},'../TopicLocationDialog.module.css':css,'./LearnerCardTools.module.css':css},dom);
  const {StandaloneCustomCardWorkspace}=compile('components/creator/StandaloneCustomCardWorkspace.tsx',{'@/lib/supabase':{supabase:db},'@/lib/standalone-custom-cards':cards,
    '@/lib/personal-card-media':cardMedia,'./PersonalCardImageAuthoring':{PersonalCardImageAuthoring(){throw Error('Image tools must not mount in the textarea compatibility fixture');}},
    './MoveCardDialog':{MoveCardDialog},'./PersonalCardField':{PersonalCardField(){throw Error('This fixture uses the existing textarea mode');}},'./LearnerCardTools.module.css':css,'../CreatorStudioV2Client.module.css':css},dom);
  const {CreatorLearnerQuestionsWorkspace}=compile('components/creator/CreatorLearnerQuestionsWorkspace.tsx',{'@/components/MarkdownContent':{cardMarkdownSummary:value=>value},'@/lib/learner-card-search':search,
    '../CreatorStudioV2Client.module.css':css,'./LearnerCardTools.module.css':css},dom);
  const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));let reload;
  const editorState=[];
  function Harness(){
    const [request,setRequest]=React.useState({card:{...row},attachment:cards.standaloneCardAttachment(row),topicName:'Official'});
    const [version,setVersion]=React.useState(0),[list,setList]=React.useState([{...row}]);current=request;
    const state=React.useCallback((dirty,busy)=>editorState.push({dirty,busy}),[]);
    reload=()=>{setRequest({card:{...row},attachment:cards.standaloneCardAttachment(row),topicName:row.personal_topic_id?'My notes':'Official'});setList([{...row}]);setVersion(v=>v+1);};
    return React.createElement(CreatorLearnerQuestionsWorkspace,{topics,busy:false,
      cards:[...list.map(card=>({id:card.id,front:card.question,back:card.answer,sourceReference:card.source_reference,createdAt:card.created_at,updatedAt:card.updated_at,topicKeys:[`${cards.standaloneCardAttachment(card).source}:topic:${cards.standaloneCardAttachment(card).topicId}`]})),
      {id:'legacy',front:'Legacy literal **text**',back:'Other',sourceReference:'Older source',topicKeys:['personal:topic:mine'],createdAt:'2026-02-01T00:00:00Z',updatedAt:'2026-03-01T00:00:00Z'}],
      onOpen(){},onNew(){},topicTree:React.createElement('section',{'aria-label':'Unchanged Topic Tree'},'Tree'),
      editor:React.createElement(StandaloneCustomCardWorkspace,{key:version,ownerId:'owner',canCreate:true,request,onRequest:setRequest,onSaved:card=>setList([card]),onEditorState:state,movement:{topics,libraryId:'library'}})});
  }
  async function act(action){await React.act(async()=>{await action?.();await new Promise(resolve=>setTimeout(resolve,25));});}
  await act(()=>root.render(React.createElement(Harness)));
  const doc=dom.window.document;
  const button=(name,scope=doc)=>{const buttons=[...scope.querySelectorAll('button')].filter(b=>b.textContent===name);assert.equal(buttons.length,1,name);return buttons[0];};
  return {dom,doc,button,act,editorState,get row(){return row;},get writes(){return writes;},get request(){return current;},
    async click(name,scope){await act(()=>button(name,scope).click());},
    async input(element,value){await act(()=>{const proto=element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});},
    fail(value){failure=value;},delay(){slow=true;},async finish(){slow=false;await act(()=>release());},async reload(){await act(reload);},
    async close(){await act(()=>root.unmount());dom.window.close();for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
  };
}

test('dialog Cancel and Escape preserve Card, trap focus and restore Move Card focus',async()=>{
 const h=await mount();try{
  h.button('Move Card').focus();await h.click('Move Card');let dialog=h.doc.querySelector('dialog');assert.ok(dialog.open);
  assert.equal(h.doc.activeElement.type,'search');assert.equal(dialog.querySelectorAll('input[type="radio"]').length,2);
  const first=dialog.querySelector('input');await h.act(()=>first.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));
  assert.equal(h.doc.activeElement,h.button('Cancel',dialog));
  await h.click('Cancel',dialog);assert.equal(h.doc.querySelector('dialog'),null);assert.equal(h.doc.activeElement,h.button('Move Card'));
  await h.click('Move Card');dialog=h.doc.querySelector('dialog');await h.act(()=>dialog.dispatchEvent(new h.dom.window.Event('cancel',{cancelable:true})));
  assert.equal(h.doc.querySelector('dialog'),null);assert.equal(h.writes,0);assert.deepEqual(h.row,initial);
 }finally{await h.close();}
});
test('confirmed move remains open while pending, sends once, updates Topic and survives reload',async()=>{
 const h=await mount();try{
  await h.click('Move Card');const dialog=h.doc.querySelector('dialog');await h.act(()=>dialog.querySelector('[value="personal:topic:mine"]').click());
  h.delay();await h.click('Confirm Move');await h.click('Confirm Move');assert.equal(h.writes,1);assert.ok(dialog.open);assert.ok(h.button('Cancel',dialog).disabled);
  await h.act(()=>dialog.dispatchEvent(new h.dom.window.Event('cancel',{cancelable:true})));assert.ok(dialog.open);
  await h.finish();assert.equal(h.doc.querySelector('dialog'),null);assert.equal(h.request.attachment.topicId,'mine');
  assert.match(h.doc.body.textContent,/Card moved to Nursing › My notes/);
  for(const key of ['id','owner_id','question','answer','source_reference','created_at'])assert.equal(h.row[key],initial[key]);
  await h.reload();assert.match(h.doc.body.textContent,/Current Topic: Nursing › My notes/);assert.equal(h.request.card.id,'card');
 }finally{await h.close();}
});
test('failed move remains visible with safe retry; unsaved draft cannot be silently moved or discarded',async()=>{
 const h=await mount();try{
  await h.input(h.doc.querySelector('textarea'),'Unsaved Front');assert.ok(h.button('Move Card').disabled);
  await h.click('Move Card');assert.equal(h.doc.querySelector('dialog'),null);assert.equal(h.writes,0);
  await h.click('Cancel');assert.equal(h.doc.querySelector('textarea').value,'Unsaved Front');assert.ok(h.editorState.some(s=>s.dirty));
  await h.input(h.doc.querySelector('textarea'),initial.question);await h.click('Move Card');let dialog=h.doc.querySelector('dialog');
  await h.act(()=>dialog.querySelector('[value="personal:topic:mine"]').click());h.fail({code:'42501'});await h.click('Confirm Move');
  assert.match(dialog.querySelector('[role="alert"]').textContent,/could not be confirmed/);assert.deepEqual(h.row,initial);assert.ok(dialog.open);
  h.fail(null);await h.click('Confirm Move');assert.equal(h.doc.querySelector('dialog'),null);assert.equal(h.row.personal_topic_id,'mine');
 }finally{await h.close();}
});
test('mounted My Cards combines text/source, Topic and dates, clears filters, and retains literal legacy results',async()=>{
 const h=await mount();try{
  const inputs=()=>[...h.doc.querySelectorAll('input')];const searchInput=inputs().find(i=>i.type==='search');
  await h.input(searchInput,'Book reference');assert.equal(h.doc.querySelectorAll('.questionSearchResult').length,1);
  const [topic,dateField]=h.doc.querySelectorAll('select');await h.input(topic,'personal:topic:mine');assert.match(h.doc.body.textContent,/No Cards match/);
  await h.click('Clear search');assert.equal(h.doc.querySelector('.questionSearchResult').textContent,'Legacy literal **text**');
  await h.input(dateField,'updatedAt');await h.input(inputs().find(i=>i.type==='date'),'2026-04-01');assert.match(h.doc.body.textContent,/No Cards match/);
  await h.click('Clear dates');assert.equal(h.doc.querySelectorAll('.questionSearchResult').length,1);
  await h.click('Clear Topic');assert.equal(h.doc.querySelectorAll('.questionSearchResult').length,2);
  await h.input(searchInput,'absent');await h.click('Reset all filters');assert.equal(searchInput.value,'');assert.equal(h.doc.querySelectorAll('.questionSearchResult').length,2);
  assert.equal(h.writes,0);
 }finally{await h.close();}
});
test('historical integrity projection permits only exact learner integration and rejects unrelated changes',()=>{
 const path='components/CreatorStudioV2Client.tsx',source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const baseline=execFileSync('git',['show','a7d7e545cc9b59e02d864c1523484a6b0d4f5099:'+path],{encoding:'utf8'});
 assert.equal(projectLearnerCardTools(path,source),baseline);
 for(const changed of [source+'\n// unrelated change',source.replace('function saveCurrentQuestion','function changedSaveCurrentQuestion'),source.replace('topics={learnerTopics}','topics={[]}')]){
  assert.notEqual(changed,source);assert.throws(()=>projectLearnerCardTools(path,changed),/Exact learner/);
 }
});
