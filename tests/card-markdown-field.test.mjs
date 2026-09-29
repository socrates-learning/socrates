import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as editing from '../lib/markdown-editing.ts';
const source=readFileSync(new URL('../components/creator/CardMarkdownField.tsx',import.meta.url),'utf8');
function field(initial={}) {
 const slots=[];let cursor=0;const writes=[],frames=[],focus=[];
 let props={label:'Front',value:'Selected',onChange(value){writes.push(value);props={...props,value};},maxLength:10000,required:true,...initial};
 const modules={react:{useId:()=> 'front-id',useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],v=>{slots[i]=v;}];}},
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  '@/lib/markdown-editing':editing,'@/components/MarkdownContent':{MarkdownContent(){}},
  '../CreatorStudioV2Client.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>key})}};
 const context={exports:{},requestAnimationFrame(fn){frames.push(fn);},require(name){assert.ok(name in modules,name);return modules[name];}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return [];return [node,...nodes(node.props?.children)];}
 function render(){cursor=0;const tree=context.exports.CardMarkdownField(props);const textarea=nodes(tree).find(n=>n.type==='textarea');if(textarea) textarea.props.ref.current={selectionStart:0,selectionEnd:props.value.length,focus(){focus.push('focus');},setSelectionRange(a,b){focus.push([a,b]);}};else slots[0].current=null;return tree;}
 function button(label){return nodes(render()).find(n=>n.type==='button'&&n.props.children===label);}
 return {render,nodes,button,writes,frames,focus,get props(){return props;}};
}
test('field exposes seven native tools and independent Write/Preview without persistence',()=>{
 const h=field();const nodes=h.nodes(h.render());
 assert.deepEqual(nodes.filter(n=>n.type==='button').map(n=>n.props.children),['Bold','Italic','Heading','Bulleted List','Numbered List','Link','Quote','Write','Preview']);
 assert.ok(nodes.every(n=>n.type!=='button'||n.props.type==='button'));
 const textarea=nodes.find(n=>n.type==='textarea');assert.equal(textarea.props.id,'front-id');assert.equal(textarea.props.required,true);assert.equal(textarea.props.maxLength,10000);
 assert.equal(nodes.find(n=>n.type==='label').props.htmlFor,'front-id');assert.equal(h.writes.length,0);
 h.button('Preview').props.onClick();let tree=h.render();assert.equal(h.writes.length,0);
 assert.ok(h.nodes(tree).some(n=>n.props?.['aria-label']==='Front preview'));
 const preview=h.nodes(tree).find(n=>n.type?.name==='MarkdownContent');assert.equal(preview.props.markdown,'Selected');assert.equal(preview.props.mode,'card');
 h.button('Write').props.onClick();tree=h.render();assert.equal(h.nodes(tree).find(n=>n.type==='textarea').props.value,'Selected');assert.equal(h.writes.length,0);
 const back=field({label:'Back',value:'Answer',maxLength:20000});assert.equal(back.button('Write').props['aria-pressed'],true);
});
test('formatting dispatches controlled source once and restores selection after render',()=>{
 for(const [name,format] of [['Bold','bold'],['Italic','italic'],['Heading','heading'],['Bulleted List','bulleted-list'],['Numbered List','numbered-list'],['Link','link'],['Quote','quote']]) {
  const h=field();h.button(name).props.onClick();const expected=editing.applyMarkdownEdit('Selected',0,8,format);
  assert.deepEqual(h.writes,[expected.source]);assert.equal(h.focus.length,0);h.render();assert.equal(h.frames.length,1);h.frames[0]();assert.deepEqual(h.focus,['focus',[expected.selectionStart,expected.selectionEnd]]);
 }
});
test('Preview formatting retains selection and returns to Write; disabled tools cannot edit',()=>{
 const h=field();const area=h.nodes(h.render()).find(n=>n.type==='textarea');area.props.onSelect({currentTarget:{selectionStart:1,selectionEnd:4}});
 h.button('Preview').props.onClick();h.render();h.button('Bold').props.onClick();assert.deepEqual(h.writes,['S**ele**cted']);assert.equal(h.button('Write').props['aria-pressed'],true);
 const locked=field({disabled:true});assert.ok(locked.nodes(locked.render()).filter(n=>n.type==='button').every(n=>n.props.disabled));locked.button('Bold').props.onClick();assert.equal(locked.writes.length,0);
});
test('toolbar cannot exceed field limit and rejected insertion leaves source intact',()=>{
 const h=field({value:'12345',maxLength:5});h.button('Bold').props.onClick();assert.equal(h.writes.length,0);assert.equal(h.frames.length,0);
 const error=h.nodes(h.render()).find(n=>n.props?.role==='alert');assert.match(error.props.children,/5 characters/);assert.equal(h.props.value,'12345');
});
test('Card field stays presentation-only with no saving, routing or database dependency',()=>{
 const source=readFileSync(new URL('../components/creator/CardMarkdownField.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/supabase|saveStandaloneCard|fetch\(|useRouter|dangerouslySetInnerHTML/);
});
