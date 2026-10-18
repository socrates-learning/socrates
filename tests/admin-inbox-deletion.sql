\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() <> 'admin_inbox128_deletion131_20261016' then raise exception 'Disposable deletion database required'; end if; end $$;
create function pg_temp.id(n int) returns uuid language sql as $$ select ('13100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject(q text,code text,label text) returns void language plpgsql as $$ begin execute q; raise exception 'Unexpected success: %',label; exception when others then if sqlstate=code then raise notice 'PASS: %',label; else raise; end if; end $$;
create temp table original_messages as select * from public.admin_inbox_messages;
create temp table before_history as select 'attempts' kind,to_jsonb(t) data from public.review_attempts t
 union all select 'sessions',to_jsonb(t) from public.study_sessions t
 union all select 'mastery',to_jsonb(t) from public.user_concept_mastery t
 union all select 'questions',to_jsonb(t) from public.questions t;
insert into auth.users(id,email) select pg_temp.id(n),'delete-test-'||n||'@example.invalid' from generate_series(1,6)n;
insert into public.user_roles(user_id,role) values(pg_temp.id(1),'admin'),(pg_temp.id(2),'admin'),(pg_temp.id(3),'editor'),(pg_temp.id(4),'learner'),(pg_temp.id(6),'admin');
insert into public.user_libraries(user_id,library_id) select pg_temp.id(n),'12200000-0000-4000-8000-000000000010'::uuid from generate_series(1,6)n;
select admin_inbox_internal.create_message('Synthetic message','Synthetic body','Other','study_mode',null,null,null,null,pg_temp.id(10));
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select public.save_admin_inbox_message(pg_temp.id(10),'Resolved','Private notes',(select revision from public.admin_inbox_messages where id=pg_temp.id(10))) resolved \gset
select pg_temp.ok(exists(select 1 from public.admin_inbox_messages where id=pg_temp.id(10)),'Resolved does not automatically delete a message');
select pg_temp.reject('delete from public.admin_inbox_messages','42501','direct Admin DELETE remains denied');
select pg_temp.reject('select public.delete_admin_inbox_message(null,null)','22023','missing identity and revision rejected');
select public.delete_admin_inbox_message(pg_temp.id(10),(:'resolved'::jsonb->>'revision')::uuid) receipt \gset
select pg_temp.ok(:'receipt'::jsonb=jsonb_build_object('id',pg_temp.id(10),'deleted',true),'confirmed Admin deletion returns only its receipt');
select pg_temp.ok(not exists(select 1 from public.admin_inbox_messages where id=pg_temp.id(10)),'message and notes permanently removed from active table');
select pg_temp.ok(public.delete_admin_inbox_message(pg_temp.id(10),(:'resolved'::jsonb->>'revision')::uuid)=:'receipt'::jsonb,'lost deletion acknowledgement retries safely');
reset role;
do $$ declare state text; message_id uuid; rev uuid; begin
 foreach state in array array['New','In Review','Resolved'] loop
  message_id:=admin_inbox_internal.create_message('Delete any status','Synthetic content','Other','study_mode');
  update public.admin_inbox_messages set status=state where admin_inbox_messages.id=message_id;
  select revision into rev from public.admin_inbox_messages where admin_inbox_messages.id=message_id;
  set local role authenticated;
  perform public.delete_admin_inbox_message(message_id,rev);
  perform pg_temp.ok(not exists(select 1 from public.admin_inbox_messages where admin_inbox_messages.id=message_id),'deletion allowed for '||state);
  reset role;
 end loop;
end $$;
select admin_inbox_internal.create_message('Concurrent edit','Synthetic content','Other','study_mode',null,null,null,null,pg_temp.id(11));
select revision old_revision from public.admin_inbox_messages where id=pg_temp.id(11) \gset
set local role authenticated;
select public.save_admin_inbox_message(pg_temp.id(11),'In Review','Another Admin updated this',:'old_revision') newer \gset
select pg_temp.reject(format('select public.delete_admin_inbox_message(%L,%L)',pg_temp.id(11),:'old_revision'),'40001','stale deletion cannot erase a concurrent edit');
select pg_temp.ok((select admin_notes='Another Admin updated this' from public.admin_inbox_messages where id=pg_temp.id(11)),'stale delete preserves latest notes');
reset role;
do $$ declare actor int; begin
 for actor in 3..5 loop
  perform set_config('request.jwt.claim.sub',pg_temp.id(actor)::text,true);
  set local role authenticated;
  perform pg_temp.reject(format('select public.delete_admin_inbox_message(%L,%L)',pg_temp.id(11),gen_random_uuid()),'42501','Editor/Learner/unassigned deletion denied');
  perform pg_temp.reject('select * from admin_inbox_internal.deleted_study_receipts','42501','browser cannot read private retry receipts');
  reset role;
 end loop;
end $$;
set local role anon;
select pg_temp.reject('select public.delete_admin_inbox_message(null,null)','42501','anonymous deletion denied');
reset role;
set local role service_role;
select pg_temp.reject('select public.delete_admin_inbox_message(null,null)','42501','service JWT has no Admin deletion RPC grant');
select pg_temp.reject('select * from admin_inbox_internal.deleted_study_receipts','42501','service JWT cannot read private receipts');
reset role;
select public.begin_account_deletion(pg_temp.id(6),repeat('6',64));
select set_config('request.jwt.claim.sub',pg_temp.id(6)::text,true);
set local role authenticated;
select pg_temp.reject('select public.delete_admin_inbox_message(null,null)','42501','deleting Admin cannot delete with a stale session');
reset role;

-- Deleting an actual Study submission must not permit resurrection or reset quota.
set local role service_role;
select public.submit_study_suggestion_internal(pg_temp.id(4),pg_temp.id(100),'12200000-0000-4000-8000-000000000010',null,'Other','Synthetic suggestion') original_receipt \gset
reset role;
select revision study_revision from public.admin_inbox_messages where id=(:'original_receipt'::jsonb->>'id')::uuid \gset
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select public.delete_admin_inbox_message((:'original_receipt'::jsonb->>'id')::uuid,:'study_revision');
reset role;
select pg_temp.ok((select count(*)=1 from admin_inbox_internal.deleted_study_receipts where sender_user_id=pg_temp.id(4)),'deletion retains one content-free retry receipt');
set local role service_role;
select pg_temp.ok(public.submit_study_suggestion_internal(pg_temp.id(4),pg_temp.id(100),'12200000-0000-4000-8000-000000000010',null,'Other','Synthetic suggestion')=:'original_receipt'::jsonb,'Study retry after deletion returns original receipt');
select pg_temp.reject(format('select public.submit_study_suggestion_internal(%L,%L,%L,null,''Other'',''Changed payload'')',pg_temp.id(4),pg_temp.id(100),'12200000-0000-4000-8000-000000000010'),'23505','changed payload cannot reuse a deleted request');
select public.submit_study_suggestion_internal(pg_temp.id(4),pg_temp.id(n),'12200000-0000-4000-8000-000000000010',null,'Other','New synthetic suggestion') from generate_series(101,104)n;
select pg_temp.reject(format('select public.submit_study_suggestion_internal(%L,%L,%L,null,''Other'',''Over quota'')',pg_temp.id(4),pg_temp.id(105),'12200000-0000-4000-8000-000000000010'),'P0429','deletion does not reset the ten-minute quota');
reset role;
select pg_temp.ok(not exists(select 1 from public.admin_inbox_messages where id=(:'original_receipt'::jsonb->>'id')::uuid),'delayed retry never recreates deleted message content');
-- Simulate the rest of the same rolling day; deleted submissions still count.
update public.admin_inbox_messages set submitted_at=clock_timestamp()-interval '1 hour' where sender_user_id=pg_temp.id(4);
update admin_inbox_internal.deleted_study_receipts set submitted_at=clock_timestamp()-interval '1 hour' where sender_user_id=pg_temp.id(4);
insert into admin_inbox_internal.deleted_study_receipts(sender_user_id,submission_key,submission_hash,message_id,submitted_at)
 select pg_temp.id(4),pg_temp.id(n),repeat('a',64),pg_temp.id(n+1000),clock_timestamp()-interval '2 hours' from generate_series(200,214)n;
set local role service_role;
select pg_temp.reject(format('select public.submit_study_suggestion_internal(%L,%L,%L,null,''Other'',''Over daily quota'')',pg_temp.id(4),pg_temp.id(106),'12200000-0000-4000-8000-000000000010'),'P0429','deleted submissions remain in the daily quota');
reset role;
select public.begin_account_deletion(pg_temp.id(4),repeat('4',64));
delete from auth.users where id=pg_temp.id(4);
set constraints all immediate;
select pg_temp.ok(not exists(select 1 from admin_inbox_internal.deleted_study_receipts where sender_user_id=pg_temp.id(4)),'Auth deletion removes content-free receipts');
select pg_temp.ok(exists(select 1 from public.admin_inbox_messages where content='New synthetic suggestion' and sender_user_id is null),'existing account deletion behavior for remaining messages unchanged');
select pg_temp.ok(not exists((select * from original_messages) except (select * from public.admin_inbox_messages)),'all unrelated original messages and notes preserved');
select pg_temp.ok(not exists((select * from before_history) except (select 'attempts',to_jsonb(t) from public.review_attempts t union all select 'sessions',to_jsonb(t) from public.study_sessions t union all select 'mastery',to_jsonb(t) from public.user_concept_mastery t union all select 'questions',to_jsonb(t) from public.questions t)),'learning data and educational content preserved');
rollback;
