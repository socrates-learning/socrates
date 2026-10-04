-- Explicit current-subtree resets, never structural inheritance or eligibility.
-- Old session snapshots retain their released interpretation. New copies carry
-- one reset identity so multiple placements cannot multiply a weighting vote.
begin;

do $$ begin
 if current_user <> 'postgres' or to_regprocedure('public.m116_format(text)') is null
 or to_regprocedure('public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)') is not null then
  raise exception '117 requires postgres and the unchanged released through-116 schema';
 end if;
end $$;

alter table public.study_deck_node_preferences add column reset_source uuid;
set local role socrates_migrator;
alter table public.study_deck_personal_topic_preferences add column reset_source uuid;
reset role;
comment on column public.study_deck_node_preferences.reset_source is 'Current reset provenance only: deduplicate equivalent copied branch contributions; never selection or future inheritance.';
set local role socrates_migrator;
comment on column public.study_deck_personal_topic_preferences.reset_source is 'Current reset provenance only; no history, score or future inheritance.';
reset role;

-- The NOLOGIN/NOBYPASSRLS application owner receives only this operation's
-- reads, a deck lock, and official preference writes. No new role/membership.
grant execute on function public.has_socrates_role(),public.is_editor_or_admin() to socrates_migrator;
grant select on public.study_decks,public.library_nodes,public.personal_topics,
 public.personal_topic_official_placements,public.user_libraries,
 public.user_study_node_selections,public.study_deck_node_exclusions,
 public.user_study_concept_overrides,public.study_deck_node_preferences,
 public.study_deck_personal_topic_selections,public.study_deck_personal_collection_selections to socrates_migrator;
grant update(id) on public.study_decks to socrates_migrator;
grant insert,update on public.study_deck_node_preferences to socrates_migrator;
create policy m117_deck_read on public.study_decks for select to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_deck_lock on public.study_decks for update to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) with check(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_membership_read on public.user_libraries for select to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_nodes_read on public.library_nodes for select to socrates_migrator using(public.has_socrates_role() and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid and m.library_id=library_nodes.library_id)));
create policy m117_topics_read on public.personal_topics for select to socrates_migrator using(owner_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_placement_read on public.personal_topic_official_placements for select to socrates_migrator using(owner_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_selection_read on public.user_study_node_selections for select to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_exclusion_read on public.study_deck_node_exclusions for select to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_override_read on public.user_study_concept_overrides for select to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_personal_selection_read on public.study_deck_personal_topic_selections for select to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_collection_selection_read on public.study_deck_personal_collection_selections for select to socrates_migrator using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid);
create policy m117_preference_write on public.study_deck_node_preferences for all to socrates_migrator
 using(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) with check(user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid and public.has_socrates_role() and exists(
 select 1 from public.study_decks d where d.id=deck_id and d.user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid and d.library_id=study_deck_node_preferences.library_id and d.is_active
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid and m.library_id=d.library_id))));

-- Old browser writers cannot bypass expected-state checking. Selection's
-- existing default-50 trigger and authorized FK cascades remain unchanged.
revoke insert,update,delete on public.study_deck_node_preferences from authenticated;
set local role socrates_migrator;
revoke insert,update,delete on public.study_deck_personal_topic_preferences from authenticated;
revoke execute on function public.set_study_deck_personal_topic_preference(uuid,uuid,integer) from authenticated;

create function public.m117_topic_graph(p_library uuid,p_owner uuid)
returns table(group_key text,topic_id uuid,source text,parent_key text,ancestry text[],name text,sort_order integer)
language sql stable security invoker set search_path='' as $$
 with recursive graph as (
  select 'official:topic:'||n.id k,n.id,'official'::text s,
   case when n.parent_id is not null then 'official:topic:'||n.parent_id end parent,n.name,n.sort_order
  from public.library_nodes n where n.library_id=p_library
  union all
  select 'personal:topic:'||t.id,t.id,'personal',
   case when t.parent_id is not null then 'personal:topic:'||t.parent_id else 'official:topic:'||p.library_node_id end,t.name,t.sort_order
  from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=p_owner
  where t.owner_id=p_owner
 ), tree as (
  select g.*,array[g.k] path from graph g where g.s='official' and g.parent is null
  union all select g.*,t.path||g.k from tree t join graph g on g.parent=t.k where not g.k=any(t.path)
 ) select k,id,s,parent,path,name,sort_order from tree;
