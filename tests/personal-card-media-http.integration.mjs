import fs from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
const dir=process.env.PERSONAL_CARD_MEDIA_TEST_DIRECTORY;
assert.equal(dir, '/Users/itxiermeziani/.codex/local-evidence/learner-card-images-20261020', 'Explicit isolated fixture directory required');
const require=createRequire(new URL('../package.json', import.meta.url));
const {createServerClient}=require('@supabase/ssr'),sharp=require('socrates-media-sharp');
const keys=JSON.parse(fs.readFileSync(dir+'/isolated-keys.json')),fixtures=JSON.parse(fs.readFileSync(dir+'/synthetic-fixtures.json'));
const origin='http://127.0.0.1:3496',backend='http://127.0.0.1:59936';
export const state={dir,keys,fixtures,origin,backend,assert,randomUUID,sharp};
export async function login(role){
 const user=fixtures.users.find(u=>u.role_name===role),jar=new Map();assert.ok(user.email.endsWith('@example.invalid'));
 const client=createServerClient(backend,keys.anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:c=>c.forEach(x=>jar.set(x.name,x.value))}});
 const {error}=await client.auth.signInWithPassword({email:user.email,password:fixtures.password});assert.equal(error,null);
 return {user,client,jar,async request(url,init={}){return fetch(origin+url,{...init,headers:{...init.headers,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),origin,host:'127.0.0.1:3496'},signal:AbortSignal.timeout(40000)});}};
}
export async function json(session,card,body,expected=200){
 const r=await session.request('/api/content-media/cards/'+card,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));return value;
}
export async function upload(session,card,bytes,mime='image/png',key=randomUUID()){
 const reserve=await json(session,card,{action:'reserve',idempotencyKey:key});
 const r=await session.request(`/api/content-media/cards/${card}/drafts/${reserve.reservationId}`,{method:'POST',headers:{'content-type':mime},body:bytes});
 const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));assert.equal(result.ready,true);
 const metadata=await session.request(`/api/content-media/cards/${card}/drafts/${reserve.reservationId}?metadata=1`);assert.equal(metadata.status,200);
 return {...await metadata.json(),id:randomUUID(),side:'front',description:'Synthetic diagram',reservationId:reserve.reservationId,key};
}
export async function bytes(session,card,image,draft=false){
 const r=await session.request(`/api/content-media/cards/${card}/${draft?'drafts/'+image.reservationId:'delivery/'+image.id}`);
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
 const b=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(b).digest('hex'),image.sha256);return b;
}
export const payload=(front,back,images)=>({front,back,sourceReference:'Synthetic source',images:images.map(({id,assetId,side,description})=>({id,assetId,side,description}))});
if(process.argv[1]===new URL(import.meta.url).pathname){
 const learner=await login('learner'),card=learner.user.topic_card;
 const source=await sharp({create:{width:320,height:180,channels:3,background:'#80613a'}}).png().toBuffer();
 const a=await upload(learner,card,source);await bytes(learner,card,a,true);console.log('PASS: authenticated real PNG upload, normalization, digest and draft delivery');
 const b=await upload(learner,card,await sharp(source).jpeg().toBuffer(),'image/jpeg');b.side='answer';b.description='Synthetic Back illustration';
 let m=await json(learner,card);const p=payload(m.front,m.back,[a,b]),key=randomUUID();
 const saved=await json(learner,card,{action:'save',revision:m.revision,idempotencyKey:key,payload:p});assert.equal(saved.id,card);
 assert.deepEqual(await json(learner,card,{action:'save',revision:m.revision,idempotencyKey:key,payload:p}),saved);
 const fresh=await login('learner');m=await json(fresh,card);assert.equal(m.images.length,2);
 await bytes(fresh,card,m.images[0]);await bytes(fresh,card,m.images[1]);console.log('PASS: Front/Back save, lost acknowledgement retry and fresh authenticated reload');
 const other=await login('other');await json(other,card,undefined,403);
 const denied=await other.request(`/api/content-media/cards/${card}/delivery/${a.id}`);assert.equal(denied.status,403);
 assert.equal((await fetch(origin+`/api/content-media/cards/${card}/delivery/${a.id}`)).status,401);
 for(const role of ['admin','editor']){const s=await login(role);await json(s,s.user.topic_card,{action:'reserve',idempotencyKey:randomUUID()},403);}
 console.log('PASS: cross-owner, anonymous, Admin and legacy Editor image-tool denial');
 const sid={card,images:m.images,sourcePNG:source.toString('base64')};fs.writeFileSync(dir+'/http-card-state.json',JSON.stringify(sid),{mode:0o600});
 fs.writeFileSync(dir+'/browser-cookies.local.json',JSON.stringify([...fresh.jar].map(([name,value])=>({name,value}))),{mode:0o600});
}
