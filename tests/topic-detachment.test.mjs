import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as graphModule from '../lib/topic-placement-graph.ts';
import * as detachment from '../lib/topic-detachment.ts';
import { graphFromNodes } from './fixtures/shared-topic-branches.mjs';
import { buildConceptTopicTree } from '../lib/concept-topic-tree.ts';
import { composeHomeGroups } from '../lib/home-deck-settings.ts';
import { editor } from './fixtures/creator-question-workflow.mjs';

const dom=new JSDOM('<button id="trigger">Remove</button><div id="mount"></div>',{pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','HTMLDialogElement','Event','MouseEvent']) globalThis[k]=dom.window[k];
globalThis.requestAnimationFrame=callback=>callback();
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
function load(path) {
 const context={exports:{},require(name){
  if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;
  if(name==='@/lib/topic-placement-graph')return graphModule;if(name==='@/lib/topic-detachment')return detachment;
  if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  throw Error(name);
 },document,HTMLElement,requestAnimationFrame};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 return context.exports;
}
const {TopicDetachmentDialog}=load('components/TopicDetachmentDialog.tsx');
const {TopicAssignmentWorkspace}=load('components/TopicAssignmentWorkspace.tsx');
function graph(removed=false) {
 const g=graphFromNodes('library',[{id:'root',name:'Library',parent_id:null},{id:'a',name:'A',parent_id:'root'},{id:'child',name:'Child',parent_id:'a'},{id:'other',name:'Other',parent_id:'root'}]);
 return {...g,version:132,detachment_version:134,unassigned_topic_ids:removed?['child']:[],detached_original_topic_ids:removed?['a','child']:[],locations:[...g.nodes.filter(n=>!removed||!['a','child'].includes(n.id)).map(n=>({id:n.id,topic_id:n.id,library_id:g.library_id,parent_location_id:n.parent_id,sort_order:n.sort_order,is_original:true})),{id:'alias',topic_id:'a',library_id:'library',parent_location_id:'other',sort_order:1,is_original:false}]};
}
const review={library_id:'library',location_id:'a',topic_id:'a',name:'A',path:'Library › A',descendant_count:1,other_placements:1,unassigned_topics:[{id:'child',name:'Child'}],blocked_by_personal_anchor:false,content_preserved:true,review_revision:'a'.repeat(32)};
const success={data:{removed_location_id:'a',content_preserved:true,graph:graph(true)},error:null};
test('detached canonical Topics are retained but excluded from visible locations and Home',()=>{
 const g=graph(true),index=graphModule.indexTopicLocations(g);
 assert.ok(index.nodes.has('child'));assert.equal(index.byTopic.has('child'),false);
 assert.equal(graphModule.originalTopicOccurrenceKey(g,'a'),'location:alias');assert.equal(graphModule.originalTopicOccurrenceKey(g,'child'),'');
 const flatten=items=>items.flatMap(n=>[n,...flatten(n.children)]);
 const home=flatten(composeHomeGroups(g.nodes,[],[],[],g));
 assert.ok(!home.some(n=>n.id==='child'));assert.equal(home.filter(n=>n.id==='a').length,1);
 assert.deepEqual([...graphModule.topicDescendantIds(g,'a')],['a']);
});
for(const [name,mutate] of [['missing metadata',g=>delete g.detached_original_topic_ids],['false Unassigned',g=>g.unassigned_topic_ids=[]],['duplicate metadata',g=>g.unassigned_topic_ids.push('child')],['unknown canonical ID',g=>g.unassigned_topic_ids.push('unknown')],['undeclared lost original',g=>g.detached_original_topic_ids=['child']]]) test(`detachment graph rejects ${name}`,()=>{const g=graph(true);mutate(g);assert.throws(()=>graphModule.indexTopicLocations(g));});
test('Creator opens review without a write and preserves selected Concept associations and draft',async()=>{
 const h=editor({editing:true,confirm:()=>assert.fail('native confirmation forbidden')});h.props.initialTopicGraph=graph();h.props.initialTopics=buildConceptTopicTree(graph().nodes,true);h.props.initialConcept.placementIds=['child'];
 let e=h.render();e.setActiveTopicId('a');e.setActiveTopicOccurrence('location:a');e.setConcept('Unsaved content');e=h.render();await e.deleteActiveTopic();
 e=h.render();assert.equal(e.detachmentRequest.locationId,'a');assert.equal(h.calls.length,0);
 e.installTopicAssignmentGraph(graph(true));e=h.render();assert.deepEqual([...e.selectedTopicIds],['child']);assert.equal(e.concept,'Unsaved content');assert.equal(e.activeTopicId,'root');
});
test('Creator fails closed without Migration 134',async()=>{
 const h=editor();h.props.initialTopicGraph={...graph(),detachment_version:undefined};h.props.initialTopics=buildConceptTopicTree(graph().nodes,true);
 let e=h.render();e.setActiveTopicId('a');e=h.render();await e.deleteActiveTopic();assert.equal(h.calls.length,0);assert.match(h.render().status.message,/migration/i);
});
for(const role of ['learner','editor']) test(`${role} cannot open official removal`,async()=>{
 const h=editor({role});h.props.initialTopicGraph=graph();h.props.initialTopics=buildConceptTopicTree(graph().nodes,true);let e=h.render();e.setActiveTopicId('a');e=h.render();await e.deleteActiveTopic();assert.equal(h.calls.length,0);assert.equal(h.render().detachmentRequest,null);
});
test('removal uses only reviewed location and revision',async()=>{
 const calls=[];assert.equal((await detachment.removeReviewedTopic(async(name,args)=>{calls.push({name,args});return success;},review)).detachment_version,134);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'detach_official_topic_location');assert.deepEqual(calls[0].args,{p_library_id:'library',p_location_id:'a',p_review_revision:review.review_revision});
});
for(const [label,result] of [['permission',{data:null,error:{code:'42501',message:'denied'}}],['network',null],['unconfirmed',{data:{...success.data,removed_location_id:'wrong'},error:null}],['still present',{data:{...success.data,graph:graph()},error:null}]]) test(`failed ${label} removal cannot report success`,async()=>{
 await assert.rejects(()=>detachment.removeReviewedTopic(async()=>{if(!result)throw Error('network');return result;},review));
});
test('personal anchor block never calls removal',async()=>{await assert.rejects(()=>detachment.removeReviewedTopic(()=>assert.fail('no write'),{...review,blocked_by_personal_anchor:true}));});

async function mount(Component,props) {document.getElementById('trigger').focus();const root=createRoot(document.getElementById('mount'));await act(async()=>root.render(React.createElement(Component,props)));return {root,async close(){await act(async()=>root.unmount());}};}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
test('mounted confirmation loads exact consequences, focuses Cancel and restores focus on cancellation',async()=>{
 let cancel=0,writes=0;const h=await mount(TopicDetachmentDialog,{libraryId:'library',locationId:'a',rpc:async(name)=>{if(name!=='review_official_topic_detachment')writes++;return {data:review,error:null};},onCancel:()=>cancel++,onRemoved:()=>assert.fail()});
 assert.equal(document.activeElement,button('Cancel'));assert.ok(document.querySelector('dialog[open]'));assert.match(document.body.textContent,/Library › A/);assert.match(document.body.textContent,/learning history will be preserved/);
 await act(async()=>document.querySelector('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));assert.equal(cancel,1);assert.equal(writes,0);await h.close();assert.equal(document.activeElement.id,'trigger');
});
test('dialog focus wraps both directions and remains contained while all actions are disabled',async()=>{
 const h=await mount(TopicDetachmentDialog,{libraryId:'library',locationId:'a',rpc:async()=>({data:review,error:null}),onCancel(){},onRemoved(){}});
 const modal=document.querySelector('dialog');let prevented=0;
 button('Remove Topic').focus();detachment.containTopicDialogFocus({key:'Tab',shiftKey:false,currentTarget:modal,preventDefault(){prevented++;}});assert.equal(document.activeElement,button('Cancel'));
 detachment.containTopicDialogFocus({key:'Tab',shiftKey:true,currentTarget:modal,preventDefault(){prevented++;}});assert.equal(document.activeElement,button('Remove Topic'));
 for(const b of modal.querySelectorAll('button'))b.disabled=true;
 detachment.containTopicDialogFocus({key:'Tab',shiftKey:false,currentTarget:modal,preventDefault(){prevented++;}});assert.equal(document.activeElement,modal);assert.equal(prevented,3);await h.close();
});
test('pending removal prevents duplicate writes and waits for confirmed success',async()=>{
 let finish,writes=0,removed=0;const h=await mount(TopicDetachmentDialog,{libraryId:'library',locationId:'a',rpc:async(name)=>name==='review_official_topic_detachment'?{data:review,error:null}:(writes++,await new Promise(r=>finish=r)),onCancel:()=>assert.fail('cannot cancel pending'),onRemoved:()=>removed++});
 await act(async()=>{button('Remove Topic').click();button('Remove Topic')?.click();});assert.equal(writes,1);assert.equal(removed,0);assert.equal(button('Cancel').disabled,true);
 await act(async()=>document.querySelector('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));assert.equal(removed,0);
 await act(async()=>finish(success));assert.equal(removed,1);await h.close();
});
test('failed mounted removal stays visible with a clear error',async()=>{
 const h=await mount(TopicDetachmentDialog,{libraryId:'library',locationId:'a',rpc:async(name)=>name==='review_official_topic_detachment'?{data:review,error:null}:{data:null,error:{code:'PT409',message:'stale'}},onCancel(){},onRemoved:()=>assert.fail()});
 await act(async()=>button('Remove Topic').click());assert.ok(document.querySelector('dialog[open]'));assert.match(document.querySelector('[role="alert"]').textContent,/Topic Tree changed/);assert.equal(button('Cancel').disabled,false);await h.close();
});
test('Unassigned list selects and reassigns through exact captured revision without editing content',async()=>{
 const calls=[];let saved=0;const g=graph(true),next=structuredClone(g);next.unassigned_topic_ids=[];next.detached_original_topic_ids=['a'];next.locations.push({id:'new',topic_id:'child',library_id:'library',parent_location_id:'other',sort_order:2,is_original:true});
 const h=await mount(TopicAssignmentWorkspace,{graph:g,canManage:true,children:React.createElement('p',null,'Existing tree'),rpc:async(name,args)=>{calls.push({name,args});return name==='list_unassigned_official_topics'?{data:{library_id:'library',revision:g.revision,total:1,topics:[{id:'child',name:'Child',concept_count:1,question_count:1}]},error:null}:{data:{topic_id:'child',location_id:'new',graph:next},error:null};},onReassigned:()=>saved++});
 assert.match(document.body.textContent,/Existing tree/);await act(async()=>button('Unassigned').click());assert.match(document.body.textContent,/1 Concepts/);
 await act(async()=>document.querySelector('button strong').parentElement.click());await act(async()=>button('Reassign Topic').click());assert.ok(document.querySelector('dialog[open]'));
 await act(async()=>{const select=document.querySelector('select');select.value='other';select.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Reassign Topic').click());
 assert.equal(saved,1);const call=calls.find(c=>c.name==='reassign_official_topic');assert.equal(call.args.p_expected_revision,g.revision);assert.equal(call.args.p_parent_location_id,'other');assert.equal(calls.length,2);await h.close();
});
