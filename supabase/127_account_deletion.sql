-- Permanent self-service deletion. Install locally first; no provider settings.
-- Storage bytes are removed through its API before Auth's hard-delete operation.
-- Auth deletion and application cleanup then share ONE database transaction.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regclass('public.personal_question_notes') is null
    or not exists(select 1 from storage.buckets where id='socrates-profile-photos' and not public)
 then raise exception '127 requires postgres and released 126'; end if;
end $$;

-- No email, name, content, credentials or study history. Completed rows are
-- restricted deletion tombstones, also needed when reconciling older backups.
create table public.account_deletion_state (
 user_id uuid primary key,
 state text not null default 'active' check(state in ('active','pending','complete')),
 receipt_hash text unique check(receipt_hash ~ '^[0-9a-f]{64}$'),
 objects jsonb not null default '[]' check(jsonb_typeof(objects)='array'),
 object_hashes text[] not null default '{}',
 requested_at timestamptz,
 completed_at timestamptz,
 purge_xid xid8,
 check((state='active' and receipt_hash is null and requested_at is null)
    or (state<>'active' and receipt_hash is not null and requested_at is not null))
);
alter table public.account_deletion_state enable row level security;
revoke all on public.account_deletion_state from public,anon,authenticated,service_role;
create index account_deletion_object_hashes on public.account_deletion_state using gin(object_hashes);
insert into public.account_deletion_state(user_id) select id from auth.users;

create function public.m127_account_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.account_deletion_state(user_id) values(new.id);
 return new;
end $$;
create trigger a127_account_created before insert on auth.users
for each row execute function public.m127_account_created();

create function public.m127_purging(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_deletion_state
 where user_id=p_user and state='pending' and purge_xid=pg_current_xact_id_if_assigned())
$$;
create function public.account_is_active() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_deletion_state where user_id=auth.uid()
 and (state='active' or public.m127_purging(user_id)))
$$;
-- The row lock is a concurrency barrier, including REPEATABLE READ callers.
-- An advisory lock alone would not make an older MVCC snapshot safe.
create function public.m127_assert_writable(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s text;
begin
 if p_user is null then return; end if;
 select state into s from public.account_deletion_state where user_id=p_user for share;
 if s is distinct from 'active' and not public.m127_purging(p_user) then
  raise exception 'Account is being deleted' using errcode='42501';
 end if;
end $$;
create function public.m127_write_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text; value text; row_data jsonb;
begin
 perform public.m127_assert_writable(auth.uid());
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 foreach field in array coalesce(tg_argv,array[]::text[]) loop
  value:=row_data->>field;
  if value is not null then perform public.m127_assert_writable(value::uuid); end if;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;

-- Restrictive policies supplement, never replace, existing ownership/RLS.
-- Trigger checks also cover SECURITY DEFINER writes that bypass RLS.
do $$ declare t record; args text; begin
 for t in select c.oid,c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) owner from pg_class c
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname<>'account_deletion_state'
 loop
  select string_agg(quote_literal(a.attname),',' order by a.attname) into args
  from pg_attribute a where a.attrelid=t.oid and a.attnum in (
   select unnest(k.conkey) from pg_constraint k where k.conrelid=t.oid
   and k.contype='f' and k.confrelid='auth.users'::regclass);
  if t.owner='socrates_migrator' then execute 'set local role socrates_migrator';
  elsif t.owner<>'postgres' then raise exception '127 unexpected table owner %',t.owner; end if;
  execute format('create trigger a127_write_fence before insert or update or delete on public.%I for each row execute function public.m127_write_fence(%s)',t.relname,coalesce(args,''));
  if t.relrowsecurity then
   execute format('create policy account_deletion_fence on public.%I as restrictive to authenticated using ((select public.account_is_active())) with check ((select public.account_is_active()))',t.relname);
  end if;
  if t.owner='socrates_migrator' then execute 'set local role postgres'; end if;
 end loop;
end $$;