$$;

create function public.m117_preference_state(p_deck uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare d public.study_decks; u uuid:=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid; result jsonb;
begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501'; end if;
 select * into d from public.study_decks where id=p_deck and user_id=u and is_active
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=study_decks.library_id));
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 with recursive graph as materialized(select * from public.m117_topic_graph(d.library_id,u)),
 official_directives as (
  select 'official:topic:'||node_id key,true included from public.user_study_node_selections where deck_id=d.id and user_id=u
  union all select 'official:topic:'||node_id,false from public.study_deck_node_exclusions where deck_id=d.id and user_id=u
 ), official_state as (
  select g.*,coalesce(nearest.included,false) included from graph g
  left join lateral(select x.included from official_directives x where x.key=any(g.ancestry)
   order by array_position(g.ancestry,x.key) desc,x.included limit 1) nearest on true where g.source='official'
 ), official_seeds as (
  select g.*,p.reset_source,coalesce(p.new_mastery_balance,50) balance,
   exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=g.topic_id and s.user_id=u) selected
  from official_state g left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=g.topic_id and p.user_id=u
  where (g.included and p.reset_source is not null)
   or exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=g.topic_id and s.user_id=u)
 ), official_sources as (
  select g.topic_id,g.balance,g.selected,
   right(origin.key,36)::uuid origin_id,
   case when g.reset_source is null then g.group_key else 'reset:'||g.reset_source||':'||origin.key end source_key
  from official_seeds g
  cross join lateral(select coalesce(max(array_position(g.ancestry,'official:topic:'||s.node_id)),1) idx
   from public.user_study_node_selections s where s.deck_id=d.id and ('official:topic:'||s.node_id)=any(g.ancestry)) anchor
  cross join lateral(select coalesce(max(a.idx)+1,anchor.idx) idx
   from unnest(g.ancestry) with ordinality a(key,idx)
   left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=right(a.key,36)::uuid
   where a.idx>=anchor.idx and p.reset_source is distinct from g.reset_source) boundary
  cross join lateral(select case when g.reset_source is null then g.group_key else g.ancestry[boundary.idx] end key) origin
 ), personal_roots as (
  select s.personal_topic_id id,s.personal_topic_id origin,true included from public.study_deck_personal_topic_selections s where s.deck_id=d.id and s.user_id=u
  union all select s.personal_topic_id,s.personal_topic_id,false from public.study_deck_personal_topic_exclusions s where s.deck_id=d.id and s.user_id=u
 ), personal_walk as (
  select r.*,0 distance,array[r.id] visited from personal_roots r join public.personal_topics t on t.id=r.id and t.owner_id=u
  union all select t.id,w.origin,w.included,w.distance+1,w.visited||t.id from personal_walk w join public.personal_topics t on t.parent_id=w.id and t.owner_id=u where not t.id=any(w.visited)
 ), personal_effective as (
  select distinct on(id) id topic_id,origin source_topic_id,included is_included from personal_walk order by id,distance,included,origin
 ), personal_sources as (
  select g.topic_id,coalesce(p.new_mastery_balance,legacy.new_mastery_balance,50) balance,
   case when p.reset_source is not null then 'reset:'||p.reset_source else 'personal:topic:'||e.source_topic_id end source_key
  from graph g join personal_effective e on e.topic_id=g.topic_id and e.is_included
  left join public.study_deck_personal_topic_preferences p on p.deck_id=d.id and p.personal_topic_id=g.topic_id and p.reset_source is not null
  left join public.study_deck_personal_topic_preferences legacy on legacy.deck_id=d.id and legacy.personal_topic_id=e.source_topic_id
  where g.source='personal'
 ), values_by_topic as (
  select g.group_key,coalesce(own.balance,ancestor.balance,50) balance from official_state g
  left join official_sources own on own.topic_id=g.topic_id
  left join lateral(select s.balance from official_sources s where s.selected and ('official:topic:'||s.topic_id)=any(g.ancestry)
   order by array_position(g.ancestry,'official:topic:'||s.topic_id) desc limit 1) ancestor on true
  union all select g.group_key,coalesce(s.balance,p.new_mastery_balance,50) from graph g
  left join personal_sources s on s.topic_id=g.topic_id
  left join public.study_deck_personal_topic_preferences p on p.deck_id=d.id and p.personal_topic_id=g.topic_id
  where g.source='personal'
 ), revision_state as (
  select jsonb_build_object('deck',jsonb_build_array(d.id,d.user_id,d.library_id,d.is_active,d.cram_mode),
   'graph',(select coalesce(jsonb_agg(to_jsonb(g) order by group_key),'[]') from graph g),
   'official_preferences',(select coalesce(jsonb_agg(to_jsonb(p) order by library_node_id),'[]') from public.study_deck_node_preferences p where deck_id=d.id),
   'personal_preferences',(select coalesce(jsonb_agg(to_jsonb(p) order by personal_topic_id),'[]') from public.study_deck_personal_topic_preferences p where deck_id=d.id),
   'official_directives',(select coalesce(jsonb_agg(to_jsonb(x) order by key,included),'[]') from official_directives x),
   'overrides',(select coalesce(jsonb_agg(to_jsonb(x) order by concept_id),'[]') from public.user_study_concept_overrides x where deck_id=d.id),
   'personal_includes',(select coalesce(jsonb_agg(to_jsonb(x) order by personal_topic_id),'[]') from public.study_deck_personal_topic_selections x where deck_id=d.id),
   'personal_excludes',(select coalesce(jsonb_agg(to_jsonb(x) order by personal_topic_id),'[]') from public.study_deck_personal_topic_exclusions x where deck_id=d.id)) data
 ) select jsonb_build_object('version',117,'deck_id',d.id,'library_id',d.library_id,
  'revision',md5(revision_state.data::text),
  'values',(select coalesce(jsonb_object_agg(group_key,balance),'{}') from values_by_topic),
  'projection',jsonb_build_object('version',117,
   'official',(select coalesce(jsonb_object_agg(topic_id,jsonb_build_object('balance',balance,'source',source_key,'selected',selected,'origin',origin_id)),'{}') from official_sources),
   'personal',(select coalesce(jsonb_object_agg(topic_id,jsonb_build_object('balance',balance,'source',source_key)),'{}') from personal_sources)))
 into result from revision_state;
 return result;
