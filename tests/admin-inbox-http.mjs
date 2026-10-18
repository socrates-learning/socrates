// Loopback-only PostgREST proof. Tokens and identities are synthetic fixtures.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
const url=process.env.INBOX_TEST_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='58528')throw Error('Explicit disposable loopback Inbox API required');
const id=n=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const messageId='12800000-0000-4000-8000-000000001001';
function token(sub,role='authenticated',extra={}){const b=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const p=b({alg:'HS256',typ:'JWT'})+'.'+b({role,sub,exp:Math.floor(Date.now()/1000)+300,...extra});return p+'.'+createHmac('sha256','synthetic-only-navigation-fixture').update(p).digest('base64url');}
async function request(actor,path,method='GET',body,headers={}){const r=await fetch(url+'/'+path,{method,headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>null)};}
let checks=0;function check(value,label){assert.ok(value,label);checks++;console.log('PASS: '+label);}
const admin=token(id(101)),secondAdmin=token(id(105));
const initial=await request(admin,'rpc/get_admin_inbox_messages','POST',{});
check(initial.status===200&&initial.data.length===6,'Admin loads six isolated messages');
const original=initial.data.find(m=>m.id===messageId);assert.ok(original);
const save=(actor,notes,status,revision)=>request(actor,'rpc/save_admin_inbox_message','POST',{p_id:messageId,p_admin_notes:notes,p_status:status,p_expected_revision:revision});
try {
 const saved=await save(admin,'Persisted private note\n<script>literal</script>','In Review',original.revision);
 check(saved.status===200&&saved.data.revision!==original.revision,'Admin commits notes and status with a new revision');
 const fresh=await request(token(id(101)),'admin_inbox_messages?id=eq.'+messageId);
 check(fresh.status===200&&fresh.data[0].admin_notes===saved.data.admin_notes&&fresh.data[0].status==='In Review','fresh authenticated read confirms durable notes and status');
 const races=await Promise.all([save(admin,'Admin A','Resolved',saved.data.revision),save(secondAdmin,'Admin B','Resolved',saved.data.revision)]);
 check(races.filter(r=>r.status===200).length===1&&races.filter(r=>r.data?.code==='40001').length===1,'simultaneous Admin updates cannot overwrite each other');
 for(const [actor,label] of [[token(id(102)),'Editor'],[token(id(103)),'Learner'],[token(id(104)),'unassigned'],[token(id(103),'authenticated',{user_metadata:{role:'admin'},app_metadata:{role:'admin'}}),'forged metadata']]){
  const table=await request(actor,'admin_inbox_messages?select=*');check(table.status===200&&table.data.length===0,label+' RLS hides message bodies, sender details and notes');
  check((await request(actor,'rpc/get_admin_inbox_messages','POST',{})).status===403,label+' read RPC denied');
  check((await save(actor,'Attack','Resolved',saved.data.revision)).status===403,label+' management RPC denied');
 }
 const anon=token(undefined,'anon');
 check((await request(anon,'admin_inbox_messages')).status===401,'anonymous table access denied');
 check((await request(anon,'rpc/get_admin_inbox_messages','POST',{})).status===401,'anonymous read RPC denied');
 check((await request(admin,'admin_inbox_messages?id=eq.'+messageId,'PATCH',{admin_notes:'bypass'})).status===403,'direct Admin write cannot bypass revision checks');
 check((await request(admin,'admin_inbox_messages?id=eq.'+messageId,'DELETE')).status===403,'browser deletion unavailable');
 check((await save(admin,'','Unknown',saved.data.revision)).data.code==='22023','invalid status rejected');
 check((await save(admin,'x'.repeat(10001),'New',saved.data.revision)).data.code==='22023','oversized notes rejected');
 check((await request(admin,'rpc/save_admin_inbox_message','POST',{p_id:messageId,p_status:'New',p_admin_notes:'Spoof',p_expected_revision:saved.data.revision,p_user_id:id(101)})).status===404,'actor impersonation parameter is not accepted');
 for(const [actor,label] of [[anon,'anonymous'],[admin,'Admin'],[token(undefined,'service_role'),'service JWT']]){
  check((await request(actor,'rpc/create_message','POST',{p_subject:'No',p_content:'No',p_category:'Other',p_source:'website'})).status===404,label+' has no public submission RPC');
  check((await request(actor,'rpc/create_message','POST',{}, {'Content-Profile':'admin_inbox_internal'})).status===406,label+' cannot expose the private creation schema through Data API');
 }
 const tampered=admin.slice(0,-2)+'xx';check((await request(tampered,'admin_inbox_messages')).status===401,'invalid JWT rejected');
 console.log(`${checks} isolated HTTP authorization and persistence checks passed.`);
}finally{
 const current=await request(admin,'admin_inbox_messages?id=eq.'+messageId);
 if(current.status===200){const restore=await save(admin,original.admin_notes,original.status,current.data[0].revision);assert.equal(restore.status,200);}
}
