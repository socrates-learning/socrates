-- LOCAL CANDIDATE ONLY. No data repair, seed, or historical-content mutation.
-- Reviewed exception to Migration 103 default: this internal read-only trigger
-- is postgres-owned SECURITY DEFINER so integrity does not depend on caller RLS.
-- No ordinary RPC, role, policy, membership, or default privilege is changed.
-- Existing 104 transaction lock serializes structural writes before row locks.
-- Deferred checks permit atomic root + placement insertion and whole-branch deletion.
begin;
create temporary table m110_contract_before on commit drop as
select 'function' kind, oid::text id, jsonb_build_array(proowner,proacl,prosecdef,proconfig,pg_get_functiondef(oid))::text val
from pg_proc where pronamespace='public'::regnamespace
union all select 'relation',oid::text,jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity)::text from pg_class where relnamespace='public'::regnamespace
union all select 'policy',oid::text,to_jsonb(p)::text from pg_policy p
union all select 'role',oid::text,to_jsonb(r)::text from pg_roles r
union all select 'membership',oid::text,to_jsonb(m)::text from pg_auth_members m
union all select 'default',oid::text,to_jsonb(d)::text from pg_default_acl d;
do $preflight$
declare signature text; expected text; expected_owner text; expected_acl text; relation_name text;
begin
 if session_user <> 'postgres' or current_user <> 'postgres' then raise exception '110 requires postgres installer'; end if;
 if to_regprocedure('public.enforce_canonical_personal_topic_placement()') is not null then raise exception '110 already or partially installed'; end if;
 for signature,expected,expected_owner,expected_acl in select * from (values
 ('public.get_home_study_bootstrap(uuid,uuid)','a1466f5a75f9c3249222f3335eb14e4e','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
 ('public.lock_topic_structure_before_write()','0b85367f25677e16e06fa3ad965fa7f8','socrates_migrator','{socrates_migrator=X/socrates_migrator,postgres=X/socrates_migrator}'),
 ('public.position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])','420c5fe6c20eea93f915028912b1da86','socrates_migrator','{socrates_migrator=X/socrates_migrator,authenticated=X/socrates_migrator,postgres=X/socrates_migrator}'),
 ('public.create_personal_topic(text,uuid,uuid,integer)','bf057617b3b828d536db526a12c11877','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
 ('public.validate_personal_topic_official_placement()','ca1b708a255394e47f63777e658d9b5c','postgres','{postgres=X/postgres,service_role=X/postgres}')
 ) contracts(signature,expected,expected_owner,expected_acl) loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(signature) and md5(pg_get_functiondef(oid))=expected and proowner::regrole::text=expected_owner and proacl::text=expected_acl) then
   raise exception '110 prerequisite mismatch: %',signature;
  end if;
 end loop;
 if not exists(select 1 from pg_roles where rolname='socrates_migrator' and not rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb and not rolinherit and not rolbypassrls)
 or not has_schema_privilege('socrates_migrator','public','CREATE')
 or exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='socrates_migrator'::regrole and a.grantee<>d.defaclrole)
 then raise exception '110 requires Migration 103 ownership boundary'; end if;
 foreach relation_name in array array['personal_topics','personal_topic_official_placements','library_nodes','libraries'] loop
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||relation_name)::regclass and tgname='m104_structure_lock' and tgenabled='O' and tgtype=30 and tgfoid='public.lock_topic_structure_before_write()'::regprocedure)
  then raise exception '110 requires enabled serialized structural writes on %',relation_name; end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.personal_topic_official_placements'::regclass and conname='personal_topic_official_placements_root_owner_fkey' and convalidated)
 then raise exception '110 requires Migration 099 root-owner foreign key';end if;
 -- This narrowly scoped definer uses existing table-owner visibility, not new
 -- BYPASSRLS grants or browser policies. Fail closed on a different owner model.
 if exists(select 1 from pg_class where oid in ('public.personal_topics'::regclass,
 'public.personal_topic_official_placements'::regclass,'public.library_nodes'::regclass,
 'public.libraries'::regclass) and (relowner<>'postgres'::regrole or relforcerowsecurity))
 or not exists(select 1 from pg_roles where rolname='postgres' and not rolsuper)
 then raise exception '110 requires non-superuser postgres table-owner integrity authority';end if;
end $preflight$;