-- Attribution removal does not count as a content edit or change timestamps.
do $$ declare name text; definition text; begin
 foreach name in array array['set_wiki_updated_at','set_question_bank_updated_at','set_sources_updated_at'] loop
  definition:=pg_get_functiondef(to_regprocedure('public.'||name||'()'));
  if position(E'\nbegin\n' in definition)=0 then raise exception '127 unexpected timestamp guard %',name; end if;
  execute replace(definition,E'\nbegin\n',E'\nbegin\n'||$body$
   if current_user='postgres' and to_jsonb(new)-array['created_by','owner_id']=to_jsonb(old)-array['created_by','owner_id'] then
    if (to_jsonb(old)->>'created_by' is not null and to_jsonb(new)->>'created_by' is null and public.m127_purging((to_jsonb(old)->>'created_by')::uuid))
    or (to_jsonb(old)->>'owner_id' is not null and to_jsonb(new)->>'owner_id' is null and public.m127_purging((to_jsonb(old)->>'owner_id')::uuid)) then return new; end if;
   end if;
  $body$);
 end loop;
end $$;

-- Existing role predicates also serve read-only SECURITY DEFINER RPCs.
-- Wrap their exact installed expressions, preserving roles/Library semantics.
do $$ declare name text; definition text; begin
 foreach name in array array['has_socrates_role','is_editor_or_admin','is_admin'] loop
  select pg_get_functiondef(to_regprocedure('public.'||name||'()')) into definition;
  if definition is null or position('select exists (' in definition)=0 then
   raise exception '127 unexpected role predicate %',name;
  end if;
  definition:=replace(definition,'select exists (','select public.account_is_active() and exists (');
  execute definition;
 end loop;
end $$;

-- NULL structured author attribution means Former Contributor. It never
-- modifies a revision body, snapshot, revision identity, timestamp or parent.
alter table public.question_related_concepts alter column created_by drop not null;
alter table public.question_additional_testing_angles alter column created_by drop not null;
alter table public.media_assets alter column created_by drop not null;
comment on column public.concept_versions.created_by is 'NULL author attribution is displayed as Former Contributor; revision content remains immutable.';
comment on column public.question_versions.created_by is 'NULL author attribution is displayed as Former Contributor; revision content remains immutable.';
comment on column public.article_versions.created_by is 'NULL author attribution is displayed as Former Contributor; revision content remains immutable.';

-- Narrow exceptions inside the original guards. No trigger disabling or
-- general-purpose immutable-history bypass is introduced.
do $$ declare name text; definition text; addition text; begin
 foreach name in array array['prevent_content_version_mutation','prevent_article_version_mutation','m112_asset_guard'] loop
  definition:=pg_get_functiondef(to_regprocedure('public.'||name||'()'));
  addition:=$body$
 if tg_op='UPDATE' and new.created_by is null and old.created_by is not null
 and to_jsonb(new)-'created_by'=to_jsonb(old)-'created_by'
 and public.m127_purging(old.created_by) then return new; end if;
 $body$;
  if name='m112_asset_guard' then addition:=addition||$body$
 if tg_op='DELETE' and old.scope='personal' and public.m127_purging(old.owner_id)
 and not exists(select 1 from storage.objects where bucket_id=old.bucket_id and name=old.object_name)
 and not exists(select 1 from public.media_version_references where asset_id=old.id)
 then return old; end if;
 $body$; end if;
  if position(E'\nbegin\n' in definition)=0 then raise exception '127 unexpected immutable guard %',name; end if;
  execute replace(definition,E'\nbegin\n',E'\nbegin\n'||addition);
 end loop;
end $$;

-- Storage can finish an already dispatched write after the browser disconnects.
-- Block known paths at its metadata boundary, including service-key uploads.
create function public.m127_storage_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if new.bucket_id='socrates-profile-photos' and split_part(new.name,'/',1) ~* '^[0-9a-f-]{36}$' then
  actor:=split_part(new.name,'/',1)::uuid;
 elsif new.owner_id ~* '^[0-9a-f-]{36}$' then actor:=new.owner_id::uuid;
 end if;
 perform public.m127_assert_writable(actor);
 if exists(select 1 from public.account_deletion_state where state<>'active'
 and object_hashes @> array[encode(extensions.digest(new.bucket_id||'/'||new.name,'sha256'),'hex')]) then
  raise exception 'Deleted account Storage destination' using errcode='42501';
 end if;
 return new;
