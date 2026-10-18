import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const url=process.env.SUGGESTION_TEST_URL, secret=process.env.SUGGESTION_TEST_JWT_SECRET;
assert.equal(url,'http://127.0.0.1:58529');assert.ok(secret);
const database='admin_inbox128_suggestions129';
function sql(q){return execFileSync('docker',['exec','-i','socrates-creator-navy-uat-db','psql','-U','postgres','-d',database,'-X','-At','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();}
assert.equal(sql('select current_database();'),database);
const learner=randomUUID(), other=randomUUID(), editor=randomUUID();
for(const [id,role] of [[learner,'learner'],[other,'learner'],[editor,'editor']]) sql(`insert into auth.users(id,email) values('${id}','suggestion-${id}@example.invalid'); insert into public.user_roles(user_id,role) values('${id}','${role}'); insert into public.user_libraries(user_id,library_id) values('${id}','12200000-0000-4000-8000-000000000010');`);
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(role,sub){const data=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,...(sub?{sub}:{}),iss:'supabase',exp:Math.floor(Date.now()/1000)+3600});return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');}
const service=jwt('service_role'),admin=jwt('authenticated','90000000-0000-4000-8000-000000000101');
async function request(token,path,body,method=body?'POST':'GET'){
 const r=await fetch(url+'/'+path,{method,headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};
}
const base={p_actor:learner,p_request_id:randomUUID(),p_library_id:'12200000-0000-4000-8000-000000000010',p_question_id:'12200000-0000-4000-8000-000000000060',p_category:'Content Correction',p_content:'Synthetic concurrent HTTP suggestion'};
const submit=(body=base,token=service)=>request(token,'rpc/submit_study_suggestion_internal',body);
let checks=0;const ok=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS: '+label);};
const duplicate=await Promise.all(Array.from({length:8},()=>submit()));
ok(duplicate.every(r=>r.status===200),'concurrent retries succeed');
ok(new Set(duplicate.map(r=>r.data.id)).size===1,'concurrent retries return one identity');
ok(duplicate.every(r=>Object.keys(r.data).sort().join()==='id,submittedAt'),'receipt excludes private Inbox content');
const id=duplicate[0].data.id;
const read=await request(admin,'admin_inbox_messages?id=eq.'+id);
ok(read.status===200&&read.data.length===1,'Admin receives one persisted suggestion');
ok(read.data[0].status==='New'&&read.data[0].source==='study_mode'&&read.data[0].sender_user_id===learner,'server context, sender and defaults persist');
ok(read.data[0].topic_id!==null&&read.data[0].sender_contact===null&&read.data[0].sender_name===null,'authorized canonical Topic without copied contact information');
ok((await submit({...base,p_content:'changed'})).status===409,'reused key with changed body rejected');
const second=await submit({...base,p_actor:other});ok(second.status===200&&second.data.id!==id,'same client key cannot impersonate another sender');
ok((await submit({...base,p_request_id:randomUUID(),p_library_id:'12200000-0000-4000-8000-000000000011'})).status===403,'unauthorized Library rejected');
ok((await submit({...base,p_request_id:randomUUID(),p_question_id:randomUUID()})).status===403,'unavailable Question rejected');
for(const [token,label] of [[jwt('authenticated',learner),'Learner'],[jwt('authenticated',editor),'Editor'],[admin,'Admin browser'],[jwt('anon'),'anonymous']]){
 ok((await submit(base,token)).status>=400,label+' cannot bypass the server submission endpoint');
 const result=await request(token,'admin_inbox_messages?id=eq.'+id);
 if(label!=='Admin browser')ok(result.status>=400||result.data.length===0,label+' cannot read private Inbox data');
}
const personal=await submit({...base,p_actor:other,p_request_id:randomUUID(),p_question_id:null,p_category:'Other',p_content:'Synthetic personal-card workflow; no private attachment.'});
const personalRead=await request(admin,'admin_inbox_messages?id=eq.'+personal.data.id);
ok(personal.status===200&&personalRead.data[0].question_id===null&&personalRead.data[0].topic_id===null,'general/personal context contains no content identifiers');
const burst=await Promise.all(Array.from({length:10},(_,i)=>submit({...base,p_request_id:randomUUID(),p_content:'Synthetic quota check '+i})));
ok(burst.filter(r=>r.status===200).length===4,'concurrent rate checking allows only the remaining four slots');
ok(burst.filter(r=>r.data.code==='P0429').length===6,'excess concurrent submissions are rejected');
ok((await submit()).data.id===id,'retry remains available after quota exhaustion');
const fresh=await request(jwt('authenticated','90000000-0000-4000-8000-000000000101'),'rpc/get_admin_inbox_messages',{});
ok(fresh.status===200&&fresh.data.some(m=>m.id===id&&m.content===base.p_content),'fresh authenticated Inbox load sees the persisted message');
console.log(`${checks} isolated HTTP checks passed.`);
