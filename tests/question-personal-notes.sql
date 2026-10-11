\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 'notes125_%' then raise exception 'Disposable notes125 database required'; end if; end $$;
-- Run against the isolated synthetic Goal/Advisor/Flagged Review fixture clone.
create function pg_temp.id(n int) returns uuid language sql immutable as $$ select ('12300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$ begin if v is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end $$;
create function pg_temp.reject(q text,code text) returns text language plpgsql as $$ begin execute q; raise exception 'Unexpected success'; exception when others then if sqlstate=code then return 'PASS: rejected '||code; else raise; end if; end $$;
select pg_temp.ok((select count(*)=5 from auth.users where id in(select pg_temp.id(n) from generate_series(1,5)n)),'synthetic accounts exist');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set local role authenticated;
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(60)) is null,'initial note absent');
select public.save_my_question_note(pg_temp.id(10),pg_temp.id(60),' First mnemonic ',null) note \gset
select pg_temp.ok(:'note'::jsonb->>'note'='First mnemonic','create trims outer spaces');
select pg_temp.ok(:'note'::jsonb->>'question_id'=pg_temp.id(60)::text,'canonical Question identity');
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(60))=:'note'::jsonb,'fresh read returns saved note');
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(61)) is null,'another Question has no note');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,%L,null)',pg_temp.id(10),pg_temp.id(60),'race'),'40001');
select public.save_my_question_note(pg_temp.id(10),pg_temp.id(60),E'Edited 🧠\n<script>literal</script>',(:'note'::jsonb->>'revision')::uuid) updated \gset
select pg_temp.ok(:'updated'::jsonb->>'revision'<>:'note'::jsonb->>'revision','edit changes opaque revision');
select pg_temp.ok(:'updated'::jsonb->>'note'=E'Edited 🧠\n<script>literal</script>','Unicode, newlines and literal text preserved');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,%L,%L)',pg_temp.id(10),pg_temp.id(60),'stale',:'note'::jsonb->>'revision'),'40001');
select pg_temp.reject(format('select public.delete_my_question_note(%L,%L,%L)',pg_temp.id(10),pg_temp.id(60),:'note'::jsonb->>'revision'),'40001');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,%L,null)',pg_temp.id(10),pg_temp.id(61),''),'22023');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,%L,null)',pg_temp.id(10),pg_temp.id(61),'   '),'22023');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,%L,null)',pg_temp.id(10),pg_temp.id(61),repeat('x',4001)),'22023');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,null,null)',pg_temp.id(10),pg_temp.id(61)),'22023');
select pg_temp.ok(length(public.save_my_question_note(pg_temp.id(10),pg_temp.id(61),repeat('x',4000),null)->>'note')=4000,'maximum note accepted');
select pg_temp.reject(format('insert into public.personal_question_notes(user_id,question_id,note) values(%L,%L,%L)',pg_temp.id(3),pg_temp.id(60),'foreign'),'42501');
select pg_temp.reject('update public.personal_question_notes set note=''bypass''','42501');
select pg_temp.reject('delete from public.personal_question_notes','42501');
select pg_temp.reject(format('select public.m125_require_question(%L,%L)',pg_temp.id(10),pg_temp.id(60)),'42501');
select pg_temp.reject(format('select public.get_my_question_note(%L,%L)',pg_temp.id(11),pg_temp.id(60)),'42501');
select pg_temp.reject(format('select public.get_my_question_note(%L,%L)',pg_temp.id(10),pg_temp.id(64)),'42501');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,%L,null)',pg_temp.id(10),pg_temp.id(81),'personal Card'),'42501');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.ok((select count(*)=0 from public.personal_question_notes),'other learner RLS excludes notes');
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(60)) is null,'other learner RPC excludes notes');
select pg_temp.reject(format('select public.delete_my_question_note(%L,%L,%L)',pg_temp.id(10),pg_temp.id(60),:'updated'::jsonb->>'revision'),'40001');
select public.save_my_question_note(pg_temp.id(10),pg_temp.id(60),'Other owner',null) other_note \gset
select pg_temp.ok(:'other_note'::jsonb->>'revision'<>:'updated'::jsonb->>'revision','same Question supports independent owner notes');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.ok((select count(*)=0 from public.personal_question_notes),'Admin cannot read learner notes');
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(60)) is null,'Admin RPC only returns own note');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.ok((select count(*)=0 from public.personal_question_notes),'Editor cannot read learner notes');
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(60)) is null,'Editor RPC only returns own note');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(60))=:'updated'::jsonb,'original owner note unchanged');
select public.delete_my_question_note(pg_temp.id(10),pg_temp.id(60),(:'updated'::jsonb->>'revision')::uuid);
select pg_temp.ok(public.get_my_question_note(pg_temp.id(10),pg_temp.id(60)) is null,'deletion persists');
select public.save_my_question_note(pg_temp.id(10),pg_temp.id(60),'Recreated',null) recreated \gset
select pg_temp.ok(:'recreated'::jsonb->>'revision'<>:'updated'::jsonb->>'revision','delete/recreate never reuses revision');
select pg_temp.reject(format('select public.save_my_question_note(%L,%L,%L,%L)',pg_temp.id(10),pg_temp.id(60),'ABA stale',:'updated'::jsonb->>'revision'),'40001');
reset role;
-- One official Question reused in two Libraries still has one private note.
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.concept_placements(concept_id,library_node_id,sort_order) values(pg_temp.id(50),pg_temp.id(30),99);
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set local role authenticated;
select pg_temp.ok(public.get_my_question_note(pg_temp.id(11),pg_temp.id(60))=:'recreated'::jsonb,'authorized second Library reuses canonical Question note');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.reject(format('select public.get_my_question_note(%L,%L)',pg_temp.id(11),pg_temp.id(60)),'42501');
reset role;
set local role anon;
select pg_temp.reject(format('select public.get_my_question_note(%L,%L)',pg_temp.id(10),pg_temp.id(60)),'42501');
select pg_temp.reject('select * from public.personal_question_notes','42501');
reset role;
rollback;