end $$;
create trigger a127_storage_fence before insert or update on storage.objects
for each row execute function public.m127_storage_fence();

create function public.begin_account_deletion(p_user uuid,p_receipt_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.account_deletion_state; paths jsonb;
begin
 if p_receipt_hash is null or p_receipt_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid deletion receipt'; end if;
 select * into s from public.account_deletion_state where user_id=p_user for update;
 if not found or not exists(select 1 from auth.users where id=p_user) then raise exception 'Account unavailable'; end if;
 if s.state='complete' then raise exception 'Account already deleted'; end if;
 if s.state='pending' then
  update public.account_deletion_state set receipt_hash=p_receipt_hash where user_id=p_user;
  return;
 end if;
 if exists(select 1 from public.media_assets a join public.media_version_references v on v.asset_id=a.id
 where a.owner_id=p_user) then raise exception 'Personal media has official historical references; review required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'name',name) order by bucket,name),'[]') into paths from (
  select 'socrates-profile-photos'::text bucket,p_user::text||'/avatar' name
  union select bucket_id,object_name from public.media_assets where owner_id=p_user and scope='personal'
  union select 'socrates-content-media',case when o.operation_type='staging'
    then '_staging/'||o.library_id::text||'/'||o.parent_id::text||'/'||o.object_id::text
    else o.library_id::text||'/'||o.object_id::text end
   from public.media_service_operations o where o.actor_id=p_user and o.object_id is not null
   and (o.operation_type='staging' or not exists(select 1 from public.media_assets a where a.id=o.asset_id and a.scope='official'))
 ) x;
 -- Unknown/legacy Storage ownership must be classified rather than guessed.
 if exists(select 1 from storage.objects o where (o.owner=p_user or o.owner_id=p_user::text)
 and not exists(select 1 from jsonb_array_elements(paths) p where p->>'bucket'=o.bucket_id and p->>'name'=o.name))
 then raise exception 'Unclassified owned Storage object; ownership review required'; end if;
 update public.account_deletion_state set state='pending',receipt_hash=p_receipt_hash,
 requested_at=clock_timestamp(),objects=paths,object_hashes=array(
  select encode(extensions.digest((p->>'bucket')||'/'||(p->>'name'),'sha256'),'hex') from jsonb_array_elements(paths) p
 ) where user_id=p_user;
end $$;

