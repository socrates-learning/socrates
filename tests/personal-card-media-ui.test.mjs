import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { webcrypto } from 'node:crypto';
import { loadConceptModule as load, ids } from './fixtures/concept-media-authoring.mjs';
const card='13600000-0000-4000-8000-000000000001';
const metadata={assetId:ids.asset,mime:'image/png',width:30,height:20,sha256:'2'.repeat(64)};
const css={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
async function mount(){
 const {JSDOM}=await import('jsdom');const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true,url:'http://localhost'});
 const saved=new Map();for(const key of ['window','document','navigator','HTMLElement','Event','MutationObserver','IS_REACT_ACT_ENVIRONMENT']){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 }
 const calls=[],busy=[];let fail=false,pause=false,release;
 const media=load('lib/personal-card-media.ts',{}, {fetch:async(path,init={})=>{
  calls.push({path,method:init.method||'GET',body:init.body});
  if(init.method==='POST'&&path.includes('/drafts/')){
   if(fail){fail=false;throw Error('Synthetic lost upload response');}
   if(pause)await new Promise((resolve,reject)=>{release=resolve;init.signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true});});
   return Response.json({assetId:ids.asset,ready:true});
  }
  if(init.method==='POST')return Response.json({reservationId:ids.placement});
  if(init.method==='DELETE')return Response.json({cancelled:true});
  return Response.json(metadata);
 }});
 const {PersonalCardImageAuthoring}=load('components/creator/PersonalCardImageAuthoring.tsx',{
  react:React,'react/jsx-runtime':jsx,'@/lib/personal-card-media':media,'./PersonalCardImageAuthoring.module.css':css,
  '../PersonalCardMediaContent':{PersonalCardImage:({image})=>React.createElement('span',{'data-private-image':image.assetId},image.description||'Image preview')},
 },{crypto:webcrypto});
 let state,update;const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));
 function Harness(){const [props,setProps]=React.useState({images:[],preview:false,disabled:false});state=props;update=setProps;return React.createElement(PersonalCardImageAuthoring,{...props,cardId:card,side:'front',onChange:images=>setProps(p=>({...p,images})),onBusy:value=>busy.push(value)});}
 async function act(action){await React.act(async()=>{await action?.();await new Promise(r=>setTimeout(r,0));});}
 await act(()=>root.render(React.createElement(Harness)));
 const doc=dom.window.document;const buttons=name=>[...doc.querySelectorAll('button')].filter(b=>b.textContent===name);
 return {doc,dom,act,buttons,calls,busy,get state(){return state;},fail(){fail=true;},pause(){pause=true;},release(){release?.();},
 async click(name){await act(()=>{assert.equal(buttons(name).length,1);buttons(name)[0].click();});},
 async file(size=20){await act(()=>{const input=doc.querySelector('input[type=file]');const file=new dom.window.File([new Uint8Array(size)],'synthetic.png',{type:'image/png'});Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});},
 async input(value){await act(()=>{const input=doc.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});},
 async update(props){await act(()=>update(p=>({...p,...props})));},
 async close(){await act(()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
 };
}
test('Insert Image adds only private Card metadata; descriptions replacement removal and Preview preserve text',async()=>{
 const ui=await mount();try{
  await ui.click('Insert Image');await ui.file();assert.equal(ui.state.images.length,1);assert.deepEqual(ui.busy,[true,false]);
  assert.equal(ui.state.images[0].side,'front');assert.equal(ui.state.images[0].assetId,ids.asset);
  await ui.input('Clinical diagram');assert.equal(ui.state.images[0].description,'Clinical diagram');
  const id=ui.state.images[0].id;await ui.click('Replace Image');await ui.file();assert.equal(ui.state.images.length,1);assert.equal(ui.state.images[0].id,id);assert.equal(ui.state.images[0].description,'Clinical diagram');
  await ui.update({preview:true});assert.ok(ui.buttons('Insert Image')[0].closest('[hidden]'));assert.equal(ui.doc.querySelectorAll('[data-private-image]').length,1);
  await ui.update({preview:false});await ui.click('Remove Image');assert.equal(ui.state.images.length,0);
  assert.equal(ui.calls.some(c=>c.method==='DELETE'),false,'Removing a draft image does not delete saved references or Storage bytes');
 }finally{await ui.close();}
});
test('failed upload keeps its reservation and retries the same intent without duplicating image entries',async()=>{
 const ui=await mount();try{
  ui.fail();await ui.file();assert.equal(ui.state.images.length,0);assert.ok(ui.doc.querySelector('[role=alert]'));assert.deepEqual(ui.busy,[true]);
  await ui.click('Retry Upload');assert.equal(ui.state.images.length,1);
  const reserves=ui.calls.filter(c=>c.method==='POST'&&!c.path.includes('/drafts/')).map(c=>JSON.parse(c.body));
  assert.equal(reserves.length,2);assert.equal(reserves[0].idempotencyKey,reserves[1].idempotencyKey);assert.equal(ui.busy.at(-1),false);
 }finally{await ui.close();}
});
test('cancelling an in-flight upload never inserts an image; oversize input never contacts the service',async()=>{
 const ui=await mount();try{
  await ui.file(3*1024*1024+1);assert.equal(ui.calls.length,0);assert.match(ui.doc.body.textContent,/3 MiB/);
  ui.pause();await ui.file();assert.ok(ui.buttons('Cancel Upload')[0]);await ui.click('Cancel Upload');
  assert.equal(ui.state.images.length,0);assert.equal(ui.busy.at(-1),false);assert.equal(ui.calls.filter(c=>c.method==='DELETE').length,1);
  ui.release();await ui.act();assert.equal(ui.state.images.length,0);
 }finally{await ui.close();}
});
test('four-image side limit disables insertion while retaining accessible replacement and removal controls',async()=>{
 const ui=await mount();try{
  await ui.update({images:Array.from({length:4},(_,i)=>({...metadata,id:`13600000-0000-4000-8000-00000000000${i+1}`,side:'front',description:'Description '+i}))});
  assert.equal(ui.buttons('Insert Image')[0].disabled,true);assert.equal(ui.buttons('Replace Image').length,4);assert.equal(ui.doc.querySelectorAll('label textarea').length,4);
 }finally{await ui.close();}
});