end $$;

create function public.set_study_deck_topic_subtree_preference(p_deck_id uuid,p_library_id uuid,p_group_key text,p_balance integer,p_expected_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.study_decks; u uuid:=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid; before_state jsonb; root record; reset_id uuid:=gen_random_uuid();
begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501'; end if;
 if p_balance is null or p_balance not between 0 and 100 or p_expected_revision is null then raise exception 'Balance and confirmed revision required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and library_id=p_library_id and is_active
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=p_library_id)) for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 before_state:=public.m117_preference_state(d.id);
 if before_state->>'revision' is distinct from p_expected_revision then raise exception 'Deck settings or Topics changed. Reload Home before saving.' using errcode='40001'; end if;
 select * into root from public.m117_topic_graph(p_library_id,u) where group_key=p_group_key;
 if not found then raise exception 'Authorized Topic required' using errcode='42501'; end if;
 -- Only selected sources/descendants can initiate a reset. An ancestor reset
 -- also overwrites dormant preferences without altering their eligibility.
 if root.source='official' then
  if not (before_state->'projection'->'official' ? root.topic_id::text) and not exists(
   select 1 from public.m117_topic_graph(p_library_id,u) g join public.user_study_node_selections s on s.node_id=g.topic_id and s.deck_id=d.id
   where g.source='official' and g.group_key=any(root.ancestry)
   and not exists(select 1 from public.study_deck_node_exclusions x where x.deck_id=d.id and ('official:topic:'||x.node_id)=any(root.ancestry)
     and array_position(root.ancestry,'official:topic:'||x.node_id)>array_position(root.ancestry,g.group_key))) then
   raise exception 'Selected Topic required' using errcode='42501';
  end if;
 elsif not (before_state->'projection'->'personal' ? root.topic_id::text) then raise exception 'Selected Topic required' using errcode='42501'; end if;
 insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,reset_source)
 select d.id,u,d.library_id,g.topic_id,p_balance,reset_id from public.m117_topic_graph(p_library_id,u) g where g.source='official' and p_group_key=any(g.ancestry)
 on conflict(deck_id,library_node_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source;
 insert into public.study_deck_personal_topic_preferences(deck_id,user_id,library_id,personal_topic_id,new_mastery_balance,reset_source)
 select d.id,u,d.library_id,g.topic_id,p_balance,reset_id from public.m117_topic_graph(p_library_id,u) g where g.source='personal' and p_group_key=any(g.ancestry)
 on conflict(deck_id,personal_topic_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source;
 return public.m117_preference_state(d.id);
end $$;

revoke all on function public.m117_topic_graph(uuid,uuid),public.m117_preference_state(uuid),
 public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.m117_topic_graph(uuid,uuid),public.m117_preference_state(uuid) to postgres;
grant execute on function public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text) to authenticated;
reset role;

-- Exact released-function adaptations follow. Only preference projection and
-- contribution lookup change; owner, ACL, signatures and algorithms stay fixed.
set local role socrates_migrator;
do $adapt$
declare original text; changed text; catalog jsonb;
begin
 select pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' into original,catalog from pg_proc p where p.oid='m109_settings_snapshot(uuid)'::regprocedure;
 if md5(original)<>'cb6dcbfa05afcdfef75df429f174dbd4' then raise exception '117 unexpected baseline m109_settings_snapshot(uuid)'; end if;
 changed:=original;
 changed:=replace(changed,$before0$ return r;$before0$,$after0$ return r || jsonb_build_object('topic_preference_state',public.m117_preference_state(p_deck_id));$after0$);
 execute changed;
 if pg_get_functiondef('m109_settings_snapshot(uuid)'::regprocedure)<>changed or (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='m109_settings_snapshot(uuid)'::regprocedure) is distinct from catalog then raise exception '117 unexpected adaptation metadata'; end if;
end $adapt$;
reset role;
set local role postgres;
do $adapt$
declare original text; changed text; catalog jsonb;
begin
 select pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' into original,catalog from pg_proc p where p.oid='select_next_study_question_hardened(uuid,boolean)'::regprocedure;
 if md5(original)<>'b50b20c5aadd3ceac553c84c77a4db7f' then raise exception '117 unexpected baseline select_next_study_question_hardened(uuid,boolean)'; end if;
 changed:=original;
 changed:=replace(changed,$before0$  selected_node_ids as (
    select selected_node.value::uuid as selected_node_id
    from jsonb_array_elements_text(
      coalesce(
        target_session.selection_snapshot -> 'selected_node_ids',
        '[]'::jsonb
      )
    ) selected_node(value)
  ),
$before0$,$after0$  selected_node_ids as (
    select distinct (entry.value->>'origin')::uuid as selected_node_id
    from jsonb_each(coalesce((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official','{}'::jsonb)) entry
    where (target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->>'version' = '117'
    union all
    select selected_node.value::uuid
    from jsonb_array_elements_text(coalesce(target_session.selection_snapshot->'selected_node_ids','[]'::jsonb)) selected_node(value)
    where (target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->>'version' is distinct from '117'
  ),
$after0$);
 changed:=replace(changed,$before1$      coalesce(
        nullif(
          target_session.selection_snapshot
            -> 'node_preferences'
            ->> subtree.selected_node_id::text,$before1$,$after1$      coalesce(
        ((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->subtree.selected_node_id::text->>'balance')::numeric,
        nullif(
          target_session.selection_snapshot
            -> 'node_preferences'
            ->> subtree.selected_node_id::text,$after1$);
 changed:=replace(changed,$before2$    join selected_subtrees subtree
      on subtree.node_id = placement.library_node_id
  ),$before2$,$after2$    join selected_subtrees subtree
      on subtree.node_id = placement.library_node_id
    where (target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->>'version' is distinct from '117'
       or coalesce(((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->subtree.selected_node_id::text->>'selected')::boolean,false)
       or (target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->placement.library_node_id::text->>'origin' = subtree.selected_node_id::text
  ),$after2$);
 changed:=replace(changed,$before3$    left join most_specific_selected_nodes specific
      on specific.concept_id = eligible.concept_id$before3$,$after3$    left join (
      select distinct concept_id,branch_balance,
        coalesce((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->selected_node_id::text->>'source',selected_node_id::text) source_key
      from most_specific_selected_nodes
    ) specific on specific.concept_id = eligible.concept_id$after3$);
 execute changed;
 if pg_get_functiondef('select_next_study_question_hardened(uuid,boolean)'::regprocedure)<>changed or (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='select_next_study_question_hardened(uuid,boolean)'::regprocedure) is distinct from catalog then raise exception '117 unexpected adaptation metadata'; end if;
end $adapt$;
reset role;
set local role socrates_migrator;
do $adapt$
declare original text; changed text; catalog jsonb;
begin
 select pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' into original,catalog from pg_proc p where p.oid='m109_card_balance(uuid,jsonb)'::regprocedure;
 if md5(original)<>'5b2112e2f8104420f126d566157566a6' then raise exception '117 unexpected baseline m109_card_balance(uuid,jsonb)'; end if;
 changed:=original;
 changed:=replace(changed,$before0$coalesce((p_settings->'topic_preferences'->>(p_settings->'effective_topic_sources'->>pc.topic_id::text))::double precision,50) balance$before0$,$after0$coalesce((p_settings#>>array['topic_preference_state','projection','personal',pc.topic_id::text,'balance'])::double precision,(p_settings->'topic_preferences'->>(p_settings->'effective_topic_sources'->>pc.topic_id::text))::double precision,50) balance$after0$);
 execute changed;
 if pg_get_functiondef('m109_card_balance(uuid,jsonb)'::regprocedure)<>changed or (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='m109_card_balance(uuid,jsonb)'::regprocedure) is distinct from catalog then raise exception '117 unexpected adaptation metadata'; end if;
end $adapt$;
reset role;
set local role socrates_migrator;
do $adapt$
declare original text; changed text; catalog jsonb;
begin
 select pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' into original,catalog from pg_proc p where p.oid='m111_card_balance(uuid,jsonb,jsonb)'::regprocedure;
 if md5(original)<>'bc840ec327c1a2f4b844eb90beb636cc' then raise exception '117 unexpected baseline m111_card_balance(uuid,jsonb,jsonb)'; end if;
 changed:=original;
 changed:=replace(changed,$before0$select a.id from ancestors a where p_snapshot->'selected_node_ids' ? a.id::text order by a.distance limit 1$before0$,$after0$select a.id from ancestors a where p_snapshot->'selected_node_ids' ? a.id::text or (a.distance=0 and p_settings#>'{topic_preference_state,projection,official}' ? a.id::text) order by a.distance limit 1$after0$);
 changed:=replace(changed,$before1$coalesce((p_snapshot->'node_preferences'->>s.id::text)::double precision,50) balance$before1$,$after1$coalesce((p_settings#>>array['topic_preference_state','projection','official',s.id::text,'balance'])::double precision,(p_snapshot->'node_preferences'->>s.id::text)::double precision,50) balance$after1$);
 changed:=replace(changed,$before2$coalesce((p_settings->'topic_preferences'->>(p_settings->'effective_topic_sources'->>c.personal_topic_id::text))::double precision,50)$before2$,$after2$coalesce((p_settings#>>array['topic_preference_state','projection','personal',c.personal_topic_id::text,'balance'])::double precision,(p_settings->'topic_preferences'->>(p_settings->'effective_topic_sources'->>c.personal_topic_id::text))::double precision,50)$after2$);
 execute changed;
 if pg_get_functiondef('m111_card_balance(uuid,jsonb,jsonb)'::regprocedure)<>changed or (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='m111_card_balance(uuid,jsonb,jsonb)'::regprocedure) is distinct from catalog then raise exception '117 unexpected adaptation metadata'; end if;
end $adapt$;
reset role;

notify pgrst, 'reload schema';
commit;
