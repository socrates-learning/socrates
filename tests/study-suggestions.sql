\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() <> 'admin_inbox128_suggestions129' then raise exception 'Disposable suggestions database required'; end if; end $$;
create function pg_temp.id(n int) returns uuid language sql as $$ select ('12900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject(q text,code text,label text) returns void language plpgsql as $$ begin execute q; raise exception 'Unexpected success: %',label; exception when others then if sqlstate=code then raise notice 'PASS: %',label; else raise; end if; end $$;
insert into auth.users(id,email) select pg_temp.id(n),'suggestion-'||n||'@example.invalid' from generate_series(1,7)n;
insert into public.user_roles(user_id,role) values(pg_temp.id(1),'admin'),(pg_temp.id(2),'learner'),(pg_temp.id(3),'editor'),(pg_temp.id(4),'learner'),(pg_temp.id(6),'learner'),(pg_temp.id(7),'learner');
insert into public.user_libraries(user_id,library_id) select pg_temp.id(n),'12200000-0000-4000-8000-000000000010'::uuid from generate_series(1,7)n;
create temp table before_history as select 'attempts' kind,to_jsonb(t) data from public.review_attempts t
 union all select 'sessions',to_jsonb(t) from public.study_sessions t
 union all select 'mastery',to_jsonb(t) from public.user_concept_mastery t
 union all select 'roles',to_jsonb(t) from public.user_roles t;
create function pg_temp.submit(actor int,request int,body text default 'Synthetic correction',question uuid default '12200000-0000-4000-8000-000000000060',library uuid default '12200000-0000-4000-8000-000000000010',category text default 'Content Correction') returns jsonb language sql as $$
 select public.submit_study_suggestion_internal(pg_temp.id(actor),pg_temp.id(request),library,question,category,body)
$$;
set local role service_role;
select pg_temp.submit(2,100) first_receipt \gset
select pg_temp.ok((pg_temp.submit(2,100))=:'first_receipt'::jsonb,'retry returns the original receipt');
select pg_temp.reject('select pg_temp.submit(2,100,''Changed body'')','23505','idempotency key cannot change its payload');
select pg_temp.submit(4,100) other_receipt \gset
select pg_temp.ok(:'first_receipt'::jsonb<>:'other_receipt'::jsonb,'request identity is scoped to the authenticated sender');
select pg_temp.submit(2,101,'General suggestion',null) personal_receipt \gset
select pg_temp.submit(3,102,'Editor suggestion') editor_receipt \gset
select pg_temp.reject('select pg_temp.submit(5,110)','42501','pending account denied');
select pg_temp.reject('select pg_temp.submit(99,110)','42501','missing account denied');
select pg_temp.reject('select pg_temp.submit(2,110,'''')','22023','empty input denied');
select pg_temp.reject('select pg_temp.submit(2,110,E'' \n\t'')','22023','whitespace input denied');
select pg_temp.reject('select pg_temp.submit(2,110,repeat(''x'',4001))','22023','oversized input denied');
select pg_temp.reject('select pg_temp.submit(2,110,''x'',null,null)','42501','missing Library denied');
select pg_temp.reject('select pg_temp.submit(2,110,''x'',null,''12200000-0000-4000-8000-000000000011'')','42501','unauthorized Library denied');
select pg_temp.reject('select pg_temp.submit(2,110,''x'',pg_temp.id(999))','42501','unknown or private Question reference denied');
select pg_temp.reject('select pg_temp.submit(2,110,''x'',null,''12200000-0000-4000-8000-000000000010'',''Technical Support'')','22023','unapproved category denied');
select pg_temp.reject('select public.submit_study_suggestion_internal(pg_temp.id(2),null,''12200000-0000-4000-8000-000000000010'',null,''Other'',''x'')','22023','missing request key denied');
reset role;
select pg_temp.ok((select count(*)=1 from public.admin_inbox_messages where sender_user_id=pg_temp.id(2) and submission_key=pg_temp.id(100)),'retry creates exactly one message');
select pg_temp.ok((select category='Content Correction' and source='study_mode' and status='New' and admin_notes='' and submitted_at is not null and topic_id is not null and sender_name is null and sender_contact is null from public.admin_inbox_messages where id=(:'first_receipt'::jsonb->>'id')::uuid),'receipt has approved context and defaults without copying sender contacts');
select pg_temp.ok((select question_id is null and topic_id is null and content='General suggestion' from public.admin_inbox_messages where id=(:'personal_receipt'::jsonb->>'id')::uuid),'personal Card context is not stored');
update public.questions set status='draft' where id='12200000-0000-4000-8000-000000000060';
set local role service_role;
select pg_temp.reject('select pg_temp.submit(2,111)','42501','unpublished Question denied');
reset role;
update public.questions set status='published' where id='12200000-0000-4000-8000-000000000060';
set local role service_role;
select pg_temp.submit(2,112),pg_temp.submit(2,113),pg_temp.submit(2,114);
select pg_temp.reject('select pg_temp.submit(2,115)','P0429','five submissions per ten minutes enforced');
select pg_temp.ok(pg_temp.submit(2,100)=:'first_receipt'::jsonb,'retry succeeds even when the quota is full');
reset role;
-- Age only this test sender's synthetic rows, within the rollback transaction.
do $$ begin
 for n in 1..4 loop
  set local role service_role;
  perform pg_temp.submit(6,200+n);
  reset role;
 end loop;
end $$;
do $$ begin
 for n in 5..20 loop
  update public.admin_inbox_messages set submitted_at=clock_timestamp()-interval '1 hour' where sender_user_id=pg_temp.id(6);
  set local role service_role; perform pg_temp.submit(6,200+n); reset role;
 end loop;
end $$;
set local role service_role;
select pg_temp.reject('select pg_temp.submit(6,221)','P0429','twenty submissions per day enforced');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set local role authenticated;
select pg_temp.ok((select count(*)=0 from public.admin_inbox_messages),'learner cannot read any Inbox data');
select pg_temp.reject('select pg_temp.submit(1,500)','42501','learner cannot call internal submission or forge an Admin');
select pg_temp.reject('insert into public.admin_inbox_messages(subject,content,category,source) values(''x'',''x'',''Other'',''study_mode'')','42501','learner has no direct insert grant');
select pg_temp.reject('select public.get_admin_inbox_messages()','42501','learner cannot use Admin read RPC');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.ok((select count(*)=0 from public.admin_inbox_messages),'Editor cannot read Inbox');
select pg_temp.reject('select pg_temp.submit(3,500)','42501','Editor browser cannot call internal creation');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.ok((select content='Synthetic correction' and sender_user_id=pg_temp.id(2) from public.get_admin_inbox_messages() where id=(:'first_receipt'::jsonb->>'id')::uuid),'Admin receives the learner message and private identity');
select pg_temp.reject('select pg_temp.submit(1,500)','42501','Admin browser also requires the server endpoint');
reset role;
set local role anon;
select pg_temp.reject('select pg_temp.submit(2,501)','42501','anonymous creation denied');
select pg_temp.reject('select * from public.admin_inbox_messages','42501','anonymous reading denied');
reset role;
select public.begin_account_deletion(pg_temp.id(7),repeat('7',64));
set local role service_role;
select pg_temp.reject('select pg_temp.submit(7,501)','42501','account deletion lock blocks stale-session suggestions');
reset role;
select pg_temp.ok(not exists((select * from before_history) except (select 'attempts',to_jsonb(t) from public.review_attempts t union all select 'sessions',to_jsonb(t) from public.study_sessions t union all select 'mastery',to_jsonb(t) from public.user_concept_mastery t union all select 'roles',to_jsonb(t) from public.user_roles t)),'attempts, sessions, mastery and roles unchanged');
rollback;
