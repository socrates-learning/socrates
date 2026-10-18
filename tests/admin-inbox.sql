\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 'admin_inbox128_%' then raise exception 'Disposable admin_inbox128 database required'; end if; end $$;
create function pg_temp.id(n int) returns uuid language sql as $$ select ('12800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject(q text,code text,label text) returns void language plpgsql as $$ begin execute q; raise exception 'Unexpected success: %',label; exception when others then if sqlstate=code then raise notice 'PASS: %',label; else raise; end if; end $$;

insert into auth.users(id,email) select pg_temp.id(n),'inbox-test-'||n||'@example.invalid' from generate_series(1,5)n;
insert into public.user_roles(user_id,role) values(pg_temp.id(1),'admin'),(pg_temp.id(2),'admin'),(pg_temp.id(3),'editor'),(pg_temp.id(4),'learner');
select id as topic from public.library_nodes where node_type='topic' limit 1 \gset
select id as question from public.questions limit 1 \gset
create temp table history_before as select 'attempts' kind,to_jsonb(t) data from public.review_attempts t
 union all select 'sessions',to_jsonb(t) from public.study_sessions t
 union all select 'questions',to_jsonb(t) from public.questions t
 union all select 'roles',to_jsonb(t) from public.user_roles t;

set local role service_role;
select admin_inbox_internal.create_message(' Subject ',E'Body\n<script>literal text</script>','Technical Support','website',' Sender ',' sender@example.invalid ',:'question',:'topic',pg_temp.id(10));
select pg_temp.reject(format('select admin_inbox_internal.create_message(''Again'',''Body'',''Other'',''website'',null,null,null,null,%L)',pg_temp.id(10)),'23505','duplicate message identity rejected without another record');
select pg_temp.reject('select * from public.admin_inbox_messages','42501','service cannot directly read private rows');
select pg_temp.reject('update public.admin_inbox_messages set admin_notes=''bypass''','42501','service cannot bypass management RPC');
select pg_temp.reject('delete from public.admin_inbox_messages','42501','no service deletion grant');
select pg_temp.reject('select public.get_admin_inbox_messages()','42501','read RPC not available to service role');
select pg_temp.reject('select admin_inbox_internal.create_message('''',''Body'',''Other'',''website'')','23514','empty subject rejected');
select pg_temp.reject('select admin_inbox_internal.create_message(''Subject'',null,''Other'',''website'')','23502','missing content rejected');
select pg_temp.reject('select admin_inbox_internal.create_message(''Subject'',''Body'',''Unapproved'',''website'')','23514','invalid category rejected');
select pg_temp.reject('select admin_inbox_internal.create_message(''Subject'',''Body'',''Other'',''bad source'')','23514','invalid source rejected');
select pg_temp.reject('select admin_inbox_internal.create_message(repeat(''x'',201),''Body'',''Other'',''website'')','23514','oversized subject rejected');
select pg_temp.reject('select admin_inbox_internal.create_message(''Subject'',repeat(''x'',20001),''Other'',''website'')','23514','oversized body rejected');
select pg_temp.reject('select admin_inbox_internal.create_message(''Subject'',''Body'',''Other'',''website'',null,repeat(''x'',321))','23514','oversized contact rejected');
select pg_temp.reject(format('select admin_inbox_internal.create_message(''Subject'',''Body'',''Other'',''study_mode'',null,null,%L)',pg_temp.id(999)),'23503','unknown Question rejected');
select pg_temp.reject(format('select admin_inbox_internal.create_message(''Subject'',''Body'',''Other'',''study_mode'',null,null,null,%L)',pg_temp.id(999)),'22023','unknown Topic rejected');
select admin_inbox_internal.create_message('Future source','Body','Other','future_integration',null,null,null,null,pg_temp.id(11));
reset role;

select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.ok((select count(*)=2 from public.admin_inbox_messages where id in(pg_temp.id(10),pg_temp.id(11))),'Admin RLS reads all shared Inbox messages');
select pg_temp.ok((select count(*)=2 from public.get_admin_inbox_messages() where id in(pg_temp.id(10),pg_temp.id(11))),'Admin RPC reads messages');
select to_jsonb(m) initial from public.admin_inbox_messages m where id=pg_temp.id(10) \gset
select pg_temp.ok(:'initial'::jsonb->>'subject'='Subject' and :'initial'::jsonb->>'sender_contact'='sender@example.invalid','creation normalizes optional sender fields');
select pg_temp.ok(:'initial'::jsonb->>'status'='New' and :'initial'::jsonb->>'admin_notes'='','trusted creation cannot set privileged notes or status');
select pg_temp.ok(:'initial'::jsonb->>'question_id'=:'question' and :'initial'::jsonb->>'topic_id'=:'topic','canonical content references retained');
select public.save_admin_inbox_message(pg_temp.id(10),'In Review',E'Private\n🧠 note <script>literal</script>',(:'initial'::jsonb->>'revision')::uuid) saved \gset
select pg_temp.ok(:'saved'::jsonb->>'revision'<>:'initial'::jsonb->>'revision','successful save changes revision');
select pg_temp.ok((select status='In Review' and admin_notes=E'Private\n🧠 note <script>literal</script>' from public.admin_inbox_messages where id=pg_temp.id(10)),'status and notes survive a new database read');
select pg_temp.ok((:'saved'::jsonb-'status'-'admin_notes'-'revision'-'updated_at')=(:'initial'::jsonb-'status'-'admin_notes'-'revision'-'updated_at'),'management preserves original submission and associations');
select pg_temp.reject(format('select public.save_admin_inbox_message(%L,''Resolved'',''stale'',%L)',pg_temp.id(10),:'initial'::jsonb->>'revision'),'40001','stale update rejected');
select pg_temp.reject(format('select public.save_admin_inbox_message(%L,''Unknown'','''',%L)',pg_temp.id(10),:'saved'::jsonb->>'revision'),'22023','invalid status rejected');
select pg_temp.reject(format('select public.save_admin_inbox_message(%L,''New'',repeat(''x'',10001),%L)',pg_temp.id(10),:'saved'::jsonb->>'revision'),'22023','oversized notes rejected');
select pg_temp.reject('update public.admin_inbox_messages set status=''Resolved''','42501','Admin cannot bypass revision checks with direct writes');
select pg_temp.reject('delete from public.admin_inbox_messages','42501','no browser message deletion');
select pg_temp.reject('select admin_inbox_internal.create_message(''x'',''x'',''Other'',''website'')','42501','Admin browser cannot create submissions');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.ok((select admin_notes=:'saved'::jsonb->>'admin_notes' from public.admin_inbox_messages where id=pg_temp.id(10)),'second authorized Admin shares persisted notes');
select public.save_admin_inbox_message(pg_temp.id(10),'Resolved','Reviewed by another Admin',(:'saved'::jsonb->>'revision')::uuid) shared \gset
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.reject(format('select public.save_admin_inbox_message(%L,''New'',''old tab'',%L)',pg_temp.id(10),:'saved'::jsonb->>'revision'),'40001','cross-Admin stale overwrite blocked');

