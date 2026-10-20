import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { loadConceptModule as load, ids } from './fixtures/concept-media-authoring.mjs';
const server=load('lib/content-media/server.ts',{'server-only':{},'@supabase/supabase-js':{},'node:crypto':crypto,'@/lib/supabase-server':{},'@/lib/library-context':{}});
const card='13600000-0000-4000-8000-000000000001';
const route=(cardId=card)=>({params:Promise.resolve({cardId,reservationId:ids.asset,referenceId:ids.placement})});
function setup(denied=false,failed=false){
 const calls=[];
 const rpc=async(_client,name,args)=>{calls.push([name,args]);if(failed)throw Error('PRIVATE database error');return {cardId:card,images:[]};};
 const api={...server,actorContext:async(_request,mutation)=>{calls.push(['auth',mutation]);if(denied)throw new server.MediaError(401,'Authentication required');return {actor:ids.learner,library:ids.library};},rpc,serviceClient:()=>({})};
 const authoring={cardMediaRpc:rpc,uploadCardImage:async()=>({ready:true,assetId:ids.asset,bucket:'hidden',object:'hidden'}),cardImage:async(_client,context,reference,draft,metadataOnly)=>{
  calls.push(['image',context,reference,draft,metadataOnly]);return {metadata:{assetId:ids.asset,mime:'image/png'},bytes:Buffer.from('synthetic')};}};
 const modules={'@/lib/content-media/server':api,'@/lib/content-media/personal-card-authoring':authoring};
 return {calls,root:load('app/api/content-media/cards/[cardId]/route.ts',modules),draft:load('app/api/content-media/cards/[cardId]/drafts/[reservationId]/route.ts',modules),delivery:load('app/api/content-media/cards/[cardId]/delivery/[referenceId]/route.ts',modules)};
}
const post=body=>new Request('http://localhost/api',{method:'POST',body:JSON.stringify(body)});
test('every Card media endpoint authenticates before reading input or contacting Storage',async()=>{
 for(const [group,method] of [['root','GET'],['root','POST'],['draft','GET'],['draft','POST'],['draft','DELETE'],['delivery','GET']]){
  const s=setup(true);assert.equal((await s[group][method](new Request('http://localhost'),route())).status,401);assert.deepEqual(s.calls,[['auth',method!=='GET']]);
 }
});
test('reservation and save derive owner and current Library server-side; new Cards and malformed identifiers fail closed',async()=>{
 const s=setup();const body={action:'reserve',idempotencyKey:ids.asset,actor:ids.admin,libraryId:ids.asset,owner_id:ids.admin};
 assert.equal((await s.root.POST(post(body),route())).status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(s.calls.at(-1))),['m136_reserve',{p_actor:ids.learner,p_library:ids.library,p_card:card,p_key:ids.asset}]);
 assert.equal((await s.root.POST(post({...body,action:'save',revision:'2026-10-20T00:00:00Z',payload:{front:'Front',back:'Back',images:[]}}),route())).status,200);
 assert.equal(s.calls.at(-1)[0],'m136_save');
 for(const value of ['new','../other','https://remote.invalid',''])assert.equal((await s.root.POST(post(body),route(value))).status,400);
 for(const invalid of [{...body,idempotencyKey:null},{...body,action:'create'},{...body,action:'save',revision:'invalid'}])assert.equal((await s.root.POST(post(invalid),route())).status,400);
 assert.equal((await s.root.POST(new Request('http://localhost',{method:'POST',body:'not json'}),route())).status,400);
 for(const invalid of [null,[],true,42,'request'])assert.equal((await s.root.POST(post(invalid),route())).status,400);
 assert.equal((await s.root.POST(new Request('http://localhost',{method:'POST',body:'x'.repeat(262145)}),route())).status,413);
});
test('private image delivery never emits Storage paths and uses no-store, nosniff and sandbox headers',async()=>{
 const s=setup();const image=await s.delivery.GET(new Request('http://localhost'),route());
 assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'private, no-store');
 assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.match(image.headers.get('content-security-policy'),/sandbox/);
 const upload=await s.draft.POST(new Request('http://localhost'),route());assert.deepEqual(await upload.json(),{ready:true,assetId:ids.asset,terminal:false});
 assert.equal((await s.draft.DELETE(new Request('http://localhost'),route())).status,200);
 assert.equal(s.calls.at(-1)[0],'m136_upload');assert.equal(s.calls.at(-1)[1].p_action,'cancel');
 const failure=await setup(false,true).root.POST(post({action:'reserve',idempotencyKey:ids.asset}),route());
 assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/PRIVATE|database/);
});
test('current session and exact same-origin checks are inherited from the existing trusted service',async()=>{
 const actor=load('lib/content-media/server.ts',{'server-only':{},'@supabase/supabase-js':{},'node:crypto':crypto,
 '@/lib/supabase-server':{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:{id:ids.learner}},error:null})}})},
 '@/lib/library-context':{resolveActiveLibraryContext:async()=>({library:{id:ids.library},user:{id:ids.learner},isUnauthorized:false})}});
 for(const origin of ['https://attacker.invalid','null',''])await assert.rejects(actor.actorContext(new Request('https://socrates.local/api',{headers:{origin,host:'socrates.local'}}),true),/denied/);
 assert.equal((await actor.actorContext(new Request('https://socrates.local/api',{headers:{origin:'https://socrates.local',host:'socrates.local'}}),true)).actor,ids.learner);
});
