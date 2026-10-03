import * as officialFormat from '../lib/official-content-format.ts';
import { questionContentBoundary } from './fixtures/question-media-authoring.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { editor, nodes, text } from './fixtures/creator-role-workspaces.mjs';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
function load(source, modules) {
 const context={exports:{},URL,require(name){assert.ok(name in modules, `Unexpected dependency: ${name}`);return modules[name];}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
const markdown=load(read('components/MarkdownContent.tsx'),{'@/lib/official-content-format':officialFormat,react:React,'react/jsx-runtime':jsx,'./MarkdownContent.module.css':{default:{card:'card'}}});
const rich='## Central Line Care\nRemember **sterile technique** and *hand hygiene*.\n- Assess the site\n- Change dressing\n\n> Watch closely.\n[CDC guidance](https://www.cdc.gov)';
const planner=read('components/StudyPlanner.tsx');
// Compile the actual presentation expressions; no copied candidate rendering expectations.
const ast=ts.createSourceFile('planner.tsx',planner,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const expressions=[];
function walk(node){if(ts.isConditionalExpression(node)&&node.condition.getText(ast)==="studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null")expressions.push(node.getText(ast));ts.forEachChild(node,walk);}
walk(ast);
function renderStudy(index,kind,concept){
 const source=`export function View({studyCandidate,studyAnswer}){return (${expressions[index]});}`;
 const {View}=load(source,{'react/jsx-runtime':jsx});
 // Resolve the renderer identifier without moving any production ownership.
 const context={exports:{},...markdown,require:()=>jsx};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 assert.equal(typeof View,'function');
 return renderToStaticMarkup(React.createElement(context.exports.View,{studyCandidate:{kind,personalConceptId:concept,prompt:rich},studyAnswer:rich}));
}
test('all three Study/Cram slots preserve standalone rich text and legacy plain text independently of official opt-in',()=>{
 assert.equal(expressions.length,3);
 for(let i=0;i<3;i++){
  const html=renderStudy(i,'personal',null);assert.match(html,/<h2>Central Line Care<\/h2>/);assert.match(html,/<blockquote>/);assert.match(html,/<strong>sterile technique<\/strong>/);
  assert.doesNotMatch(html,/<(?:h1|h2|p)[^>]*><div/);
  if(i===0)assert.doesNotMatch(html,/<a /);else assert.match(html,/<a href="https:\/\/www.cdc.gov"/);
  const official=renderStudy(i,'official','concept');assert.match(official,/\*\*sterile technique\*\*/);assert.doesNotMatch(official,/<strong>|<a /);
  if(i===1)assert.match(html,/<h2 id="study-revealed-question-heading" class="study-v2-sr-only">## Central Line Care/);
  for(const [kind,concept] of [['personal','concept']]){
   const legacy=renderStudy(i,kind,concept);assert.match(legacy,/## Central Line Care/);assert.doesNotMatch(legacy,/<a |<blockquote>|<strong>/);
  }
 }
 assert.match(planner,/event.key === 'Enter' \|\| event.key === ' '/);
 assert.match(planner,/Press Enter or Space, or activate the card, to reveal the answer/);
 assert.match(planner,/role=\{!hasStudyCandidate \|\| isAnswerVisible \? undefined : 'button'\}/);
});
test('only learner standalone authoring opts in; staff remains plain and legacy learner editor stays plain',()=>{
 for(const role of ['admin','editor','learner']){
  const h=editor({role,placed:true});let e=h.render();
  if(role==='learner')nodes(e.tree).find(n=>n.props?.['aria-label']==='Make Topic the active topic').props.onClick();
  else nodes(e.tree).find(n=>n.type==='button' && text(n)==='Add Custom Card').props.onClick();
  e=h.render();const child=nodes(e.tree).find(n=>n.type?.name==='StandaloneCustomCardWorkspace');assert.ok(child);assert.equal(child.props.richText,role==='learner'?true:undefined);
 }
});
function flag(kind){
 let cursor=0;const states=[[{id:'flag',personal_card_id:'card',question_id:null,note:'Keep this note',created_at:'2026-01-01T00:00:00Z'}],[],[],'flag','',false,null,''];
 const modules={react:{useState:()=>[states[cursor++],()=>{}],useMemo:f=>f(),useCallback:f=>f,useEffect(){}},'react/jsx-runtime':jsx,'@/components/QuestionMediaContent': questionContentBoundary, '@/lib/supabase':{supabase:{}},'@/components/MarkdownContent':markdown,'./StudyCreatorIcon':{StudyCreatorIcon:()=>null},'./StudyCreatorClient.module.css':{default:{}}};
 const {StudyCreatorFlaggedBrowser}=load(read('components/StudyCreatorFlaggedBrowser.tsx'),modules);
 const card={id:'card',concept_id:kind==='standalone'?null:'concept',question:rich,answer:rich};
 return renderToStaticMarkup(React.createElement(StudyCreatorFlaggedBrowser,{ownerId:'owner',neutralPresentation:true,material:{cards:kind==='standalone'?[]:[card],standaloneCards:kind==='standalone'?[card]:[],concepts:[],topics:[],overlays:[]}}));
}
test('Flagged standalone details format both fields but list is a noninteractive summary; legacy remains literal',()=>{
 const html=flag('standalone');const list=html.slice(0,html.indexOf('aria-label="Flagged item review"'));
 assert.match(list,/Central Line Care/);assert.doesNotMatch(list,/<a |<blockquote>|## Central/);
 assert.equal((html.match(/<a href=/g)||[]).length,2);assert.match(html,/Keep this note/);assert.match(html,/>Unflag</);
 const legacy=flag('legacy');assert.match(legacy,/## Central Line Care/);assert.doesNotMatch(legacy,/<a |<blockquote>/);
});
