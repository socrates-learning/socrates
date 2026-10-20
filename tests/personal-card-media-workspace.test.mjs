import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { loadConceptModule as load, hookHarness, jsx, ids } from './fixtures/concept-media-authoring.mjs';
const card={id:ids.placement,owner_id:ids.learner,concept_id:null,question:'Front',answer:'Back',source_reference:'Reference',updated_at:'2026-10-20T00:00:00Z'};
const image={id:ids.asset,assetId:ids.asset,side:'front',description:'Diagram',mime:'image/png',width:10,height:10,sha256:'a'.repeat(64),reservationId:ids.topic};
const media=load('lib/personal-card-media.ts',{});
const css={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
function nodes(node,out=[]){if(Array.isArray(node))node.forEach(n=>nodes(n,out));else if(node&&typeof node==='object'){out.push(node);nodes(node.props?.children,out);}return out;}
async function mount({images=[],fail=false}={}){
 const hooks=hookHarness(),calls=[],saved=[],state=[];let tree;
 const field=function PersonalCardField(){},tools=function PersonalCardImageAuthoring(){};
 let props={ownerId:ids.learner,canCreate:true,richText:true,movement:{topics:[],libraryId:ids.library},request:{card:{...card},attachment:{source:'official',topicId:ids.topic,libraryId:ids.library},topicName:'Synthetic Topic'},
  onRequest(request){props={...props,request};},onSaved(value){saved.push(value);},onEditorState(...value){state.push(value);}};
 const api=load('components/creator/StandaloneCustomCardWorkspace.tsx',{
  react:hooks.hooks,'react/jsx-runtime':jsx,'@/lib/supabase':{supabase:{}},
  '@/lib/standalone-custom-cards':{saveStandaloneCard(){throw Error('Image save must not use the text-only write');},moveStandaloneCard(){throw Error('Dirty image draft must not move');}},
  './MoveCardDialog':{MoveCardDialog(){}},'./LearnerCardTools.module.css':css,'../CreatorStudioV2Client.module.css':css,
  './PersonalCardField':{PersonalCardField:field},'./PersonalCardImageAuthoring':{PersonalCardImageAuthoring:tools},
  '@/lib/personal-card-media':{...media,loadCardImages:async()=>({cardId:card.id,front:card.question,back:card.answer,images}),postCardMedia:async(id,body)=>{
   calls.push({id,body});if(fail)throw Error('Synthetic acknowledgement failure');
   return {...card,question:body.payload.front,answer:body.payload.back,source_reference:body.payload.sourceReference,updated_at:'2026-10-20T00:01:00Z'};
  }},
 },{Error,crypto:webcrypto,window:{addEventListener(){},removeEventListener(){},confirm(){throw Error('Unexpected discard');}},requestAnimationFrame(){}});
 function render(){tree=hooks.render(()=>api.StandaloneCustomCardWorkspace(props));hooks.effects();return tree;}
 render();await Promise.resolve();render();
 return {render,calls,saved,state,finishFailure(){fail=false;},
  fields:()=>nodes(tree).filter(n=>n.type===field),
  tools:side=>nodes(tree).filter(n=>n.type===field)[side==='front'?0:1].props.media(false),
  buttons:label=>nodes(tree).filter(n=>n.type==='button'&&n.props.children===label),
  async save(){nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));render();},
  alerts:()=>nodes(tree).filter(n=>n.props?.role==='alert').map(n=>n.props.children),close:()=>hooks.cleanup(),get props(){return props;}};
}
test('workspace atomically saves text and images; lost acknowledgement keeps the draft and save identity',async()=>{
 const ui=await mount({fail:true});try{
  ui.tools('front').props.onChange([image]);ui.fields()[0].props.onChange('Updated **Front**');ui.render();
  assert.equal(ui.buttons('Move Card')[0].props.disabled,true);
  await ui.save();assert.equal(ui.saved.length,0);assert.deepEqual(ui.alerts(),['Synthetic acknowledgement failure']);
  assert.equal(ui.fields()[0].props.value,'Updated **Front**');assert.equal(ui.tools('front').props.images.length,1);
  ui.finishFailure();await ui.save();
  assert.equal(ui.calls[0].body.idempotencyKey,ui.calls[1].body.idempotencyKey);
  assert.equal(ui.calls[1].body.revision,card.updated_at);assert.equal(ui.calls[1].id,card.id);
  assert.equal(ui.calls[1].body.payload.images[0].reservationId,undefined);
  assert.equal(ui.saved[0].id,card.id);assert.equal(ui.props.request.card.updated_at,'2026-10-20T00:01:00Z');
  assert.equal(ui.tools('front').props.images[0].reservationId,undefined);
  assert.equal(ui.buttons('Move Card')[0].props.disabled,false);
 }finally{ui.close();}
});
test('fresh workspace reload restores saved references; removal waits for successful Save Card',async()=>{
 const existing={...image};delete existing.reservationId;
 const ui=await mount({images:[existing],fail:true});try{
  assert.equal(ui.tools('front').props.images[0].assetId,image.assetId);
  assert.equal(ui.tools('answer').props.images.length,0);
  ui.tools('front').props.onChange([]);ui.render();await ui.save();
  assert.equal(ui.saved.length,0);assert.equal(ui.calls[0].body.payload.images.length,0);
  ui.finishFailure();await ui.save();assert.equal(ui.saved.length,1);assert.equal(ui.props.request.card.id,card.id);
 }finally{ui.close();}
});
test('an active upload blocks save and navigation; blank image descriptions cannot be saved',async()=>{
 const ui=await mount();try{
  ui.tools('front').props.onBusy(true);ui.render();
  assert.equal(ui.buttons('Save Card')[0].props.disabled,true);assert.equal(ui.buttons('Cancel')[0].props.disabled,true);assert.equal(ui.buttons('Move Card')[0].props.disabled,true);
  await ui.save();assert.equal(ui.calls.length,0);
  ui.tools('front').props.onBusy(false);ui.tools('front').props.onChange([{...image,description:'   '}]);ui.render();await ui.save();
  assert.equal(ui.calls.length,0);assert.match(ui.alerts()[0],/description/);
 }finally{ui.close();}
});
