\set ON_ERROR_STOP on
begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
insert into auth.users(id,email) values
 ('12600000-0000-0000-0000-000000000001','profile126-one@example.invalid'),
 ('12600000-0000-0000-0000-000000000002','profile126-two@example.invalid'),
 ('12600000-0000-0000-0000-000000000003','profile126-pending@example.invalid');
insert into public.user_roles(user_id,role) values
 ('12600000-0000-0000-0000-000000000001','learner'),('12600000-0000-0000-0000-000000000002','admin');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12600000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into storage.objects(bucket_id,name) values ('socrates-profile-photos','12600000-0000-0000-0000-000000000001/avatar');
select pg_temp.expect((select count(*)=1 from storage.objects where bucket_id='socrates-profile-photos'),'learner can insert and read own photo');
update storage.objects set metadata='{"test":"own update"}' where bucket_id='socrates-profile-photos';
select pg_temp.expect((select metadata->>'test'='own update' from storage.objects where bucket_id='socrates-profile-photos'),'learner can update own photo');
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('socrates-profile-photos','12600000-0000-0000-0000-000000000002/avatar'); raise exception 'FAIL cross-owner insert'; exception when insufficient_privilege then raise notice 'PASS: cross-owner insert rejected'; end;
 begin update storage.objects set name='12600000-0000-0000-0000-000000000002/avatar' where bucket_id='socrates-profile-photos'; raise exception 'FAIL cross-owner rename'; exception when insufficient_privilege then raise notice 'PASS: cross-owner rename rejected'; end;
 begin insert into storage.objects(bucket_id,name) values('socrates-profile-photos','12600000-0000-0000-0000-000000000001/extra'); raise exception 'FAIL extra object'; exception when insufficient_privilege then raise notice 'PASS: only one fixed photo key allowed'; end;
end $$;
select set_config('request.jwt.claims','{"sub":"12600000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.expect((select count(*)=0 from storage.objects where bucket_id='socrates-profile-photos'),'Admin cannot read another account photo');
do $$ declare n int; begin update storage.objects set metadata='{}' where bucket_id='socrates-profile-photos'; get diagnostics n=row_count; perform pg_temp.expect(n=0,'Admin cannot update another account photo'); end $$;
insert into storage.objects(bucket_id,name) values('socrates-profile-photos','12600000-0000-0000-0000-000000000002/avatar');
select pg_temp.expect((select count(*)=1 from storage.objects where bucket_id='socrates-profile-photos'),'Admin can manage own photo');
reset role;
update public.user_roles set role='editor' where user_id='12600000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.expect((select count(*)=1 from storage.objects where bucket_id='socrates-profile-photos'),'Editor can read only own photo');
select set_config('request.jwt.claims','{"sub":"12600000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.expect((select count(*)=0 from storage.objects where bucket_id='socrates-profile-photos'),'pending account cannot read photos');
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('socrates-profile-photos','12600000-0000-0000-0000-000000000003/avatar'); raise exception 'FAIL pending insert'; exception when insufficient_privilege then raise notice 'PASS: pending account insert rejected'; end;
end $$;
reset role;
-- Demonstrate that a future permissive policy cannot defeat this bucket boundary.
create policy profile126_test_broad on storage.objects for all to anon,authenticated using(true) with check(true);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.expect((select count(*)=0 from storage.objects where bucket_id='socrates-profile-photos'),'anonymous access rejected even with another permissive policy');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12600000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.expect((select count(*)=1 from storage.objects where bucket_id='socrates-profile-photos'),'broad policy cannot expose another account photo');
rollback;
