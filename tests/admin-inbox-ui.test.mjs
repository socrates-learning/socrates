import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConceptModule,hookHarness,jsx} from './fixtures/concept-media-authoring.mjs';
import * as inbox from '../lib/admin-inbox.ts';
const record={id:'12800000-0000-4000-8000-000000000001',revision:'12800000-0000-4000-8000-000000000002',subject:'Synthetic request',content:'<script>literal message</script>',category:'Other',source:'website',sender_name:'Synthetic sender',sender_contact:'sender@example.invalid',question_id:null,topic_id:null,submitted_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:00:00Z',status:'New',admin_notes:'Saved note'};
const nextRevision='12800000-0000-4000-8000-000000000003';
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'||typeof n==='number'?String(n):'';
const settle=()=>new Promise(r=>setImmediate(r));
function setup({read=async()=>[{...record}],save=async(_c,id,draft)=>({...record,id,revision:nextRevision,status:draft.status,admin_notes:draft.notes}),remove=async()=>{}}={}){
 const h=hookHarness(),calls=[],listeners=new Map();let auth,guard,blocked=0,focused;
 h.hooks.useCallback=(fn,deps)=>{const memo=h.hooks.useRef();if(!memo.current||deps.some((d,i)=>d!==memo.current.deps[i]))memo.current={fn,deps};return memo.current.fn;};
 const Component=loadConceptModule('app/admin/users/AdminInbox.tsx',{
  react:h.hooks,'react/jsx-runtime':jsx,'lucide-react':{Info:'info',Mail:'mail',Search:'search'},
  '@/lib/supabase':{supabase:{auth:{onAuthStateChange(fn){auth=fn;return {data:{subscription:{unsubscribe(){}}}};}}}},
  '@/components/application-shell/SocratesShell':{useSocratesNavigationGuard:fn=>{guard=fn;}},
  '@/lib/admin-inbox':{...inbox,loadInboxMessages(...a){calls.push(['read',...a]);return read(...a);},saveInboxMessage(...a){calls.push(['save',...a]);return save(...a);},deleteInboxMessage(...a){calls.push(['delete',...a]);return remove(...a);}},
  './AdminUsers.module.css':{__esModule:true,default:new Proxy({},{get:(_o,k)=>k})},
 },{window:{addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)}}).AdminInbox;
 const props={onNavigationBlocked:()=>blocked++};
 const render=()=>{const tree=h.render(()=>Component(props));for(const node of nodes(tree))if(node.props?.ref&&!node.props.ref.current)node.props.ref.current={open:false,showModal(){this.open=true;},close(){this.open=false;},focus(){focused=node.type==='textarea'?'notes':node.type==='dialog'?'dialog':text(node);}};return tree;};
 const button=label=>nodes(render()).find(n=>n.type==='button'&&text(n)===label);
 const dialog=()=>nodes(render()).find(n=>n.type==='dialog');
 const confirm=()=>nodes(dialog()).find(n=>n.type==='button'&&text(n)==='Delete Message');
 const area=()=>nodes(render()).find(n=>n.type==='textarea');
 return {h,calls,listeners,render,button,area,dialog,confirm,focused:()=>focused,text:()=>text(render()),guard:()=>guard(),blocked:()=>blocked,auth:(...a)=>auth(...a),async load(){render();h.effects();await settle();render();h.effects();},edit(value){area().props.onChange({target:{value}});render();h.effects();},openDelete(){button('Delete Message').props.onClick();render();h.effects();}};
}
test('loading and empty states do not fabricate messages; failed reads support retry',async()=>{
 let fail=true;const s=setup({read:async()=>{if(fail)throw Error('internal private detail');return [];}});
 assert.match(s.text(),/Loading messages/);await s.load();assert.match(s.text(),/Inbox is unavailable/);assert.doesNotMatch(s.text(),/internal private detail|No messages yet/);
 fail=false;s.button('Reload messages').props.onClick();await settle();assert.match(s.text(),/No messages yet/);
});
test('existing private notes and sender details load as literal text with unchanged save disabled',async()=>{
 const s=setup();await s.load();assert.equal(s.area().props.value,'Saved note');assert.ok(s.button('Save Changes').props.disabled);assert.equal(nodes(s.render()).some(n=>n.props?.dangerouslySetInnerHTML),false);assert.match(s.text(),/sender@example.invalid/);
});
test('save commits notes and status together and a fresh mount reloads persisted values',async()=>{
 let stored={...record};const opts={read:async()=>[stored],save:async(_c,id,draft)=>(stored={...stored,id,revision:nextRevision,status:draft.status,admin_notes:draft.notes})};
 const s=setup(opts);await s.load();s.edit('Persistent administrator note');nodes(s.render()).filter(n=>n.type==='select').at(-1).props.onChange({target:{value:'In Review'}});
 s.button('Save Changes').props.onClick();await settle();assert.match(s.text(),/Changes saved/);assert.ok(s.button('Save Changes').props.disabled);assert.equal(s.calls.find(c=>c[0]==='save')[3].revision,record.revision);
 const fresh=setup(opts);await fresh.load();assert.equal(fresh.area().props.value,'Persistent administrator note');assert.equal(nodes(fresh.render()).filter(n=>n.type==='select').at(-1).props.value,'In Review');
});
test('failed and stale saves preserve drafts; reloading a conflicting version never silently overwrites it',async()=>{
 let latest={...record};const s=setup({read:async()=>[latest],save:async()=>{throw {code:'40001'};}});await s.load();s.edit('Keep these edits');s.button('Save Changes').props.onClick();await settle();assert.equal(s.area().props.value,'Keep these edits');assert.match(s.text(),/edits are retained/);
 latest={...record,revision:nextRevision,admin_notes:'Another Admin saved this'};s.button('Reload messages').props.onClick();await settle();assert.equal(s.area().props.value,'Keep these edits');assert.match(s.text(),/older version/);
 s.button('Discard Changes').props.onClick();assert.equal(s.area().props.value,'Another Admin saved this');assert.ok(s.button('Save Changes').props.disabled);
});
test('duplicate save clicks are suppressed and delayed responses cannot repopulate another account',async()=>{
 let done;const s=setup({save:()=>new Promise(r=>done=r)});await s.load();s.auth('INITIAL_SESSION',{user:{id:'admin-a'}});s.edit('Draft');s.button('Save Changes').props.onClick();s.button('Saving…').props.onClick();assert.equal(s.calls.filter(c=>c[0]==='save').length,1);assert.ok(s.area().props.disabled);
 s.auth('SIGNED_IN',{user:{id:'other-account'}});done({...record,revision:nextRevision,admin_notes:'Draft'});await settle();assert.equal(s.area(),undefined);assert.doesNotMatch(s.text(),/sender@example.invalid/);assert.match(s.text(),/session changed/);
});
test('search and filters retain hidden drafts; navigation and refresh protect unsaved edits',async()=>{
 const s=setup();await s.load();s.edit('Unsaved');nodes(s.render()).find(n=>n.type==='input').props.onChange({target:{value:'no match'}});assert.equal(s.area(),undefined);assert.match(s.text(),/No matching messages/);
 assert.equal(s.guard(),false);assert.equal(s.blocked(),1);assert.equal(s.area().props.value,'Unsaved');let protectedRefresh=false;s.listeners.get('beforeunload')({preventDefault(){protectedRefresh=true;}});assert.ok(protectedRefresh);
 s.button('Discard Changes').props.onClick();s.render();assert.equal(s.guard(),true);
});
test('access denial clears private data and never renders a successful empty Inbox',async()=>{
 const s=setup({save:async()=>{throw {code:'42501'};}});await s.load();s.edit('Draft');s.button('Save Changes').props.onClick();await settle();assert.equal(s.area(),undefined);assert.doesNotMatch(s.text(),/sender@example.invalid|No messages yet/);assert.match(s.text(),/Admin access is required/);
});
test('unmount aborts pending reads and ignores late saves',async()=>{
 let done;const s=setup({save:()=>new Promise(r=>done=r)});await s.load();s.edit('Draft');s.button('Save Changes').props.onClick();s.h.cleanup();assert.ok(s.calls[0][2].aborted);done({...record,revision:nextRevision,admin_notes:'Draft'});await settle();assert.equal(s.area().props.value,'Draft');assert.doesNotMatch(s.text(),/Changes saved/);
});
test('deletion requires confirmation; Cancel and Escape preserve the message and return focus',async()=>{
 const s=setup();await s.load();s.openDelete();assert.ok(s.dialog().props.ref.current.open);assert.equal(s.focused(),'Cancel');assert.equal(s.calls.filter(c=>c[0]==='delete').length,0);
 s.button('Cancel').props.onClick();assert.equal(s.dialog().props.ref.current.open,false);assert.equal(s.focused(),'Delete Message');assert.equal(s.area().props.value,'Saved note');
 s.openDelete();let prevented=false;s.dialog().props.onCancel({preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(s.dialog().props.ref.current.open,false);assert.equal(s.calls.filter(c=>c[0]==='delete').length,0);
});
test('unsaved notes block opening deletion until explicitly saved or discarded',async()=>{
 const s=setup();await s.load();s.edit('Do not lose this');s.openDelete();assert.equal(s.dialog().props.ref.current.open,false);assert.equal(s.focused(),'notes');assert.match(s.text(),/Save or discard your unsaved changes before deleting/);assert.equal(s.area().props.value,'Do not lose this');
 s.button('Discard Changes').props.onClick();s.openDelete();assert.ok(s.dialog().props.ref.current.open);
});
for(const status of inbox.INBOX_STATUSES)test(`confirmed ${status} deletion persists and preserves search/filter settings`,async()=>{
 let stored=[{...record,status}];const options={read:async()=>stored,remove:async()=>{stored=[];}};
 const s=setup(options);await s.load();nodes(s.render()).find(n=>n.type==='input').props.onChange({target:{value:'Synthetic'}});
 const filters=nodes(s.render()).filter(n=>n.type==='select');filters[0].props.onChange({target:{value:'Other'}});filters[1].props.onChange({target:{value:status}});
 s.openDelete();s.confirm().props.onClick();await settle();s.render();s.h.effects();
 assert.equal(s.area(),undefined);assert.match(s.text(),/Message deleted\./);assert.match(s.text(),/Select a message/);assert.equal(s.focused(),'Reload messages');
 assert.equal(nodes(s.render()).find(n=>n.type==='input').props.value,'Synthetic');assert.deepEqual(nodes(s.render()).filter(n=>n.type==='select').map(n=>n.props.value),['Other',status]);
 assert.deepEqual(s.calls.find(c=>c[0]==='delete').slice(2),[record.id,record.revision]);
 const fresh=setup(options);await fresh.load();assert.equal(fresh.area(),undefined);assert.match(fresh.text(),/No messages yet/);
});
test('failed or stale deletion keeps the message visible; retry uses the same confirmed revision',async()=>{
 let fail=true;const s=setup({remove:async()=>{if(fail)throw {code:'40001'};}});await s.load();s.openDelete();s.confirm().props.onClick();await settle();s.render();s.h.effects();assert.equal(s.focused(),'Cancel');assert.equal(s.area().props.value,'Saved note');assert.ok(s.dialog().props.ref.current.open);assert.match(s.text(),/changed by another Admin/);
 fail=false;s.confirm().props.onClick();await settle();assert.equal(s.area(),undefined);assert.deepEqual(s.calls.filter(c=>c[0]==='delete').map(c=>c.slice(2)),[[record.id,record.revision],[record.id,record.revision]]);
});
test('pending deletion suppresses duplicate clicks, prevents cancellation, and ignores account-change responses',async()=>{
 let done;const s=setup({remove:()=>new Promise(resolve=>done=resolve)});await s.load();s.auth('INITIAL_SESSION',{user:{id:'admin-a'}});s.openDelete();const confirm=s.confirm();confirm.props.onClick();s.render();s.h.effects();assert.equal(s.focused(),'dialog');confirm.props.onClick();s.button('Cancel').props.onClick();assert.equal(s.calls.filter(c=>c[0]==='delete').length,1);assert.ok(s.dialog().props.ref.current.open);assert.ok(s.button('Cancel').props.disabled);
 s.auth('SIGNED_IN',{user:{id:'other-account'}});done();await settle();assert.equal(s.area(),undefined);assert.equal(s.dialog().props.ref.current.open,false);assert.doesNotMatch(s.text(),/Message deleted\./);assert.match(s.text(),/session changed/);
});
test('deleting one message does not discard unsaved notes on another message',async()=>{
 const other={...record,id:nextRevision,subject:'Other request'};const s=setup({read:async()=>[{...record},other]});await s.load();s.edit('Retain my unrelated draft');
 const item=nodes(s.render()).find(n=>n.type==='button'&&n.props['aria-pressed']===false&&text(n).includes('Other request'));item.props.onClick();s.openDelete();s.confirm().props.onClick();await settle();
 assert.equal(s.guard(),false);assert.equal(s.area().props.value,'Retain my unrelated draft');assert.equal(s.calls.find(c=>c[0]==='delete')[2],other.id);
});
