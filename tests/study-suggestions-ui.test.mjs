import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import * as contract from '../lib/study-suggestions.ts';
const id=n=>`12900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const receipt={id:id(9),submittedAt:'2026-10-15T20:00:00Z'};
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'||typeof n==='number'?String(n):'';
function setup(transport=async()=>({ok:true,json:async()=>receipt}),questionId=id(3)){
 const h=hookHarness(),calls=[];let generated=0,focused=0;
 const modal={open:false,showModal(){this.open=true;},close(){this.open=false;}};
 const Component=loadConceptModule('components/study-planner/StudySuggestion.tsx',{
  react:h.hooks,'react/jsx-runtime':jsx,'@/lib/study-suggestions':contract,'./StudySuggestion.module.css':{__esModule:true,default:{}},
 },{crypto:{randomUUID:()=>id(++generated)},fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body),options]);return transport();}}).StudySuggestion;
 const render=()=>h.render(()=>Component({libraryId:id(2),questionId}));
 const get=type=>nodes(render()).find(n=>n.type===type);
 get('dialog').props.ref.current=modal;get('button').props.ref.current={focus(){focused++;}};
 const button=name=>nodes(render()).find(n=>n.type==='button'&&text(n)===name);
 return {calls,modal,render,get,button,focused:()=>focused,generated:()=>generated,text:()=>text(render()),edit(value){get('textarea').props.onChange({target:{value}});},submit(){return get('form').props.onSubmit({preventDefault(){}});}};
}
test('opening, Cancel, Escape and keyboard containment make no study or submission requests',()=>{
 const s=setup();s.button('Suggest an Improvement').props.onClick();assert.equal(s.modal.open,true);
 assert.equal(s.get('dialog').props['aria-labelledby'],'study-suggestion-title');assert.ok(s.get('select').props.autoFocus);
 let stopped=0;s.render().props.onClick({stopPropagation(){stopped++;}});s.render().props.onKeyDown({stopPropagation(){stopped++;}});assert.equal(stopped,2);
 s.button('Cancel').props.onClick();assert.equal(s.modal.open,false);assert.equal(s.focused(),1);
 s.button('Suggest an Improvement').props.onClick();s.get('dialog').props.onCancel({preventDefault(){}});assert.equal(s.modal.open,false);assert.equal(s.calls.length,0);
});
test('success sends only approved fields, shows a receipt and does not advance Study',async()=>{
 const s=setup();s.edit('Please clarify the explanation.');await s.submit();
 assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'/api/study/suggestions');
 assert.deepEqual(Object.keys(s.calls[0][1]).sort(),['category','libraryId','message','questionId','requestId']);
 assert.match(s.text(),/Suggestion submitted/);assert.equal(s.calls[0][2].redirect,'error');
 s.button('Return to Study').props.onClick();s.button('Suggest an Improvement').props.onClick();assert.equal(s.get('textarea').props.value,'');
});
test('Tab and Shift+Tab wrap inside the dialog, including while controls are disabled',()=>{
 const s=setup();let firstFocused=0,lastFocused=0,dialogFocused=0,prevented=0;
 const first={focus(){firstFocused++;}},last={focus(){lastFocused++;}};
 const target={querySelectorAll:()=>[first,last],focus(){dialogFocused++;}};
 const key=s.get('dialog').props.onKeyDown;
 key({key:'Tab',target:last,currentTarget:target,shiftKey:false,preventDefault(){prevented++;}});
 key({key:'Tab',target:first,currentTarget:target,shiftKey:true,preventDefault(){prevented++;}});
 target.querySelectorAll=()=>[];key({key:'Tab',target,currentTarget:target,preventDefault(){prevented++;}});
 assert.deepEqual([firstFocused,lastFocused,dialogFocused,prevented],[1,1,1,3]);
});
test('double submission and Escape are blocked during a pending request',async()=>{
 let done;const s=setup(()=>new Promise(r=>done=r));s.button('Suggest an Improvement').props.onClick();s.edit('Keep this draft');const pending=s.submit();
 await s.submit();assert.equal(s.calls.length,1);assert.ok(s.button('Submitting…').props.disabled);assert.ok(s.button('Cancel').props.disabled);
 s.get('dialog').props.onCancel({preventDefault(){}});assert.equal(s.modal.open,true);
 done({ok:true,json:async()=>receipt});await pending;
});
test('lost acknowledgements freeze and retry exactly the same payload after cancel/reopen',async()=>{
 let fail=true;const s=setup(async()=>{if(fail)throw new TypeError('network');return {ok:true,json:async()=>receipt};});
 s.edit('Do not duplicate this suggestion');await s.submit();assert.ok(s.get('textarea').props.disabled);assert.equal(s.get('textarea').props.value,'Do not duplicate this suggestion');
 s.button('Cancel').props.onClick();s.button('Suggest an Improvement').props.onClick();fail=false;await s.submit();
 assert.deepEqual(s.calls[0][1],s.calls[1][1]);assert.equal(s.generated(),1);assert.match(s.text(),/Suggestion submitted/);
});
test('definitive input/rate errors retain editable text and never show success',async()=>{
 for(const status of [400,401,403,413,415,429]){
  const s=setup(async()=>({ok:false,status,json:async()=>({error:'Please try later.'})}));s.edit('My message');await s.submit();
  assert.equal(s.get('textarea').props.value,'My message');assert.equal(s.get('textarea').props.disabled,false);assert.match(s.text(),/Please try later/);assert.doesNotMatch(s.text(),/Suggestion submitted/);
 }
});
test('personal Cards omit identifiers/content and invalid receipts remain retryable',async()=>{
 const s=setup(async()=>({ok:true,json:async()=>({})}),null);s.edit('A general improvement');await s.submit();
 assert.equal(s.calls[0][1].questionId,null);assert.match(s.text(),/personal Card and notes are not attached/);assert.doesNotMatch(s.text(),/Suggestion submitted/);assert.ok(s.button('Retry Suggestion'));
});