create function public.enforce_canonical_personal_topic_placement() returns trigger
language plpgsql security definer set search_path='' as $check$
declare affected_ids uuid[]; affected_id uuid; valid boolean;
begin
 -- Fixed trigger relations and row identities only. No parameters, dynamic SQL,
 -- writes, or returned content. RPC/RLS authorization precedes this check.
 if tg_table_schema<>'public' or tg_table_name not in
 ('personal_topics','personal_topic_official_placements','library_nodes','libraries')
 then raise exception 'Unexpected canonical integrity trigger context';end if;
 if tg_table_name='libraries' then
  if new.status is not distinct from old.status then return null;end if;
  select coalesce(array_agg(p.personal_topic_id),array[]::uuid[]) into affected_ids
  from public.personal_topic_official_placements p
  join public.library_nodes n on n.id=p.library_node_id where n.library_id=new.id;
 elsif tg_table_name='library_nodes' then
  if new.library_id is not distinct from old.library_id then return null;end if;
  select coalesce(array_agg(p.personal_topic_id),array[]::uuid[]) into affected_ids
  from public.personal_topic_official_placements p where p.library_node_id=new.id;
 -- Rename/sibling normalization must not reconcile or block historical records.
 elsif tg_table_name='personal_topics' then
  if tg_op='UPDATE' and new.id is not distinct from old.id and new.owner_id is not distinct from old.owner_id and new.parent_id is not distinct from old.parent_id then return null; end if;
  affected_ids:=array[new.id];
 else
  -- Retargeting a placement must validate both the previous and new branches.
  if tg_op='DELETE' then affected_ids:=array[old.personal_topic_id];
  elsif tg_op='INSERT' then affected_ids:=array[new.personal_topic_id];
  else affected_ids:=array[old.personal_topic_id,new.personal_topic_id];end if;
 end if;
 foreach affected_id in array affected_ids loop
  -- A deleted Topic needs no placement; cascaded deletion remains permitted.
  if not exists(select 1 from public.personal_topics where id=affected_id) then continue;end if;
  with recursive ancestry as (
   select t.id,t.owner_id,t.parent_id,array[t.id] visited from public.personal_topics t where t.id=affected_id
   union all
   select t.id,t.owner_id,t.parent_id,a.visited||t.id from ancestry a
   join public.personal_topics t on t.id=a.parent_id and t.owner_id=a.owner_id
   where not t.id=any(a.visited)
  )
  select exists(
   select 1 from ancestry a
   join public.personal_topic_official_placements p on p.personal_topic_id=a.id and p.owner_id=a.owner_id
   join public.library_nodes n on n.id=p.library_node_id
   join public.libraries l on l.id=n.library_id and l.status='active'
   where a.parent_id is null
  ) into valid;
  if not valid then raise exception 'Custom Topic requires a canonical Topic placement' using errcode='23514';end if;
 end loop;
 return null;
end $check$;
revoke all on function public.enforce_canonical_personal_topic_placement() from public,anon,authenticated,service_role;
grant execute on function public.enforce_canonical_personal_topic_placement() to postgres;
create constraint trigger m110_canonical_topic_placement
 after insert or update on public.personal_topics
 deferrable initially deferred for each row execute function public.enforce_canonical_personal_topic_placement();
create constraint trigger m110_canonical_placement_survival
 after insert or update or delete on public.personal_topic_official_placements
 deferrable initially deferred for each row execute function public.enforce_canonical_personal_topic_placement();

-- Existing Migration 104 serialization also covers libraries. These deferred
-- checks cover active-Library changes and canonical node Library reassignment.
-- Canonical node/Library deletion is covered by placement DELETE cascades.
create constraint trigger m110_canonical_library_status
 after update on public.libraries
 deferrable initially deferred for each row when (old.status is distinct from new.status) execute function public.enforce_canonical_personal_topic_placement();
create constraint trigger m110_canonical_node_library
 after update on public.library_nodes
 deferrable initially deferred for each row when (old.library_id is distinct from new.library_id) execute function public.enforce_canonical_personal_topic_placement();

-- Every pre-existing function, including ALL Migration 109 selection functions,
-- and every existing ownership/ACL/RLS/role contract must remain identical.
do $postflight$
begin
 if exists(
 select * from m110_contract_before except
 (select 'function',oid::text,jsonb_build_array(proowner,proacl,prosecdef,proconfig,pg_get_functiondef(oid))::text from pg_proc where pronamespace='public'::regnamespace
 union all select 'relation',oid::text,jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity)::text from pg_class where relnamespace='public'::regnamespace
 union all select 'policy',oid::text,to_jsonb(p)::text from pg_policy p
 union all select 'role',oid::text,to_jsonb(r)::text from pg_roles r
 union all select 'membership',oid::text,to_jsonb(m)::text from pg_auth_members m
 union all select 'default',oid::text,to_jsonb(d)::text from pg_default_acl d))
 then raise exception '110 changed an existing protected contract';end if;
 if not exists(select 1 from pg_proc where oid='public.enforce_canonical_personal_topic_placement()'::regprocedure and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""'] and proacl::text='{postgres=X/postgres}') then raise exception '110 new function ownership boundary mismatch';end if;
end $postflight$;
commit;
