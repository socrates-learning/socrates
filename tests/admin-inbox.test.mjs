import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deleteInboxMessage, filterInboxMessages, inboxDeletionError, inboxError, inboxSourceLabel, loadInboxMessages, requireInboxMessage, saveInboxMessage } from '../lib/admin-inbox.ts';

export const message = { id:'12800000-0000-4000-8000-000000000001', revision:'12800000-0000-4000-8000-000000000002', subject:'Tablet image', content:'Synthetic content', category:'Technical Support', source:'website', sender_name:'Example Sender', sender_contact:'example@example.invalid', question_id:null, topic_id:null, submitted_at:'2026-10-15T12:00:00Z', updated_at:'2026-10-15T12:00:00Z', status:'New', admin_notes:'' };
const revision='12800000-0000-4000-8000-000000000003';
const signal=()=>new AbortController().signal;
function client(replies){const calls=[];return {calls,rpc(name,args){calls.push([name,args]);const reply=replies.shift();return {then:(...a)=>Promise.resolve(reply).then(...a),range(from,to){calls.push(['range',from,to]);return this;},abortSignal(value){calls.push(['signal',value]);return Promise.resolve(reply);}};}};}
test('Inbox reads all pages and fails closed on malformed or failed reads',async()=>{
 const page=Array.from({length:200},(_,i)=>({...message,id:`12800000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}));
 const c=client([{data:page},{data:[{...message,id:'12800000-0000-4000-8000-000000000201'}]}]);
 assert.equal((await loadInboxMessages(c,signal())).length,201);
 assert.deepEqual(c.calls.filter(c=>c[0]==='range'),[['range',0,199],['range',200,399]]);
 for(const reply of [{data:null},{data:[{...message,revision:'bad'}]},{error:{code:'42501'}}]) await assert.rejects(loadInboxMessages(client([reply]),signal()));
 assert.deepEqual(await loadInboxMessages(client([{data:[]}]),signal()),[]);
});
test('save sends only identity, original revision, status and literal notes; confirms the response',async()=>{
 const notes='<script>literal</script>\nPrivate 🧠 note';
 const c=client([{data:{...message,revision,status:'Resolved',admin_notes:notes}}]);
 assert.equal((await saveInboxMessage(c,message.id,{revision:message.revision,status:'Resolved',notes})).admin_notes,notes);
 assert.deepEqual(c.calls,[['save_admin_inbox_message',{p_id:message.id,p_expected_revision:message.revision,p_status:'Resolved',p_admin_notes:notes}]]);
 for(const data of [message,null,{...message,id:revision,revision},{...message,revision,admin_notes:'wrong'}]) await assert.rejects(saveInboxMessage(client([{data}]),message.id,{revision:message.revision,status:'New',notes:'Expected'}));
});
test('invalid drafts are rejected before any request and database errors remain detectable',async()=>{
 for(const draft of [{revision:'bad',status:'New',notes:''},{revision,status:'Unknown',notes:''},{revision,status:'New',notes:'x'.repeat(10001)}]) {const c=client([]);await assert.rejects(saveInboxMessage(c,message.id,draft));assert.equal(c.calls.length,0);}
 await assert.rejects(saveInboxMessage(client([{error:{code:'40001'}}]),message.id,{revision,status:'New',notes:''}),e=>e.code==='40001');
 assert.match(inboxError({code:'40001'}),/edits are retained/);assert.match(inboxError({code:'42501'}),/Admin access/);assert.match(inboxError({code:'PGRST303'}),/Admin access/);
 assert.doesNotMatch(inboxError(Error('password or internal SQL')),/password|SQL/);
});
test('search, category and status filters keep their existing combined semantics',()=>{
 const messages=[message,{...message,id:revision,category:'Other',status:'Resolved'}];
 assert.equal(filterInboxMessages(messages,' TABLET ','Technical Support','New').length,1);
 assert.equal(filterInboxMessages(messages,'example@example.invalid','','').length,2);
 assert.equal(filterInboxMessages(messages,'','Other','New').length,0);
 assert.equal(inboxSourceLabel('study_mode'),'Study Mode');assert.equal(inboxSourceLabel('website'),'Website');
 assert.equal(inboxSourceLabel('future_source'),'future source');
 assert.throws(()=>requireInboxMessage({...message,category:'Unknown'}));
});
test('submission creation is confined to a private schema and the UI contains no fixtures or creation calls',()=>{
 const sql=readFileSync('supabase/128_admin_inbox.sql','utf8');
 assert.match(sql,/create schema admin_inbox_internal/);assert.match(sql,/revoke all on schema admin_inbox_internal from public, anon, authenticated, service_role/);
 assert.match(sql,/grant execute on function admin_inbox_internal.create_message\([^;]+to service_role/);
 assert.doesNotMatch(sql,/create or replace|alter table public\.(?!admin_inbox_messages)|grant (?:insert|update|delete)/i);
 const ui=readFileSync('app/admin/users/AdminInbox.tsx','utf8');
 assert.doesNotMatch(ui,/example\.invalid|demo-00|create_message|dangerouslySetInnerHTML|localStorage|sessionStorage/);
});
test('deletion sends only the confirmed identity and revision and requires a verified receipt',async()=>{
 const c=client([{data:{id:message.id,deleted:true}}]);
 await deleteInboxMessage(c,message.id,message.revision);
 assert.deepEqual(c.calls,[['delete_admin_inbox_message',{p_id:message.id,p_expected_revision:message.revision}]]);
 for(const data of [null,{id:message.id,deleted:false},{id:revision,deleted:true},{id:message.id}]) await assert.rejects(deleteInboxMessage(client([{data}]),message.id,message.revision));
 const invalid=client([]);await assert.rejects(deleteInboxMessage(invalid,'bad',message.revision));await assert.rejects(deleteInboxMessage(invalid,message.id,'bad'));assert.equal(invalid.calls.length,0);
});
test('deletion errors preserve conflicts and sanitize database or transport details',async()=>{
 await assert.rejects(deleteInboxMessage(client([{error:{code:'40001'}}]),message.id,message.revision),e=>e.code==='40001');
 assert.match(inboxDeletionError({code:'40001'}),/another Admin.*reload/);
 assert.match(inboxDeletionError({code:'42501'}),/Admin access/);
 assert.match(inboxDeletionError(Error('private SQL')),/Retry safely/);
 assert.doesNotMatch(inboxDeletionError(Error('private SQL')),/private SQL/);
});