reset role;
do $$ declare actor int; begin
 for actor in 3..5 loop
  perform set_config('request.jwt.claim.sub',pg_temp.id(actor)::text,true);
  set local role authenticated;
  perform pg_temp.ok((select count(*)=0 from public.admin_inbox_messages),'Editor/Learner/unassigned RLS excludes all sender details and notes');
  perform pg_temp.reject('select public.get_admin_inbox_messages()','42501','non-Admin read RPC denied');
  perform pg_temp.reject(format('select public.save_admin_inbox_message(%L,''New'',''attack'',%L)',pg_temp.id(10),gen_random_uuid()),'42501','non-Admin update denied before identity/revision lookup');
  perform pg_temp.reject('select admin_inbox_internal.create_message(''x'',''x'',''Other'',''website'')','42501','non-Admin internal creation denied');
  reset role;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.reject('select * from public.admin_inbox_messages','42501','anonymous table access denied');
select pg_temp.reject('select public.get_admin_inbox_messages()','42501','anonymous read RPC denied');
select pg_temp.reject('select admin_inbox_internal.create_message(''x'',''x'',''Other'',''website'')','42501','anonymous creation denied');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select public.begin_account_deletion(pg_temp.id(1),repeat('f',64));
set local role authenticated;
select pg_temp.ok((select count(*)=0 from public.admin_inbox_messages),'deleting Admin cannot retain Inbox access with a stale token');
select pg_temp.reject(format('select public.save_admin_inbox_message(%L,''New'',''blocked'',%L)',pg_temp.id(10),:'shared'::jsonb->>'revision'),'42501','deleting Admin writes denied');
reset role;
select pg_temp.ok(not exists((select * from history_before) except (select 'attempts',to_jsonb(t) from public.review_attempts t union all select 'sessions',to_jsonb(t) from public.study_sessions t union all select 'questions',to_jsonb(t) from public.questions t union all select 'roles',to_jsonb(t) from public.user_roles t)),'existing roles, official Questions and learning history unchanged');
rollback;
