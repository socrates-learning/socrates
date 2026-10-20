import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConceptModule as load, hookHarness, jsx, ids } from './fixtures/concept-media-authoring.mjs';
const base='23e401095f78968d65ecd0fc202c0927898ea086';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const original=path=>execFileSync('git',['show',base+':'+path],{encoding:'utf8'});

test('Study integration changes only the three personal image mounts and their import',()=>{
 const path='components/StudyPlanner.tsx';const text=source(path);
 const additions=text.split('\n').filter(line=>line.includes('PersonalCardMediaContent'));
 assert.equal(additions.length,4);
 assert.equal(additions.filter(line=>line.includes('side="answer"')).length,1);
 const project=value=>{
  const lines=value.split('\n');
  for(const line of new Set(additions)){
   const count=additions.filter(item=>item===line).length;
   assert.equal(lines.filter(item=>item===line).length,count);
  }
  value=lines.filter(line=>!additions.includes(line)).join('\n');
  assert.equal(value,original(path),'All scheduling, reveal, feedback, selection and saving source remains exact');return value;
 };
 project(text);assert.throws(()=>project(text.replace('persistFinalStudyResponse','changedStudyResponse')));
 const reveal=text.indexOf(') : !isAnswerVisible ? (');const back=text.indexOf('side="answer"');
 const revealed=text.indexOf('className="study-v2-answer-body"',reveal);
 assert.ok(reveal>0&&revealed>reveal&&back>revealed);
});
test('official authoring, Card movement/search/history and account deletion sources remain exact',()=>{
 for(const path of ['components/CreatorStudioV2Client.tsx','lib/standalone-custom-cards.ts','lib/personal-card-authoring.ts','components/MarkdownContent.tsx',
 'lib/learner-card-search.ts','lib/study-candidates.ts','lib/account-deletion.ts','lib/account-deletion-recovery.mjs',
 'lib/content-media/image.ts','lib/content-media/decoder-worker.cjs','lib/content-media/service.ts','lib/content-media/cleanup.ts',
 'supabase/111_standalone_custom_cards.sql','supabase/127_account_deletion.sql','supabase/132_independent_topic_locations.sql',
 'supabase/135_admin_personal_card_creation.sql']){
  // The exact known file list is intentional; an absent protected file is a failure.
  assert.equal(source(path),original(path),path);
 }
});
test('side renderer never mounts Back bytes for the Front and rejects stale Card text',async()=>{
 const card='13600000-0000-4000-8000-000000000001';
 const images=['front','answer'].map((side,i)=>({id:ids.placement.replace(/.$/,String(i)),assetId:ids.asset,side,description:side,mime:'image/png',width:10,height:10,sha256:'a'.repeat(64)}));
 const hooks=hookHarness();
 const api=load('components/PersonalCardMediaContent.tsx',{react:hooks.hooks,'react/jsx-runtime':jsx,
  './VerifiedMediaImage':{__esModule:true,default:()=>null},'@/lib/personal-card-media':{
   loadCardImages:async()=>({cardId:card,front:'Front',back:'Back',images}),cardImageSource:()=>'/private',
  }});
 const render=props=>hooks.render(()=>api.default({cardId:card,side:'front',front:'Front',back:'Back',...props}));
 assert.equal(render(),null);hooks.effects();await Promise.resolve();
 const front=render();assert.equal(front.props.children.length,1);assert.equal(front.props.children[0].props.image.side,'front');
 const answer=render({side:'answer'});assert.equal(answer.props.children[0].props.image.side,'answer');
 const stale=render({front:'Stale'});assert.equal(stale.props.role,'status');assert.match(stale.props.children,/changed/);
 hooks.cleanup();
});
test('image identities cannot become arbitrary remote URLs; descriptions and immutable identity survive fingerprints',()=>{
 const media=load('lib/personal-card-media.ts',{});
 const image={id:ids.placement,assetId:ids.asset,side:'front',description:'Reference diagram',mime:'image/png',width:20,height:20,sha256:'a'.repeat(64)};
 assert.equal(media.cardImageSource(ids.learner,image),`/api/content-media/cards/${ids.learner}/delivery/${ids.placement}`);
 assert.throws(()=>media.cardImageSource('https://other.invalid',image));assert.throws(()=>media.cardImageSource(ids.learner,{...image,id:'../../remote'}));
 assert.equal(media.validCardImage({...image,mime:'image/svg+xml'}),false);assert.equal(media.validCardImage({...image,width:4097}),false);
 assert.notEqual(media.cardImageFingerprint([image]),media.cardImageFingerprint([{...image,description:'Changed'}]));
});