create function public.account_deletion_status(p_receipt_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',user_id,'state',state,'objects',objects)
 from public.account_deletion_state where receipt_hash=p_receipt_hash and state<>'active'
$$;

-- Auth's FK cascades issue empty DELETE statements after the explicit purge.
-- There are no siblings to normalize in that case. Keep this trigger INVOKER
-- and its original owner instead of granting Auth access to other users' trees.
set local role socrates_migrator;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.normalize_topic_siblings_after_write()'::regprocedure);
 if position(E'\nbegin\n' in definition)=0 then raise exception '127 unexpected normalization guard'; end if;
 execute replace(definition,E'\nbegin\n',E'\nbegin\n'||$body$
  if tg_op='DELETE' then
   if not exists(select 1 from old_rows) then return null; end if;
  end if;
 $body$);
end $$;
set local role postgres;

create function public.m127_delete_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.account_deletion_state; r record;
begin
 select * into s from public.account_deletion_state where user_id=old.id for update;
 if s.state is distinct from 'pending' then raise exception 'Confirmed account deletion required'; end if;
 if exists(select 1 from storage.objects o where o.owner=old.id or o.owner_id=old.id::text
 or exists(select 1 from jsonb_array_elements(s.objects) p where p->>'bucket'=o.bucket_id and p->>'name'=o.name))
 then raise exception 'Storage cleanup must complete before deleting Auth'; end if;
 update public.account_deletion_state set purge_xid=pg_current_xact_id() where user_id=old.id;
 -- Existing Card/Topic guards still run under the departing owner's context.
 perform set_config('request.jwt.claim.sub',old.id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',old.id,'role','authenticated')::text,true);
 -- Clear exclusively owned learning evidence before deleting personal content.
 delete from public.study_response_submissions where user_id=old.id;
 delete from public.personal_review_attempts where user_id=old.id;
 delete from public.review_attempts where user_id=old.id;
 delete from public.study_sessions where user_id=old.id;
 delete from public.study_progress_resets where user_id=old.id;
 delete from public.content_media_placements where personal_card_id in (select id from public.personal_cards where owner_id=old.id)
 or personal_concept_id in (select id from public.personal_concepts where owner_id=old.id);
 delete from public.personal_cards where owner_id=old.id;
 delete from public.personal_concepts where owner_id=old.id;
 delete from public.personal_collections where owner_id=old.id;
 delete from public.personal_topic_official_placements where owner_id=old.id;
 delete from public.personal_topics where owner_id=old.id;
 -- Operational upload records are not immutable official revision history.
 delete from public.media_draft_leases where actor_id=old.id;
 delete from public.media_upload_sessions where actor_id=old.id;
 delete from public.media_service_operations where actor_id=old.id and parent_id is not null;
 delete from public.media_service_operations where actor_id=old.id;
 delete from public.media_service_operations where asset_id in (select id from public.media_assets where owner_id=old.id);
 delete from public.media_deletion_jobs where asset_id in (select id from public.media_assets where owner_id=old.id);
 delete from public.concept_media_drafts where author_id=old.id;
 delete from public.question_media_drafts where author_id=old.id;
 delete from public.media_assets where owner_id=old.id and scope='personal';
 -- Explicit allowlist: no catalog-driven deletion of unknown contributed data.
 for r in select * from (values
  ('article_category_placements','created_by'),('article_concepts','created_by'),('article_sources','created_by'),('article_tags','created_by'),('article_versions','created_by'),('articles','owner_id'),
  ('concept_aliases','created_by'),('concept_distinctions','created_by'),('concept_prerequisites','created_by'),('concept_prerequisites','updated_by'),('concept_relationships','created_by'),('concept_tags','created_by'),('concept_versions','created_by'),('concepts','created_by'),('content_source_notes','created_by'),
  ('learn_sections','created_by'),('learning_objects','created_by'),('library_group_libraries','created_by'),('library_groups','created_by'),('media_assets','created_by'),
  ('question_additional_testing_angles','created_by'),('question_related_concepts','created_by'),('question_sources','created_by'),('question_tags','created_by'),('question_versions','created_by'),('questions','created_by'),('sources','created_by'),('tags','created_by'),
  ('testing_angle_vocabulary','created_by'),('testing_angle_vocabulary','updated_by'),('user_libraries','assigned_by')
 ) x(table_name,column_name) loop
  execute format('update public.%I set %I=null where %I=$1',r.table_name,r.column_name,r.column_name) using old.id;
 end loop;
 -- Auth's existing CASCADE FKs remove all remaining learner-owned rows. Any
 -- unclassified restrictive FK fails the entire Auth/application transaction.
 return old;
end $$;
create trigger a127_delete_account before delete on auth.users
for each row execute function public.m127_delete_account();
create function public.m127_account_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.account_deletion_state set state='complete',completed_at=clock_timestamp(),objects='[]',purge_xid=null where user_id=old.id;
 return old;
end $$;
-- Deferred until the existing personal CASCADE actions have completed.
create constraint trigger z127_account_deleted after delete on auth.users
deferrable initially deferred for each row execute function public.m127_account_deleted();

do $$ declare r record; begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'm127_%' or p.proname in ('begin_account_deletion','account_deletion_status','account_is_active')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end $$;
grant execute on function public.account_is_active() to authenticated;
grant execute on function public.begin_account_deletion(uuid,text),public.account_deletion_status(text) to service_role;
commit;
