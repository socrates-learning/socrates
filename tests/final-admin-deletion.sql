\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() not like 'account139_run_%' then raise exception 'Disposable account139 database required'; end if;
end $$;
create function pg_temp.id(n integer) returns uuid language sql as $$select ('a1390000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end$$;
create function pg_temp.reject(statement text,expected text,label text) returns void language plpgsql as $$begin
 begin execute statement; exception when others then
  if sqlstate<>expected then raise exception 'Unexpected SQLSTATE % for %',sqlstate,label; end if;
  raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAIL: %',label;
end$$;
insert into auth.users(id,email) values(pg_temp.id(1),'admin139-a@example.invalid'),(pg_temp.id(2),'admin139-b@example.invalid'),(pg_temp.id(3),'learner139@example.invalid');
insert into public.user_roles(user_id,role) values(pg_temp.id(1),'admin'),(pg_temp.id(2),'learner'),(pg_temp.id(3),'learner');
create temp table before_denial as select to_jsonb(s) value from public.account_deletion_state s where user_id=pg_temp.id(1);
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'P1391','Sole active Administrator denied');
select pg_temp.ok((select to_jsonb(s)=b.value from public.account_deletion_state s cross join before_denial b where s.user_id=pg_temp.id(1)),'Denial leaves account state, receipt and object inventory byte-identical');
select pg_temp.ok(exists(select 1 from auth.users where id=pg_temp.id(1)),'Denied account identity remains');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.ok(public.account_is_active() and public.is_admin(),'Denied Administrator retains active access');
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'42501','Browser cannot call live initiation');
select pg_temp.reject(format('select account_deletion_private.prepare_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'42501','Browser cannot call recovery preparation');
reset role;
set local role anon;
select pg_temp.reject(format('select account_deletion_private.prepare_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'42501','Anonymous recovery denied');
reset role;
set local role service_role;
select pg_temp.reject(format('select account_deletion_private.prepare_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'42501','Application service credentials cannot invoke recovery');
select set_config('app.account_deletion_recovery','true',true);
select set_config('request.jwt.claims','{"role":"postgres","recovery":true,"app_metadata":{"recovery":true}}',true);
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'P1391','Forged settings and metadata do not bypass final Administrator guard');
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(1),'invalid'),'P0001','Invalid receipt still rejected');
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
update public.user_roles set role='admin' where user_id=pg_temp.id(2);
select public.begin_account_deletion(pg_temp.id(2),repeat('b',64));
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'P1391','Pending replacement Administrator does not count as active');
select pg_temp.ok((select state='active' from public.account_deletion_state where user_id=pg_temp.id(1)),'Inactive replacement denial leaves requester active');
create temp table before_retry as select requested_at,objects,object_hashes from public.account_deletion_state where user_id=pg_temp.id(2);
select public.begin_account_deletion(pg_temp.id(2),repeat('c',64));
select pg_temp.ok((select s.state='pending' and s.receipt_hash=repeat('c',64) and s.requested_at=b.requested_at and s.objects=b.objects and s.object_hashes=b.object_hashes from public.account_deletion_state s cross join before_retry b where s.user_id=pg_temp.id(2)),'Accepted pending retry rotates only receipt and preserves original inventory');
select pg_temp.ok(public.account_deletion_status(repeat('b',64)) is null,'Superseded receipt no longer authorizes cleanup');
set local role supabase_auth_admin;
delete from auth.users where id=pg_temp.id(2);
reset role;
set constraints all immediate;
select pg_temp.ok(public.account_deletion_status(repeat('c',64))->>'state'='complete','Auth provider role can complete accepted Administrator cleanup without private schema access');
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(2),repeat('d',64)),'P0001','Completed account cannot initiate deletion again');
select pg_temp.reject(format('delete from auth.users where id=%L',pg_temp.id(1)),'P0001','Direct Auth deletion still requires accepted confirmation');
select public.begin_account_deletion(pg_temp.id(3),repeat('e',64));
delete from auth.users where id=pg_temp.id(3);
set constraints all immediate;
select pg_temp.ok(public.account_deletion_status(repeat('e',64))->>'state'='complete','Learner deletion and durable completion receipt unchanged');
select pg_temp.ok((select count(*)=1 from public.user_roles r join public.account_deletion_state s on s.user_id=r.user_id where r.role='admin' and s.state='active'),'Learner cleanup preserves active Administrator');
-- Simulate an accepted pending request captured in an older backup. This is a
-- rollback-only synthetic fixture; live requests cannot make this transition.
update public.account_deletion_state set state='pending',receipt_hash=repeat('f',64),requested_at=now() where user_id=pg_temp.id(1);
select public.begin_account_deletion(pg_temp.id(1),repeat('1',64));
select pg_temp.ok((select state='pending' from public.account_deletion_state where user_id=pg_temp.id(1)),'Previously accepted pending deletion retries even without an active replacement');
delete from auth.users where id=pg_temp.id(1);
set constraints all immediate;
select pg_temp.ok(public.account_deletion_status(repeat('1',64))->>'state'='complete','Historical pending deletion retains completion guarantee');
select pg_temp.ok(public.account_deletion_status(repeat('c',64))->>'state'='complete' and public.account_deletion_status(repeat('e',64))->>'state'='complete','Unrelated completion receipts preserved');
rollback;
