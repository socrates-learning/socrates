import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import ts from 'typescript';import vm from 'node:vm';
import {questionMedia as media,loadQuestionModule,hookHarness,jsx,ids,questionIds as q} from './fixtures/question-media-authoring.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const flush=()=>new Promise(r=>setImmediate(r));
const hint={questionId:q.question,versionId:q.version,libraryId:ids.library,front:true,answer:true};
const placements=['front','answer'].map((surface,i)=>({placementId:i?q.asset:q.placement,assetId:q.asset,surface,ordinal:0,altText:surface,caption:'',mime:'image/png',width:2,height:3,sha256:'a'.repeat(64)}));
function setup(fetch=()=>{throw Error('Unexpected fetch')}){
 const h=hookHarness();const mod=loadQuestionModule('components/QuestionMediaContent.tsx',{react:h.hooks,'react/jsx-runtime':jsx,'./VerifiedMediaImage':{__esModule:true,default:'verified-image'},'@/lib/question-media':media},{fetch});
 return {h,render:p=>h.render(()=>mod.default(p))};
}
const props={questionId:q.question,hint,surface:'front',prompt:'Prompt',answer:'Answer'};
test('no-image surfaces render null and perform zero metadata or byte requests',()=>{
 for(const presentation of [undefined,'study'])for(const surface of ['front','answer']){const s=setup();assert.equal(s.render({...props,surface,presentation,hint:{...hint,front:false,answer:false}}),null);s.h.effects();assert.equal(s.render({...props,surface,presentation,hint:null}),null);s.h.effects();}
});
test('Study-only bounds scale each image by its intrinsic ratio while other surfaces keep their exact figure boundary',async()=>{
 const dimensions=[[600,360],[600,1000],[600,600],[80,40]];
 for(const surface of ['front','answer']){
  const items=dimensions.map(([width,height],i)=>({...placements[0],placementId:`${surface}-${i}`,surface,ordinal:i,width,height,altText:`Figure ${i}`,caption:`Caption ${i}`}));
  const calls=[];const s=setup(async url=>{calls.push(url);return Response.json({...hint,prompt:'Prompt',answer:'Answer',placements:items});});
  s.render({...props,surface});s.h.effects();await flush();
  const ordinary=s.render({...props,surface});const bounded=s.render({...props,surface,presentation:'study'});s.h.effects();
  assert.equal(calls.length,1,'Changing presentation does not refetch metadata');
  assert.equal(bounded.props.children.length,4);
  bounded.props.children.forEach((row,i)=>{
   const original=ordinary.props.children[i],image=row.props.children;
   assert.equal(original.type,'verified-image');assert.equal(row.type,'div');assert.equal(row.key,items[i].placementId);
   assert.equal(row.props.style.flexShrink,0);
   assert.equal(row.props.style.width,`min(100%, ${items[i].width}px, calc(min(32dvh, 280px) * ${items[i].width/items[i].height}))`);
   assert.equal(image.type,original.type);assert.deepEqual(image.props,original.props,'Alt text, caption, order, immutable identity and private delivery stay unchanged');
  });s.h.cleanup();
 }
});
test('only official Front media opts out of released centering; no-image, Answer-only and personal Front styles remain absent',()=>{
 const source=read('components/StudyPlanner.tsx'),ast=ts.createSourceFile('StudyPlanner.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let container,heading;
 function visit(n){
  if(ts.isJsxOpeningElement(n)){
   const attributes=n.attributes.properties;
   const style=attributes.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='style')?.initializer;
   if(style&&ts.isJsxExpression(style)&&style.expression?.getText(ast).startsWith("studyCandidate?.kind === 'official' && studyCandidate.mediaHint?.front ?")){
    if(n.tagName.getText(ast)==='div')container=style.expression.getText(ast);
    if(n.tagName.getText(ast)==='h1')heading=style.expression.getText(ast);
   }
  }ts.forEachChild(n,visit);
 }visit(ast);assert.ok(container&&heading);
 for(const [candidate,aligned]of [[{kind:'official',mediaHint:{front:true,answer:false}},true],[{kind:'official',mediaHint:{front:true,answer:true}},true],[{kind:'official',mediaHint:{front:false,answer:true}},false],[{kind:'official'},false],[{kind:'personal',mediaHint:{front:true}},false],[null,false]]){
  const result=vm.runInNewContext(`({container:${container},heading:${heading}})`,{studyCandidate:candidate});
  if(aligned)assert.deepEqual(JSON.parse(JSON.stringify(result)),{container:{justifyContent:'flex-start'},heading:{margin:'0 auto',flexShrink:0}});
  else{assert.equal(result.container,undefined);assert.equal(result.heading,undefined);}
 }
});
test('each mounted surface contains only its ordered figures; summaries never mount image delivery',async()=>{
 for(const surface of ['front','answer']){
  const calls=[];const s=setup(async(url,options)=>{calls.push({url,options});return Response.json({...hint,prompt:'Prompt',answer:'Answer',placements});});
  s.render({...props,surface});s.h.effects();await flush();const tree=s.render({...props,surface});
  assert.equal(tree.props.children.length,1);assert.equal(tree.props.children[0].props.placement.surface,surface);assert.equal(tree.props.children[0].props.src,`/api/content-media/delivery/${placements.find(p=>p.surface===surface).placementId}`);
  assert.equal(calls.length,1);assert.match(calls[0].url,/\/questions\//);assert.equal(calls[0].options.cache,'no-store');s.h.cleanup();
 }
 assert.doesNotMatch(read('components/creator/CreatorQuestionSearchPanel.tsx'),/QuestionMediaContent|VerifiedMediaImage|content-media/);
 const creator=read('components/CreatorStudioV2Client.tsx');const list=creator.slice(creator.indexOf('Existing Questions · Newest first'));assert.doesNotMatch(list,/QuestionMediaContent/);
});
test('version/text/Library mismatch or failed read renders unavailable without pairing another image',async()=>{
 for(const change of [{versionId:q.asset},{prompt:'Other'},{answer:'Other'},{libraryId:q.asset},{questionId:q.asset}]){
  const s=setup(async()=>Response.json({...hint,prompt:'Prompt',answer:'Answer',placements,...change}));s.render(props);s.h.effects();await flush();const tree=s.render(props);assert.match(JSON.stringify(tree),/Image unavailable/);assert.doesNotMatch(JSON.stringify(tree),/verified-image/);s.h.cleanup();
 }
 const s=setup();assert.match(JSON.stringify(s.render({...props,hint:{...hint,unavailable:true}})),/Image unavailable/);s.h.effects();
 const missing=setup();assert.match(JSON.stringify(missing.render({...props,hint:{unavailable:true}})),/Image unavailable/);missing.h.effects();
});
test('late metadata response cannot populate another Question context',async()=>{
 let resolve;const s=setup(()=>new Promise(r=>{resolve=r;}));s.render(props);s.h.effects();const next={...props,questionId:q.asset,hint:null};s.render(next);s.h.effects();resolve(Response.json({...hint,prompt:'Prompt',answer:'Answer',placements}));await flush();assert.equal(s.render(next),null);
});
test('Study/Cram Answer figures exist only under the existing revealed Answer branch; official detail stays front-only',()=>{
 const study=read('components/StudyPlanner.tsx');assert.equal((study.match(/<QuestionMediaContent /g)||[]).length,3);
 assert.equal((study.match(/answer=\{studyCandidate.answer\} presentation="study"/g)||[]).length,3);
 const reveal=study.indexOf('className="study-v2-answer-section"');const image=study.indexOf('surface="answer"',reveal);assert.ok(image>reveal);assert.ok(image<study.indexOf('{authoredStudyExplanation',reveal));
 assert.match(study,/studyCandidate\?\.kind === 'official' && <QuestionMediaContent/);
 for(const file of ['components/StudyCreatorFlaggedBrowser.tsx','components/SocratesStudyCreatorBrowser.tsx']){const text=read(file);assert.equal((text.match(/<QuestionMediaContent /g)||[]).length,1);assert.match(text,/surface="front"/);assert.doesNotMatch(text,/surface="answer"|presentation="study"/);}
});
