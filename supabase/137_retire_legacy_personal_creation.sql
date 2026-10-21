-- Retire new legacy personal content without changing historical read/edit/delete.
-- Local candidate. Requires explicit authorization before Production application.
begin;
set local search_path = public, pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare table_name text;
begin
 if md5(pg_get_functiondef('public.create_personal_concept_overlay(uuid,text,text,uuid,uuid,text)'::regprocedure)) <> '7bbc1968e657bf9d9afa601517e07842' then
  raise exception '137: overlay creation contract differs from the approved baseline';
 end if;
 if to_regprocedure('public.is_admin()') is null
    or to_regprocedure('public.is_editor_or_admin()') is null
    or not has_function_privilege('authenticated','public.is_admin()','EXECUTE')
    or not has_function_privilege('authenticated','public.is_editor_or_admin()','EXECUTE') then
  raise exception '137: existing account-aware role helpers are required';
 end if;
 foreach table_name in array array['personal_concepts','personal_collections','personal_cards'] loop
  if not exists(select 1 from pg_class where oid=('public.'||table_name)::regclass and relrowsecurity)
     or not exists(select 1 from pg_policy where polrelid=('public.'||table_name)::regclass
       and polcmd='a' and polpermissive
       and pg_get_expr(polwithcheck,polrelid)='((owner_id = ( SELECT auth.uid() AS uid)) AND has_socrates_role())')
     or not exists(select 1 from pg_policy where polrelid=('public.'||table_name)::regclass
       and polname='account_deletion_fence' and polcmd='*' and not polpermissive
       and pg_get_expr(polwithcheck,polrelid)='( SELECT account_is_active() AS account_is_active)') then
   raise exception '137: existing ownership, RLS, and account activity protections required for %',table_name;
  end if;
 end loop;
 if not exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass
    and polname='personal_cards_admin_insert_restriction' and polcmd='a' and not polpermissive)
    or to_regclass('public.personal_card_media_saves') is null then
  raise exception '137: Migrations 135 and 136 are required';
 end if;
end $preflight$;

-- These restrictions intersect with the existing owner, account, and Library
-- checks. UPDATE, SELECT, DELETE, trusted maintenance, and recovery stay intact.
-- The legacy Editor exception is intentional; its retirement is a separate task.
create policy personal_concepts_legacy_insert_restriction
 on public.personal_concepts as restrictive for insert to authenticated
 with check ((select public.is_editor_or_admin() and not public.is_admin()));
create policy personal_collections_legacy_insert_restriction
 on public.personal_collections as restrictive for insert to authenticated
 with check ((select public.is_editor_or_admin() and not public.is_admin()));
create policy personal_cards_legacy_insert_restriction
 on public.personal_cards as restrictive for insert to authenticated
 with check (concept_id is null or (select public.is_editor_or_admin() and not public.is_admin()));

-- This existing SECURITY DEFINER writer bypasses table RLS. Restrict its create
-- branch explicitly; preserve every original ownership/Library/validation check.
CREATE OR REPLACE FUNCTION public.create_personal_concept_overlay(p_personal_topic_id uuid, p_name text, p_description text, p_library_node_id uuid, p_official_concept_id uuid DEFAULT NULL::uuid, p_source_reference text DEFAULT NULL::text)
 RETURNS TABLE(personal_concept_id uuid, overlay_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_library_id uuid;
  created_concept_id uuid;
  created_overlay_id uuid;
begin
  if caller_id is null or not public.has_socrates_role() then
    raise exception 'Approved Socrates access is required to create personal material';
  end if;

  -- New legacy records are retired for Admins and Learners. Preserve the
  -- separately managed legacy Editor authorization without trusting JWT roles.
  if not public.is_editor_or_admin() or public.is_admin() then
    raise exception using errcode = '42501',
      message = 'New personal Concepts are retired. Create a standalone Card in Creator Studio.';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Personal Concept name is required';
  end if;

  if char_length(btrim(p_name)) > 160 then
    raise exception 'Personal Concept name must be 160 characters or fewer';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Personal Concept description must be 1000 characters or fewer';
  end if;

  if not exists (
    select 1
    from public.personal_topics topic
    where topic.id = p_personal_topic_id
      and topic.owner_id = caller_id
  ) then
    raise exception 'Choose one of your personal Topics';
  end if;

  select node.library_id
  into target_library_id
  from public.library_nodes node
  join public.libraries library on library.id = node.library_id
  where node.id = p_library_node_id
    and library.status = 'active';

  if target_library_id is null then
    raise exception 'Active official Topic placement was not found';
  end if;

  if not public.is_editor_or_admin()
     and not exists (
       select 1
       from public.user_libraries membership
       where membership.user_id = caller_id
         and membership.library_id = target_library_id
     ) then
    raise exception 'Not authorized for the target Library';
  end if;

  if p_official_concept_id is not null
     and not exists (
       select 1
       from public.concepts concept
       join public.concept_placements placement
         on placement.concept_id = concept.id
        and placement.library_node_id = p_library_node_id
       where concept.id = p_official_concept_id
         and concept.status = 'published'
     ) then
    raise exception 'Official Concept placement must exist and be published';
  end if;

  insert into public.personal_concepts (
    owner_id,
    topic_id,
    name,
    description,
    source_reference
  ) values (
    caller_id,
    p_personal_topic_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_source_reference, '')), '')
  )
  returning id into created_concept_id;

  insert into public.personal_concept_official_placements (
    owner_id,
    personal_concept_id,
    library_node_id,
    official_concept_id
  ) values (
    caller_id,
    created_concept_id,
    p_library_node_id,
    p_official_concept_id
  )
  returning id into created_overlay_id;

  return query select created_concept_id, created_overlay_id;
end;
$function$
;

-- No existing rows, memberships, media, history, or permissions are rewritten.
commit;
