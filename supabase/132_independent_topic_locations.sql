-- Independent official Topic locations. Canonical educational identities and
-- learning evidence are not copied, rewritten, or deleted by this migration.
begin;
select pg_catalog.pg_advisory_xact_lock(104,20260927);

do $$ begin
 if to_regprocedure('public.m122_effective_nodes(uuid)') is null
 or to_regprocedure('public.get_study_advisor(uuid)') is null
 or to_regprocedure('public.delete_admin_inbox_message(uuid,uuid)') is null then
  raise exception 'Independent locations require the released application through Migration 131.';
 end if;
end $$;

do $baseline$ declare f record; begin
 for f in select * from jsonb_to_recordset($contracts$[{"signature":"get_home_study_bootstrap(uuid,uuid)","md5":"852230efabc9bf94da3001f3966e3c5c"},{"signature":"get_library_learner_progress(uuid)","md5":"a1e544b792269bcdb255bbdbbebe9911"},{"signature":"get_official_topic_graph(uuid)","md5":"37e8af336a94cc9b25d7776d078a08b0"},{"signature":"get_study_advisor(uuid)","md5":"4d10fb7fc83068d3739f7b80b1e8f0e4"},{"signature":"get_study_goals(uuid)","md5":"d456431d1c863006981cf40b21a2be41"},{"signature":"m122_preference_projection(uuid,jsonb)","md5":"bab7ae3faefddb13000abc5545c40f66"},{"signature":"m122_effective_nodes(uuid)","md5":"13dfaf3c0185ce80ed4a0b523e7bfcb0"},{"signature":"m123_goal_items(uuid)","md5":"8fc763d73b093db2bb6fed7337e65e2d"},{"signature":"set_study_deck_node_selection(uuid,uuid,boolean)","md5":"3413397788da5b62e7d74b49b61ca952"}]$contracts$::jsonb) as x(signature text,md5 text) loop
 if md5(pg_get_functiondef(('public.'||f.signature)::regprocedure))<>f.md5 then raise exception 'Migration 132 baseline mismatch: %',f.signature; end if;
 end loop;
end $baseline$;

create table public.official_topic_locations (
 id uuid primary key default gen_random_uuid(),
 library_id uuid not null references public.libraries(id) on delete cascade,
 topic_id uuid not null,
 parent_location_id uuid,
 sort_order integer not null default 0 check(sort_order>=0),
 is_original boolean not null default false,
 legacy_occurrence_key text,
 created_at timestamptz not null default now(),
 unique(id,library_id),
 unique(parent_location_id,topic_id) deferrable initially deferred,
 foreign key(topic_id,library_id) references public.library_nodes(id,library_id) on delete cascade,
 foreign key(parent_location_id,library_id) references public.official_topic_locations(id,library_id) deferrable initially deferred,
 check(id is distinct from parent_location_id)
);
create unique index official_topic_locations_root on public.official_topic_locations(library_id) where parent_location_id is null;
create unique index official_topic_locations_original on public.official_topic_locations(topic_id) where is_original;
create index official_topic_locations_parent on public.official_topic_locations(parent_location_id,sort_order,id);
create index official_topic_locations_topic on public.official_topic_locations(library_id,topic_id);
alter table public.official_topic_locations enable row level security;
revoke all on public.official_topic_locations from public,anon,authenticated,service_role;
grant select on public.official_topic_locations to authenticated;
create policy official_topic_locations_read on public.official_topic_locations for select to authenticated using(
 public.has_socrates_role() and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m
 where m.user_id=(select auth.uid()) and m.library_id=official_topic_locations.library_id)));

-- Materialize existing visible locations, not canonical content. There is no
-- depth cutoff or truncation. The primary path keeps its canonical UUID as its
-- location UUID; other root-to-row paths get deterministic, stable UUIDs.
with recursive paths as (
 select n.id,n.library_id,n.id topic_id,null::uuid parent_location_id,n.sort_order,true is_original,
  'primary:'||n.id legacy_key,array[n.id] visited from public.library_nodes n where n.parent_id is null
 union all
 select case when p.is_original and e.kind='primary' then e.topic_id
  else md5('socrates-location-132:'||p.library_id||':'||p.legacy_key||'/'||e.edge_key)::uuid end,
  p.library_id,e.topic_id,p.id,e.sort_order,p.is_original and e.kind='primary',
  p.legacy_key||'/'||e.edge_key,p.visited||e.topic_id
 from paths p cross join lateral public.m122_edges(p.library_id) e
 where e.parent_id=p.topic_id and not e.topic_id=any(p.visited)
)
insert into public.official_topic_locations(id,library_id,topic_id,parent_location_id,sort_order,is_original,legacy_occurrence_key)
select id,library_id,topic_id,parent_location_id,coalesce(sort_order,0),is_original,legacy_key from paths;

create table public.study_deck_location_selections (
 deck_id uuid not null references public.study_decks(id) on delete cascade,
 location_id uuid not null references public.official_topic_locations(id) on delete cascade,
 included boolean not null,
 primary key(deck_id,location_id)
);
alter table public.study_deck_location_selections enable row level security;
revoke all on public.study_deck_location_selections from public,anon,authenticated,service_role;
grant select on public.study_deck_location_selections to authenticated;
create policy study_deck_location_selections_owner on public.study_deck_location_selections for select to authenticated using(
 public.has_socrates_role() and exists(select 1 from public.study_decks d where d.id=deck_id and d.user_id=(select auth.uid())
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=d.user_id and m.library_id=d.library_id))));
insert into public.study_deck_location_selections
 select s.deck_id,l.id,true from public.user_study_node_selections s join public.official_topic_locations l
 on l.topic_id=s.node_id and l.library_id=s.library_id;
-- Migration 122 deliberately ignored exclusions on shared canonical Topics.
-- Preserve that historical selection on installation, then allow explicit
-- per-location exclusions through the new, revision-checked operation.
insert into public.study_deck_location_selections
 select s.deck_id,l.id,false from public.study_deck_node_exclusions s join public.official_topic_locations l
 on l.topic_id=s.node_id and l.library_id=s.library_id
 where not exists(select 1 from public.m122_shared_nodes(s.library_id) x where x.topic_id=s.node_id)
 on conflict(deck_id,location_id) do update set included=false;

create function public.m132_location_closure(p_library uuid)
 returns table(ancestor_id uuid,location_id uuid,topic_id uuid,distance integer)
 language sql stable security definer set search_path='' as $$
 with recursive walk as (
 select l.id ancestor_id,l.id location_id,l.topic_id,0 distance from public.official_topic_locations l where l.library_id=p_library
 union all select w.ancestor_id,c.id,c.topic_id,w.distance+1 from walk w
 join public.official_topic_locations c on c.parent_location_id=w.location_id and c.library_id=p_library
 ) select * from walk;
$$;
create function public.m132_location_states(p_deck uuid)
 returns table(location_id uuid,topic_id uuid,included boolean,source_location_id uuid,distance integer,direct boolean)
 language sql stable security definer set search_path='' as $$
 with recursive tree as (
 select l.id,l.topic_id,coalesce(s.included,false) included,
  case when s.location_id is not null then l.id end origin,0 distance,s.location_id is not null direct
 from public.study_decks d join public.official_topic_locations l on l.library_id=d.library_id and l.parent_location_id is null
 left join public.study_deck_location_selections s on s.deck_id=d.id and s.location_id=l.id where d.id=p_deck
 union all select c.id,c.topic_id,coalesce(s.included,t.included),case when s.location_id is not null then c.id else t.origin end,
 case when s.location_id is not null then 0 else t.distance+1 end,s.location_id is not null
 from tree t join public.official_topic_locations c on c.parent_location_id=t.id
 left join public.study_deck_location_selections s on s.deck_id=p_deck and s.location_id=c.id
 ) select * from tree;
$$;
create function public.m132_graph_revision(p_library uuid) returns text
 language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_object('nodes',(select jsonb_agg(to_jsonb(n) order by n.id) from public.library_nodes n where n.library_id=p_library),
 'locations',(select jsonb_agg(to_jsonb(l) order by l.id) from public.official_topic_locations l where l.library_id=p_library))::text);
$$;
create function public.m132_check_locations(p_library uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.library_nodes n where n.library_id=p_library and not exists(
  select 1 from public.official_topic_locations l where l.topic_id=n.id and l.is_original)) then
  raise exception 'Every canonical Topic must retain an original location.' using errcode='23514'; end if;
 if exists(select 1 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id
  where l.library_id=p_library and (l.parent_location_id is null) is distinct from (n.parent_id is null)) then
  raise exception 'The Library root cannot be duplicated or reparented.' using errcode='23514'; end if;
 if exists(select 1 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id
  where l.library_id=p_library group by l.parent_location_id,lower(btrim(n.name)) having count(*)>1) then
  raise exception 'A location already has a child with this name.' using errcode='23505'; end if;
 if exists(with recursive walk as (
  select l.id,array[l.id] ids,array[l.topic_id] topics,false cycle from public.official_topic_locations l where l.library_id=p_library and l.parent_location_id is null
  union all select c.id,w.ids||c.id,w.topics||c.topic_id,c.id=any(w.ids) or c.topic_id=any(w.topics)
  from walk w join public.official_topic_locations c on c.parent_location_id=w.id where not w.cycle
 ) select 1 from public.official_topic_locations l where l.library_id=p_library and not exists(select 1 from walk w where w.id=l.id and not w.cycle)) then
  raise exception 'A Topic cannot contain itself, a cycle, or unreachable locations.' using errcode='23514'; end if;
end $$;
create function public.m132_location_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.m132_check_locations(coalesce(new.library_id,old.library_id)); return null; end $$;
create constraint trigger m132_location_integrity after insert or update or delete on public.official_topic_locations
 deferrable initially deferred for each row execute function public.m132_location_guard();
create constraint trigger m132_canonical_location_integrity after insert or update or delete on public.library_nodes
 deferrable initially deferred for each row execute function public.m132_location_guard();
create trigger m132_structure_lock before insert or update or delete on public.official_topic_locations
 for each statement execute function public.lock_topic_structure_before_write();
create trigger a127_write_fence before insert or update or delete on public.official_topic_locations for each row execute function public.m127_write_fence();

create or replace function public.get_official_topic_graph(p_library_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 perform public.m122_require_library(p_library_id);
 return jsonb_build_object('version',132,'library_id',p_library_id,'revision',public.m132_graph_revision(p_library_id),
 'root_id',(select id from public.library_nodes where library_id=p_library_id and parent_id is null),
 'nodes',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from public.library_nodes n where n.library_id=p_library_id),'[]'),
 'edges',coalesce((select jsonb_agg(to_jsonb(e) order by e.edge_key) from public.m122_edges(p_library_id) e),'[]'),
 'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.official_topic_locations l where l.library_id=p_library_id),'[]'));
end $$;

create function public.m132_require_revision(p_library uuid,p_revision text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 perform public.m122_require_library(p_library,true);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 if p_revision is null or public.m132_graph_revision(p_library) is distinct from p_revision then
  raise exception 'The Topic Tree changed. Reload before trying again.' using errcode='PT409'; end if;
end $$;

-- One transaction for all affected locations, with a gesture-start revision.
-- Scope is mandatory even when only one parent location exists.
create function public.change_official_topic_location(p_library_id uuid,p_location_id uuid,p_destination_id uuid,
 p_action text,p_scope text,p_include_children boolean,p_before_id uuid,p_expected_revision text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare src public.official_topic_locations; dest public.official_topic_locations; parent_topic uuid;
 targets uuid[]; sources uuid[]; removed uuid[]; target uuid; current_source uuid; copied uuid; item record; mapping jsonb;
 move_pairs jsonb; destination_path uuid[]; source_parent uuid; step uuid; paired_destination uuid;
begin
 perform public.m132_require_revision(p_library_id,p_expected_revision);
 if p_action is null or p_action not in ('move','duplicate','remove') or p_scope is null or p_scope not in ('this','all')
 or p_include_children is null then raise exception 'Choose an operation and explicit location scope.' using errcode='22023'; end if;
 select * into src from public.official_topic_locations where id=p_location_id and library_id=p_library_id;
 if src.id is null or src.parent_location_id is null then raise exception 'Select a non-root location.' using errcode='22023'; end if;
 select topic_id into parent_topic from public.official_topic_locations where id=src.parent_location_id;
 select array_agg(l.id order by l.id) into sources from public.official_topic_locations l join public.official_topic_locations p on p.id=l.parent_location_id
 where l.topic_id=src.topic_id and (l.id=src.id or (p_scope='all' and p.topic_id=parent_topic));
 if p_action='remove' then
  select array_agg(distinct c.location_id) into removed from public.m132_location_closure(p_library_id) c where c.ancestor_id=any(sources);
  if exists(select 1 from public.official_topic_locations l where l.id=any(removed) and not exists(
   select 1 from public.official_topic_locations surviving where surviving.topic_id=l.topic_id and not surviving.id=any(removed))) then
   raise exception 'This would remove the final location of a Topic or descendant. Move it to a surviving location first; content will not be deleted.' using errcode='23514'; end if;
  -- Transfer the personal-content anchor before removing the old location.
  for item in select topic_id from public.official_topic_locations where id=any(removed) and is_original loop
   update public.official_topic_locations set is_original=false where topic_id=item.topic_id and is_original;
   update public.official_topic_locations set is_original=true where id=(select id from public.official_topic_locations where topic_id=item.topic_id and not id=any(removed) order by id limit 1);
  end loop;
  delete from public.official_topic_locations where id=any(removed);
 else
  select * into dest from public.official_topic_locations where id=p_destination_id and library_id=p_library_id;
  if dest.id is null then raise exception 'Destination must belong to this Library.' using errcode='42501'; end if;
  if p_before_id is not null and not exists(select 1 from public.official_topic_locations where id=p_before_id and parent_location_id=dest.id) then
   raise exception 'The destination order changed.' using errcode='PT409'; end if;
  select array_agg(id order by id) into targets from public.official_topic_locations
   where id=dest.id or (p_scope='all' and topic_id=dest.topic_id);
  move_pairs:=jsonb_build_object(dest.id,src.id);
  if p_action='move' and p_scope='all' then
   if parent_topic=dest.topic_id then
    -- Reorder the same child in each shared parent, preserving divergent children.
    select jsonb_object_agg(p.id,l.id) into move_pairs from public.official_topic_locations p
     join public.official_topic_locations l on l.parent_location_id=p.id and l.topic_id=src.topic_id
     where p.id=any(targets);
   else
    -- A destination inside the source parent has an explicit structural counterpart
    -- at every shared parent. Match its canonical path, never arbitrary row order.
    with recursive ancestry as (
     select dest.id id,dest.parent_location_id parent_id,array[dest.topic_id] path
     union all select p.id,p.parent_location_id,p.topic_id||a.path from ancestry a
      join public.official_topic_locations p on p.id=a.parent_id where a.id<>src.parent_location_id
    ) select path[2:cardinality(path)] into destination_path from ancestry where id=src.parent_location_id;
    if destination_path is not null then
     move_pairs:='{}';
     foreach current_source in array sources loop
      select parent_location_id into source_parent from public.official_topic_locations where id=current_source;
      paired_destination:=source_parent;
      foreach step in array destination_path loop
       select id into paired_destination from public.official_topic_locations where parent_location_id=paired_destination and topic_id=step;
       if paired_destination is null then raise exception 'A shared parent lacks this destination path. Choose This Location.' using errcode='22023'; end if;
      end loop;
      move_pairs:=move_pairs||jsonb_build_object(paired_destination,current_source);
     end loop;
     select array_agg(key::uuid) into targets from jsonb_each(move_pairs);
    elsif cardinality(sources)>1 or cardinality(targets)>1 then
     raise exception 'These locations have no unambiguous matching destination. Move each location explicitly; no child structure has changed.' using errcode='22023';
    end if;
   end if;
  end if;
  foreach target in array targets loop
   current_source:=case when p_action='move' then (move_pairs->>target::text)::uuid else src.id end;
   if current_source is null then raise exception 'A shared parent has no matching child. Choose This Location.' using errcode='22023'; end if;
   if exists(select 1 from public.m132_location_closure(p_library_id) c where c.ancestor_id=current_source and c.location_id=target) then
    raise exception 'A Topic cannot be placed within itself.' using errcode='23514'; end if;
   if p_action='move' then
    update public.official_topic_locations set parent_location_id=target where id=current_source;
    copied:=current_source;
   else
    mapping:='{}'; copied:=null;
    for item in select l.*,c.distance from public.m132_location_closure(p_library_id) c
     join public.official_topic_locations l on l.id=c.location_id
     where c.ancestor_id=src.id and (p_include_children or c.distance=0) order by c.distance,l.sort_order,l.id loop
     current_source:=gen_random_uuid();
     insert into public.official_topic_locations(id,library_id,topic_id,parent_location_id,sort_order)
      values(current_source,p_library_id,item.topic_id,case when item.id=src.id then target else (mapping->>item.parent_location_id::text)::uuid end,item.sort_order);
     mapping:=mapping||jsonb_build_object(item.id,current_source);
     if copied is null then copied:=current_source; end if;
    end loop;
   end if;
   -- The before anchor is matched by canonical child in each explicitly selected
   -- parent location. Divergent missing anchors are conflicts, never guesses.
   if p_before_id is not null and target<>dest.id and not exists(select 1 from public.official_topic_locations l
    where l.parent_location_id=target and l.topic_id=(select topic_id from public.official_topic_locations where id=p_before_id)) then
    raise exception 'A shared location lacks the chosen ordering anchor. Choose This Location.' using errcode='22023'; end if;
   with siblings as (
    select l.id,row_number() over(order by l.sort_order,l.id)*2 position from public.official_topic_locations l where l.parent_location_id=target and l.id<>copied
   ), anchor as (select coalesce((select s.position from siblings s join public.official_topic_locations l on l.id=s.id
    where l.topic_id=(select topic_id from public.official_topic_locations where id=p_before_id)),(select coalesce(max(position),0)+2 from siblings))-1 position),
   ordered as (select * from siblings union all select copied,position from anchor), ranks as(select id,row_number() over(order by position,id)-1 n from ordered)
   update public.official_topic_locations l set sort_order=r.n from ranks r where l.id=r.id;
  end loop;
 end if;
 perform public.m132_check_locations(p_library_id);
 return public.get_official_topic_graph(p_library_id);
end $$;

create function public.m132_insert_canonical_location() returns trigger language plpgsql security definer set search_path='' as $$
declare parent_id uuid;
begin
 select id into parent_id from public.official_topic_locations where topic_id=new.parent_id and is_original;
 insert into public.official_topic_locations(id,library_id,topic_id,parent_location_id,sort_order,is_original)
 values(new.id,new.library_id,new.id,parent_id,coalesce(new.sort_order,0),true);
 return new;
end $$;
create trigger m132_new_canonical_location after insert on public.library_nodes for each row execute function public.m132_insert_canonical_location();

create function public.create_official_topic_at_location(p_library_id uuid,p_parent_location_id uuid,p_name text,p_scope text,p_expected_revision text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare parent public.official_topic_locations; node_id uuid; target record;
begin
 perform public.m132_require_revision(p_library_id,p_expected_revision);
 select * into parent from public.official_topic_locations where id=p_parent_location_id and library_id=p_library_id;
 if parent.id is null or p_scope is null or p_scope not in ('this','all') or p_name is null or length(btrim(p_name)) not between 1 and 200 then
  raise exception 'Choose an authorized parent, name, and explicit scope.' using errcode='22023'; end if;
 insert into public.library_nodes(library_id,parent_id,name,node_type,sort_order)
 values(p_library_id,parent.topic_id,btrim(p_name),'topic',0) returning id into node_id;
 update public.official_topic_locations set parent_location_id=parent.id,sort_order=(select coalesce(max(sort_order)+1,0) from public.official_topic_locations where parent_location_id=parent.id) where id=node_id;
 if p_scope='all' then
  for target in select id from public.official_topic_locations where topic_id=parent.topic_id and id<>parent.id loop
   insert into public.official_topic_locations(library_id,topic_id,parent_location_id,sort_order) values(p_library_id,node_id,target.id,
    (select coalesce(max(sort_order)+1,0) from public.official_topic_locations where parent_location_id=target.id));
  end loop;
 end if;
 perform public.m132_check_locations(p_library_id);
 return jsonb_build_object('topic_id',node_id,'location_id',node_id,'graph',public.get_official_topic_graph(p_library_id));
end $$;

set local role socrates_migrator;
create or replace function public.m122_effective_nodes(p_deck uuid)
 returns table(node_id uuid,source_node_id uuid,source_state text,source_distance integer)
 language sql stable security invoker set search_path='' as $$
 select distinct on(s.topic_id) s.topic_id,origin.topic_id,'included'::text,s.distance
 from public.m132_location_states(p_deck) s join public.official_topic_locations origin on origin.id=s.source_location_id
 where s.included order by s.topic_id,s.distance,s.source_location_id;
$$;
set local role postgres;
create function public.m132_selection_snapshot(p_deck uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',132,'graph_revision',public.m132_graph_revision(d.library_id),
 'states',coalesce((select jsonb_agg(to_jsonb(s) order by s.location_id) from public.m132_location_states(d.id) s),'[]'))
 from public.study_decks d where d.id=p_deck;
$$;
create function public.set_study_deck_location_selection(p_deck_id uuid,p_location_id uuid,p_should_include boolean,p_expected_revision text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.study_decks; l public.official_topic_locations; u uuid:=auth.uid();
begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved learner required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and is_active for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 perform public.m123_require_library(d.library_id);
 select * into l from public.official_topic_locations where id=p_location_id and library_id=d.library_id;
 if l.id is null or p_should_include is null then raise exception 'Authorized location required' using errcode='42501'; end if;
 if public.m132_graph_revision(d.library_id) is distinct from p_expected_revision then raise exception 'Topic locations changed. Reload Home.' using errcode='PT409'; end if;
 delete from public.study_deck_location_selections where deck_id=d.id and location_id in(
  select location_id from public.m132_location_closure(d.library_id) where ancestor_id=l.id);
 insert into public.study_deck_location_selections values(d.id,l.id,p_should_include);
 -- Compatibility source rows carry canonical balances, not eligibility. The
 -- resolver above is the single authority for selected descendant locations.
 delete from public.user_study_node_selections where deck_id=d.id;
 delete from public.study_deck_node_exclusions where deck_id=d.id;
 insert into public.user_study_node_selections(deck_id,user_id,library_id,node_id)
 select distinct d.id,u,d.library_id,p.topic_id from public.study_deck_location_selections s join public.official_topic_locations p on p.id=s.location_id where s.deck_id=d.id and s.included;
 return jsonb_build_object('selected_node_ids',coalesce((select jsonb_agg(node_id) from public.user_study_node_selections where deck_id=d.id),'[]'),
 'excluded_node_ids','[]'::jsonb,'location_selection',public.m132_selection_snapshot(d.id));
end $$;

-- Function updates, guards, grants, and verification are appended below.

create function public.m132_topic_closure(p_library uuid) returns table(ancestor_id uuid,topic_id uuid)
 language sql stable security definer set search_path='' as $$
 select distinct a.topic_id,c.topic_id from public.m132_location_closure(p_library) c
 join public.official_topic_locations a on a.id=c.ancestor_id;
$$;

alter table public.study_goals add column official_location_ids uuid[] not null default '{}';
update public.study_goals g set official_location_ids=coalesce((select array_agg(l.id order by l.id)
 from public.official_topic_locations l where l.library_id=g.library_id and l.topic_id=any(g.official_topic_ids)),'{}');
create function public.m132_goal_topics(p_library uuid)
 returns table(source text,id uuid,parent_id uuid,name text,path text,topic_id uuid)
 language plpgsql stable security definer set search_path='' as $$
begin
 perform public.m123_require_library(p_library);
 return query with recursive paths as (
 select l.id,l.parent_location_id,n.name,n.name::text path,l.topic_id
 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where l.library_id=p_library and l.parent_location_id is null
 union all select c.id,c.parent_location_id,n.name,p.path||' › '||n.name,c.topic_id from paths p
 join public.official_topic_locations c on c.parent_location_id=p.id join public.library_nodes n on n.id=c.topic_id
 ) select 'official'::text,p.id,p.parent_location_id,p.name,p.path,p.topic_id from paths p
 union all select t.source,t.id,t.parent_id,t.name,t.path,t.id from public.m123_goal_topics(p_library) t where t.source='personal';
end $$;
create function public.m132_legacy_goal_locations() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.official_topic_ids is distinct from old.official_topic_ids then
  new.official_location_ids:=coalesce((select array_agg(l.id order by l.id) from public.official_topic_locations l
   where l.library_id=new.library_id and l.topic_id=any(new.official_topic_ids)),'{}');
 end if;
 return new;
end $$;
create trigger m132_goal_locations before insert or update of official_topic_ids on public.study_goals for each row execute function public.m132_legacy_goal_locations();
create function public.save_placement_study_goal(p_library_id uuid,p_name text,p_deadline date,p_objective text,
 p_official_location_ids uuid[],p_personal_topic_ids uuid[],p_goal_id uuid default null,p_expected_revision bigint default null)
 returns uuid language plpgsql security definer set search_path='' as $$
declare canonical_ids uuid[]; result uuid;
begin
 perform public.m123_require_library(p_library_id);
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 if p_official_location_ids is null or cardinality(p_official_location_ids)>200 or exists(select 1 from unnest(p_official_location_ids) i
  where i is null or not exists(select 1 from public.official_topic_locations l where l.id=i and l.library_id=p_library_id)) then
  raise exception 'Select available Topic locations in this Library.' using errcode='22023'; end if;
 select coalesce(array_agg(distinct topic_id order by topic_id),'{}') into canonical_ids from public.official_topic_locations where id=any(p_official_location_ids);
 result:=public.save_study_goal(p_library_id,p_name,p_deadline,p_objective,canonical_ids,p_personal_topic_ids,p_goal_id,p_expected_revision);
 update public.study_goals set official_location_ids=(select coalesce(array_agg(distinct i order by i),'{}') from unnest(p_official_location_ids) i) where id=result;
 return result;
end $$;

-- Compatibility callers may still select an unambiguous single-location Topic.
-- Shared Topics require a location instead of guessing which subtree to use.
create or replace function public.set_study_deck_node_selection(p_deck_id uuid,p_node_id uuid,p_should_include boolean)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.study_decks; l uuid;
begin
 select * into d from public.study_decks where id=p_deck_id and user_id=auth.uid() and is_active;
 if d.id is null or not public.has_socrates_role() then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 if (select count(*) from public.official_topic_locations where topic_id=p_node_id and library_id=d.library_id)<>1 then
  raise exception 'Choose a specific Topic location. Reload Home.' using errcode='PT409'; end if;
 select id into l from public.official_topic_locations where topic_id=p_node_id and library_id=d.library_id;
 return public.set_study_deck_location_selection(p_deck_id,l,p_should_include,public.m132_graph_revision(d.library_id));
end $$;
create function public.m132_initialize_selection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.study_deck_location_selections where deck_id=new.deck_id) then
  insert into public.study_deck_location_selections select new.deck_id,l.id,true from public.official_topic_locations l where l.topic_id=new.node_id and l.library_id=new.library_id;
 end if;
 return new;
end $$;
create trigger m132_initial_deck_selection after insert on public.user_study_node_selections for each row execute function public.m132_initialize_selection();

create function public.set_study_deck_location_preference(p_deck_id uuid,p_library_id uuid,p_location_id uuid,p_balance integer,p_expected_revision text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.study_decks; l public.official_topic_locations; reset_id uuid:=gen_random_uuid(); before_state jsonb;
begin
 if (coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid is null or not public.has_socrates_role() then raise exception 'Approved learner required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and library_id=p_library_id and user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid and is_active for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 perform public.m122_require_library(p_library_id);
 before_state:=public.m117_preference_state(d.id);
 if before_state->>'revision' is distinct from p_expected_revision then raise exception 'Settings or locations changed. Reload Home.' using errcode='40001'; end if;
 select * into l from public.official_topic_locations where id=p_location_id and library_id=p_library_id;
 if l.id is null or not exists(select 1 from public.m132_location_states(d.id) s where s.location_id=l.id and s.included) then
  raise exception 'Selected location required' using errcode='42501'; end if;
 if p_balance is null or p_balance not between 0 and 100 then raise exception 'Balance must be between 0 and 100.' using errcode='22023'; end if;
 insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,reset_source)
 select distinct d.id,d.user_id,d.library_id,c.topic_id,p_balance,reset_id from public.m132_location_closure(p_library_id) c where c.ancestor_id=l.id
 on conflict(deck_id,library_node_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source,shared_compatibility_source=null;
 -- Personal Topics retain their original location anchor and owner scope.
 insert into public.study_deck_personal_topic_preferences(deck_id,user_id,library_id,personal_topic_id,new_mastery_balance,reset_source)
 select distinct d.id,d.user_id,d.library_id,g.topic_id,p_balance,reset_id from public.m117_topic_graph(p_library_id,d.user_id) g
 where g.source='personal' and exists(select 1 from public.m132_location_closure(p_library_id) c join public.official_topic_locations anchor on anchor.id=c.location_id and anchor.is_original
  where c.ancestor_id=l.id and ('official:topic:'||c.topic_id)=any(g.ancestry))
 on conflict(deck_id,personal_topic_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source;
 return public.m117_preference_state(d.id);
end $$;

-- INTEGRATION_FUNCTIONS
-- Exact released definition checked before this bounded integration change.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_home_study_bootstrap(uuid,uuid)'::regprocedure))<> '852230efabc9bf94da3001f3966e3c5c' then raise exception 'Released contract changed: get_home_study_bootstrap(uuid,uuid)'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.get_home_study_bootstrap(p_library_id uuid, p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  result jsonb;
  home_topic_ids uuid[];
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to load Home study data.';
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_deck_id
    and deck.library_id = p_library_id
    and deck.user_id = current_user_id
    and deck.is_active;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized for this Library.';
  end if;

  -- Exclude only branches with a proven canonical root in another Library.
  -- Unplaced roots, missing parents and cycles stay visible to Home's existing
  -- fail-closed composer. This is projection, never a Study eligibility change.
  with recursive other_library_topics(id) as (
    select topic.id
    from public.personal_topics topic
    join public.personal_topic_official_placements placement
      on placement.personal_topic_id = topic.id
     and placement.owner_id = current_user_id
    join public.library_nodes node on node.id = placement.library_node_id
    where topic.owner_id = current_user_id and topic.parent_id is null
      and node.library_id <> p_library_id
    union
    select child.id from public.personal_topics child
    join other_library_topics parent on parent.id = child.parent_id
    where child.owner_id = current_user_id
  )
  select coalesce(array_agg(topic.id order by topic.id), '{}'::uuid[])
  into home_topic_ids
  from public.personal_topics topic
  where topic.owner_id = current_user_id
    and not exists(select 1 from other_library_topics other where other.id = topic.id);

  select jsonb_build_object(
    'available_libraries',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', library.id,
              'name', library.name,
              'slug', library.slug,
              'description', library.description,
              'status', library.status
            )
            order by library.name, library.id
          )
          from public.libraries library
          where library.status = 'active'
            and (
              public.is_editor_or_admin()
              or library.id = p_library_id
            )
        ),
        '[]'::jsonb
      ),
    'nodes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', node.id,
              'name', node.name,
              'node_type', node.node_type,
              'parent_id', node.parent_id
            )
            order by node.name, node.id
          )
          from public.library_nodes node
          where node.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'placements',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'concept_id', placement.concept_id,
              'library_node_id', placement.library_node_id,
              'concepts', jsonb_build_object(
                'id', concept.id,
                'name', concept.name,
                'concept_type', concept.concept_type,
                'summary', concept.summary
              )
            )
            order by placement.library_node_id, placement.concept_id
          )
          from public.concept_placements placement
          join public.library_nodes node
            on node.id = placement.library_node_id
           and node.library_id = p_library_id
          join public.concepts concept
            on concept.id = placement.concept_id
           and concept.status = 'published'
        ),
        '[]'::jsonb
      ),
    'selected_node_ids',
      coalesce(
        (
          select jsonb_agg(selection.node_id order by selection.node_id)
          from public.user_study_node_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'excluded_node_ids',
      coalesce(
        (
          select jsonb_agg(exclusion.node_id order by exclusion.node_id)
          from public.study_deck_node_exclusions exclusion
          where exclusion.deck_id = target_deck.id
            and exclusion.user_id = current_user_id
            and exclusion.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'node_preferences',
      coalesce(
        (
          select jsonb_object_agg(
            preference.library_node_id::text,
            preference.new_mastery_balance
            order by preference.library_node_id::text
          )
          from public.study_deck_node_preferences preference
          where preference.deck_id = target_deck.id
            and preference.user_id = current_user_id
            and preference.library_id = p_library_id
        ),
        '{}'::jsonb
      ),
    'concept_overrides',
      coalesce(
        (
          select jsonb_object_agg(
            override.concept_id::text,
            override.selection_state
            order by override.concept_id::text
          )
          from public.user_study_concept_overrides override
          where override.deck_id = target_deck.id
            and override.user_id = current_user_id
            and override.library_id = p_library_id
        ),
        '{}'::jsonb
      ),
    'resolved_concepts',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(resolved)
            order by lower(resolved.concept_name), resolved.concept_id
          )
          from public.resolve_study_deck(target_deck.id) resolved
        ),
        '[]'::jsonb
      ),
    'library_availability_question_counts',
      public.get_library_official_availability_counts(p_library_id),
    -- Retained wire field: selected-deck candidates, never Library availability.
    'official_question_counts',
      coalesce(
        (
          select jsonb_object_agg(
            count_row.concept_id::text,
            count_row.question_count
            order by count_row.concept_id::text
          )
          from (
            select
              candidate.official_concept_id as concept_id,
              count(distinct candidate.official_question_id)::integer
                as question_count
            from public.resolve_study_candidates(target_deck.id) candidate
            where candidate.candidate_type = 'official'
              and candidate.official_concept_id is not null
              and candidate.official_question_id is not null
            group by candidate.official_concept_id
          ) count_row
        ),
        '{}'::jsonb
      ),
    'learner_progress',
      public.get_library_learner_progress(p_library_id),
    'personal_topics',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', topic.id,
              'parent_id', topic.parent_id,
              'name', topic.name,
              'sort_order', topic.sort_order
            )
            order by topic.sort_order, topic.name, topic.id
          )
          from public.personal_topics topic
          where topic.owner_id = current_user_id
            and topic.id = any(home_topic_ids)
        ),
        '[]'::jsonb
      ),
    'personal_topic_placements',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'personal_topic_id', placement.personal_topic_id,
          'library_node_id', placement.library_node_id
        ) order by placement.personal_topic_id)
        from public.personal_topic_official_placements placement
        where placement.owner_id = current_user_id
          and placement.personal_topic_id = any(home_topic_ids)
      ), '[]'::jsonb),
    'personal_concepts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', concept.id,
              'topic_id', concept.topic_id,
              'name', concept.name
            )
            order by concept.name, concept.id
          )
          from public.personal_concepts concept
          where concept.owner_id = current_user_id
            and concept.topic_id = any(home_topic_ids)
        ),
        '[]'::jsonb
      ),
    'personal_cards',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', card.id,
              'concept_id', card.concept_id,
              'library_node_id', card.library_node_id,
              'library_id', card.library_id,
              'personal_topic_id', card.personal_topic_id
            )
            order by card.created_at, card.id
          )
          from public.personal_cards card
          where card.owner_id = current_user_id
            and (
              card.personal_topic_id = any(home_topic_ids)
              or (card.library_id = p_library_id and exists(
                select 1 from public.library_nodes node
                where node.id = card.library_node_id and node.library_id = p_library_id
              ))
              or exists(select 1 from public.personal_concepts concept
                where concept.id = card.concept_id and concept.owner_id = current_user_id
                  and concept.topic_id = any(home_topic_ids))
            )
        ),
        '[]'::jsonb
      ),
    'selected_personal_topic_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_topic_id
            order by selection.personal_topic_id
          )
          from public.study_deck_personal_topic_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'personal_collections',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', collection.id,
              'name', collection.name,
              'card_count', (
                select count(*)::integer
                from public.personal_collection_cards membership
                where membership.collection_id = collection.id
                  and membership.owner_id = current_user_id
              )
            )
            order by collection.name, collection.id
          )
          from public.personal_collections collection
          where collection.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'selected_personal_collection_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_collection_id
            order by selection.personal_collection_id
          )
          from public.study_deck_personal_collection_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      )
  )
  into result;

  result := result || jsonb_build_object('unified_deck_settings',public.m109_settings_snapshot(target_deck.id),
    'personal_topic_preferences',(select coalesce(jsonb_object_agg(personal_topic_id,new_mastery_balance),'{}') from public.study_deck_personal_topic_preferences where deck_id=target_deck.id),
    'personal_collection_preferences',(select coalesce(jsonb_object_agg(personal_collection_id,new_mastery_balance),'{}') from public.study_deck_personal_collection_preferences where deck_id=target_deck.id),
    'personal_collection_groups',(select coalesce(jsonb_agg(jsonb_build_object('group_key','personal:collection:'||c.id::text,'collection_id',c.id,'selected',exists(select 1 from public.study_deck_personal_collection_selections cs where cs.deck_id=target_deck.id and cs.personal_collection_id=c.id)) order by c.id),'[]') from public.personal_collections c where c.owner_id=current_user_id),
    'unified_deck_capabilities',jsonb_build_object('branch_selection',true,'group_balance',true,'calibration_version',1));
  if true then
    result:=result||jsonb_build_object('official_topic_graph',public.get_official_topic_graph(p_library_id),'location_selection',public.m132_selection_snapshot(target_deck.id));
  end if;
  return result;
end;
$function$
;

-- Exact released definition checked before this bounded integration change.
do $guard$ begin
 if md5(pg_get_functiondef('public.m122_preference_projection(uuid,jsonb)'::regprocedure))<> 'bab7ae3faefddb13000abc5545c40f66' then raise exception 'Released contract changed: m122_preference_projection(uuid,jsonb)'; end if;
end $guard$;
set local role socrates_migrator;
CREATE OR REPLACE FUNCTION public.m122_preference_projection(p_deck uuid, p_legacy jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare d public.study_decks; result jsonb; official jsonb; values_map jsonb;
 -- Internal materialization also needs dormant rows. This helper has no client
 -- execute grant; the flag is never included in a returned settings contract.
 include_dormant boolean:=coalesce((p_legacy->>'m122_include_dormant')::boolean,false);
begin
 select * into d from public.study_decks where id=p_deck;
 -- Always resolve independent locations, including Libraries with no shared rows.
 with effective as materialized(select * from public.m122_effective_nodes(d.id)),
 closure as materialized(select * from public.m132_topic_closure(d.library_id)),
 ancestor_counts as (select topic_id,count(*) total from closure group by topic_id),
 raw as materialized (
  select n.id,
   case when (context.active and p.reset_source is not null) or context.preserved then p.new_mastery_balance
    else coalesce((inherited.value->>'balance')::integer,(p_legacy->'values'->>('official:topic:'||n.id))::integer,50) end balance,
   coalesce(case when context.preserved then p.shared_compatibility_source->>'source' end,reset_group.source,
    p_legacy#>>array['projection','official',n.id::text,'source'],inherited.value->>'source',
    case when p.reset_source is not null then 'reset:'||p.reset_source||':official:topic:'||n.id else 'official:topic:'||n.id end) source,
   coalesce(case when context.preserved then (p.shared_compatibility_source->>'origin')::uuid end,reset_group.origin,
    (p_legacy#>>array['projection','official',n.id::text,'origin'])::uuid,(inherited.value->>'origin')::uuid,n.id) origin,
   case when context.preserved then p.shared_compatibility_source->'ancestors' else inherited.ancestors end ancestors,
   context.active or context.preserved or inherited.value is not null covered,
   exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=n.id) selected
  from public.library_nodes n join public.m117_topic_graph(d.library_id,d.user_id) g on g.source='official' and g.topic_id=n.id
  left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=n.id
  cross join lateral (
   select include_dormant or exists(select 1 from effective e where e.node_id=n.id) active,
    p.shared_compatibility_source is not null and (include_dormant or exists(select 1 from effective e where e.node_id=n.id)
     or exists(select 1 from public.user_study_node_selections selected where selected.deck_id=d.id
      and selected.node_id::text=p.shared_compatibility_source->>'origin')) preserved
  ) context
  left join lateral (
   select entry.value->>'source' source,(entry.value->>'origin')::uuid origin
   from closure reach
   join public.study_deck_node_preferences anchor on anchor.deck_id=d.id and anchor.library_node_id=reach.ancestor_id and anchor.reset_source=p.reset_source
   join jsonb_each(p_legacy#>'{projection,official}') entry on entry.key=anchor.library_node_id::text
   where reach.topic_id=n.id and p.reset_source is not null
   order by coalesce((entry.value->>'selected')::boolean,false) desc,
    case when coalesce((entry.value->>'selected')::boolean,false) then -1 else 1 end *
     (select total from ancestor_counts ancestors where ancestors.topic_id=anchor.library_node_id),anchor.library_node_id
   limit 1
  ) reset_group on context.active
  left join lateral (
   select x.value,
    case when original.shared_compatibility_source->>'source'=x.value->>'source' then original.shared_compatibility_source->'ancestors' end ancestors
   from jsonb_each(p_legacy#>'{projection,official}') x
   left join public.study_deck_node_preferences original on original.deck_id=d.id and original.library_node_id=(x.value->>'origin')::uuid
   where coalesce((x.value->>'selected')::boolean,false) and (
    (p.shared_compatibility_source is null and exists(select 1 from closure c where c.ancestor_id=x.key::uuid and c.topic_id=n.id))
    or exists(select 1 from jsonb_array_elements(p.shared_compatibility_source->'ancestors') ancestor where ancestor->>'source'=x.value->>'source'))
   order by array_position(g.ancestry,'official:topic:'||x.key) desc nulls last,x.key limit 1
  ) inherited on not context.active or p.reset_source is null
  where n.library_id=d.library_id
 ), entries as (
  select r.*,coalesce(r.ancestors,(select coalesce(jsonb_agg(jsonb_build_object('source',a.source,'origin',a.origin) order by a.source,a.origin),'[]')
   from (select distinct parent.source,parent.origin from raw parent join closure c on c.ancestor_id=parent.origin and c.topic_id=r.origin
    where parent.origin<>r.origin and parent.source<>r.source) a)) original_ancestors from raw r
 ) select coalesce(jsonb_object_agg(id,jsonb_build_object('balance',balance,'source',source,'selected',selected,'origin',origin,'ancestors',original_ancestors)) filter(where covered),'{}'),
  coalesce(jsonb_object_agg('official:topic:'||id,balance),'{}')
 into official,values_map from entries;
 -- Ordinary dormant Topics retain the released effective-balance contract:
 -- selected ancestor balance when present, otherwise 50; stored values survive.
 -- Keep the older shared-placement/materialization compatibility overlay only
 -- in the same circumstances where the released projection used it.
 if include_dormant or exists(select 1 from public.official_topic_placements where library_id=d.library_id)
 or exists(select 1 from public.study_deck_node_preferences where deck_id=d.id and shared_compatibility_source is not null) then
  select coalesce(jsonb_object_agg('official:topic:'||p.library_node_id,p.new_mastery_balance),'{}') into values_map
  from public.study_deck_node_preferences p where p.deck_id=d.id and (p.reset_source is not null or p.shared_compatibility_source is not null);
 end if;
 result:=(p_legacy-'m122_include_dormant')||jsonb_build_object('version',122,'values',(p_legacy->'values')||values_map,
  'projection',jsonb_build_object('version',122,'official',official,'personal',p_legacy#>'{projection,personal}'));
 return result||jsonb_build_object('revision',md5(jsonb_build_object('locations',public.m132_selection_snapshot(d.id),'legacy_revision',p_legacy->>'revision',
  'graph',public.m132_graph_revision(d.library_id),'projection',result->'projection',
  'preferences',(select coalesce(jsonb_agg(to_jsonb(p) order by p.library_node_id),'[]') from public.study_deck_node_preferences p where p.deck_id=d.id))::text));
end $function$
;
set local role postgres;

-- Exact released definition checked before this bounded integration change.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_library_learner_progress(uuid)'::regprocedure))<> 'a1e544b792269bcdb255bbdbbebe9911' then raise exception 'Released contract changed: get_library_learner_progress(uuid)'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.get_library_learner_progress(p_library_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to read learner progress.';
  end if;

  if not exists (
    select 1
    from public.libraries library_record
    where library_record.id = p_library_id
      and library_record.status = 'active'
  ) then
    raise exception 'Active Library not found.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized to read progress for this Library.';
  end if;

  with recursive node_closure as (
    select ancestor_id branch_id,topic_id descendant_id from public.m132_location_closure(p_library_id)
  ),
  branch_concepts as (
    select distinct
      closure.branch_id,
      placement.concept_id
    from node_closure closure
    join public.concept_placements placement
      on placement.library_node_id = closure.descendant_id
    join public.concepts concept
      on concept.id = placement.concept_id
     and concept.status = 'published'
  ),
  library_concepts as (
    select distinct branch_concept.concept_id
    from branch_concepts branch_concept
  ),
  user_attempt_counts as (
    select
      attempt.concept_id,
      count(*)::integer as question_attempts
    from public.review_attempts attempt
    join library_concepts library_concept
      on library_concept.concept_id = attempt.concept_id
    where attempt.user_id = current_user_id
    group by attempt.concept_id
  ),
  node_metrics as (
    select
      node.id as library_node_id,
      node.name,
      node.parent_id,
      node.sort_order,
      count(branch_concept.concept_id)::integer as total_concepts,
      count(mastery.concept_id)::integer as assessed_concepts,
      (count(branch_concept.concept_id) - count(mastery.concept_id))::integer
        as unseen_concepts,
      case
        when count(mastery.concept_id) = 0 then null
        else round(avg(mastery.mastery_estimate) * 100, 1)
      end as assessed_mastery_percent,
      case
        when count(branch_concept.concept_id) = 0 then 0::numeric
        else round(
          sum(coalesce(mastery.mastery_estimate, 0::numeric))
            * 100
            / count(branch_concept.concept_id),
          1
        )
      end as coverage_adjusted_progress_percent,
      coalesce(sum(mastery.evidence_count), 0)::integer as evidence_count,
      coalesce(sum(attempt_count.question_attempts), 0)::integer
        as questions_answered
    from (select l.id,l.library_id,n.name,l.parent_location_id parent_id,l.sort_order from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id) node
    left join branch_concepts branch_concept
      on branch_concept.branch_id = node.id
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = branch_concept.concept_id
    left join user_attempt_counts attempt_count
      on attempt_count.concept_id = branch_concept.concept_id
    where node.library_id = p_library_id
    group by node.id, node.name, node.parent_id, node.sort_order
  ),
  library_metrics as (
    select
      count(library_concept.concept_id)::integer as total_concepts,
      count(mastery.concept_id)::integer as assessed_concepts,
      (count(library_concept.concept_id) - count(mastery.concept_id))::integer
        as unseen_concepts,
      case
        when count(mastery.concept_id) = 0 then null
        else round(avg(mastery.mastery_estimate) * 100, 1)
      end as assessed_mastery_percent,
      case
        when count(library_concept.concept_id) = 0 then 0::numeric
        else round(
          sum(coalesce(mastery.mastery_estimate, 0::numeric))
            * 100
            / count(library_concept.concept_id),
          1
        )
      end as coverage_adjusted_progress_percent,
      coalesce(sum(mastery.evidence_count), 0)::integer as evidence_count,
      coalesce(sum(attempt_count.question_attempts), 0)::integer
        as questions_answered
    from library_concepts library_concept
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = library_concept.concept_id
    left join user_attempt_counts attempt_count
      on attempt_count.concept_id = library_concept.concept_id
  ),
  recent_session_rows as (
    select
      session.id,
      session.study_deck_id,
      deck.name as deck_name,
      session.started_at,
      session.ended_at,
      session.answered_count
    from public.study_sessions session
    left join public.study_decks deck on deck.id = session.study_deck_id
    where session.user_id = current_user_id
      and session.library_id = p_library_id
    order by session.started_at desc, session.id
    limit 5
  )
  select jsonb_build_object(
    'library_id', p_library_id,
    'summary', jsonb_build_object(
      'total_concepts', metrics.total_concepts,
      'assessed_concepts', metrics.assessed_concepts,
      'unseen_concepts', metrics.unseen_concepts,
      'assessed_mastery_percent', metrics.assessed_mastery_percent,
      'coverage_adjusted_progress_percent',
        metrics.coverage_adjusted_progress_percent,
      'evidence_count', metrics.evidence_count,
      'questions_answered', metrics.questions_answered,
      'recent_session_count', (
        select count(*)::integer
        from public.study_sessions session
        where session.user_id = current_user_id
          and session.library_id = p_library_id
          and session.started_at >= now() - interval '30 days'
      )
    ),
    'nodes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'library_node_id', node_metric.library_node_id,
            'name', node_metric.name,
            'parent_id', node_metric.parent_id,
            'sort_order', node_metric.sort_order,
            'total_concepts', node_metric.total_concepts,
            'assessed_concepts', node_metric.assessed_concepts,
            'unseen_concepts', node_metric.unseen_concepts,
            'assessed_mastery_percent',
              node_metric.assessed_mastery_percent,
            'coverage_adjusted_progress_percent',
              node_metric.coverage_adjusted_progress_percent,
            'evidence_count', node_metric.evidence_count,
            'questions_answered', node_metric.questions_answered
          )
          order by node_metric.sort_order, lower(node_metric.name),
            node_metric.library_node_id
        )
        from node_metrics node_metric
      ),
      '[]'::jsonb
    ),
    'recent_sessions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', recent_session.id,
            'study_deck_id', recent_session.study_deck_id,
            'deck_name', recent_session.deck_name,
            'started_at', recent_session.started_at,
            'ended_at', recent_session.ended_at,
            'answered_count', recent_session.answered_count
          )
          order by recent_session.started_at desc, recent_session.id
        )
        from recent_session_rows recent_session
      ),
      '[]'::jsonb
    )
  )
  into result
  from library_metrics metrics;

  return result;
end;
$function$
;

-- Exact released definition checked before this bounded integration change.
do $guard$ begin
 if md5(pg_get_functiondef('public.m123_goal_items(uuid)'::regprocedure))<> '8fc763d73b093db2bb6fed7337e65e2d' then raise exception 'Released contract changed: m123_goal_items(uuid)'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.m123_goal_items(p_goal uuid)
 RETURNS TABLE(kind text, id uuid, concept_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.study_goals%rowtype; u uuid:=(select auth.uid());
begin
 select * into g from public.study_goals x where x.id=p_goal and x.user_id=u;
 if not found then raise exception 'Goal not found.' using errcode='42501'; end if;
 perform public.m123_require_library(g.library_id);
 return query with recursive official_nodes as (
  select distinct c.topic_id id from public.m132_location_closure(g.library_id) c where c.ancestor_id=any(g.official_location_ids)
 ), official_anchors as (
  -- Personal child structures remain at their single existing original anchor.
  -- Direct canonical content still shares its identity across every location.
  select distinct l.topic_id id from public.m132_location_closure(g.library_id) c
  join public.official_topic_locations l on l.id=c.location_id and l.is_original
  where c.ancestor_id=any(g.official_location_ids)
 ), personal_nodes(id) as (
  select t.id from public.m123_goal_topics(g.library_id) t where t.source='personal' and (
   t.id=any(g.personal_topic_ids) or exists(select 1 from public.personal_topic_official_placements p
    join official_anchors n on n.id=p.library_node_id where p.personal_topic_id=t.id and p.owner_id=u))
  union select c.id from public.personal_topics c join personal_nodes p on c.parent_id=p.id where c.owner_id=u
 ), official_concepts as (
  select distinct c.id from official_nodes n join public.concept_placements p on p.library_node_id=n.id
  join public.concepts c on c.id=p.concept_id and c.status='published'
 ), personal_concepts as (
  select c.id from public.personal_concepts c where c.owner_id=u and (c.topic_id in(select p.id from personal_nodes p)
   or exists(select 1 from public.personal_concept_official_placements p join official_nodes n on n.id=p.library_node_id
    where p.personal_concept_id=c.id and p.owner_id=u and (p.official_concept_id is null or p.official_concept_id in(select o.id from official_concepts o))))
 ) select 'official'::text,q.id,q.concept_id from public.questions q join official_concepts c on c.id=q.concept_id
 where q.status='published' and q.question_type='short_answer'
 and exists(select 1 from public.question_accepted_answers a where a.question_id=q.id)
 union
 select 'personal',c.id,null::uuid from public.personal_cards c where c.owner_id=u
 and (c.library_node_id is null or c.library_id=g.library_id)
 and (c.concept_id in(select p.id from personal_concepts p) or (c.concept_id is null and (
  c.personal_topic_id in(select p.id from personal_nodes p) or c.library_node_id in(select n.id from official_nodes n))));
end $function$
;

-- Exact released definition checked before this bounded integration change.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_study_goals(uuid)'::regprocedure))<> 'd456431d1c863006981cf40b21a2be41' then raise exception 'Released contract changed: get_study_goals(uuid)'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.get_study_goals(p_library_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare u uuid:=public.m123_require_library(p_library_id); result jsonb;
begin
 select jsonb_build_object('library_id',p_library_id,'as_of',now(),'today',current_date,'mastery_threshold',0.75,
 'topics',coalesce((select jsonb_agg(to_jsonb(t)) from public.m132_goal_topics(p_library_id) t),'[]'::jsonb),
 'goals',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('official_topic_ids',g.official_location_ids,'progress',public.m123_goal_progress(g.id),
   'unavailable_topics',(select count(*) from (
    select 'official'::text source,unnest(g.official_location_ids) id union all select 'personal',unnest(g.personal_topic_ids)
   ) x where not exists(select 1 from public.m132_goal_topics(p_library_id) t where t.source=x.source and t.id=x.id)))
   order by g.deadline,g.created_at,g.id) from public.study_goals g where g.user_id=u and g.library_id=p_library_id),'[]'::jsonb)) into result;
 return result;
end $function$
;

-- Exact released definition checked before this bounded integration change.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_study_advisor(uuid)'::regprocedure))<> '4d10fb7fc83068d3739f7b80b1e8f0e4' then raise exception 'Released contract changed: get_study_advisor(uuid)'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.get_study_advisor(p_library_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
 u uuid:=public.m123_require_library(p_library_id);
 deck_id uuid; settings jsonb:='{}'; result jsonb;
begin
 -- Do not guess which settings apply when there is no unambiguous active Deck.
 if (select count(*) from public.study_decks d where d.user_id=u and d.library_id=p_library_id and d.is_active)=1 then
  select d.id into deck_id from public.study_decks d where d.user_id=u and d.library_id=p_library_id and d.is_active;
  settings:=public.m117_preference_state(deck_id);
 end if;
 with topics as materialized (
  select t.*,t.source||':'||t.id key from public.m132_goal_topics(p_library_id) t
 ), material as materialized (
  -- The released Goal/Study published short-answer + accepted-answer contract.
  -- Direct attachments identify the Topic to discuss; shared paths are not copies.
  select distinct 'official'::text kind,q.id,t.key
  from public.questions q join public.concepts c on c.id=q.concept_id and c.status='published'
  join public.concept_placements p on p.concept_id=c.id
  join topics t on t.source='official' and t.topic_id=p.library_node_id
  where q.status='published' and q.question_type='short_answer'
   and exists(select 1 from public.question_accepted_answers a where a.question_id=q.id)
  union
  select 'personal',c.id,t.key from public.personal_cards c
  left join public.personal_concepts pc on pc.id=c.concept_id and pc.owner_id=u
  join topics t on (t.source='personal' and t.id=case when c.concept_id is null then c.personal_topic_id else pc.topic_id end)
   or (t.source='official' and (
    (c.concept_id is null and c.library_node_id=t.topic_id) or exists(
     select 1 from public.personal_concept_official_placements p
     where p.personal_concept_id=pc.id and p.owner_id=u and p.library_node_id=t.topic_id
      and (p.official_concept_id is null or exists(select 1 from public.concepts o where o.id=p.official_concept_id and o.status='published')))))
  where c.owner_id=u and (c.library_node_id is null or c.library_id=p_library_id)
 ), items as materialized (select distinct kind,id from material),
 attempts as materialized (
  select 'official'::text kind,a.question_id id,a.id attempt_id,a.created_at,a.result
  from public.review_attempts a join items i on i.kind='official' and i.id=a.question_id
  where a.user_id=u and a.created_at<=now()
  union all
  select 'personal',a.personal_card_id,a.id,a.created_at,a.result
  from public.personal_review_attempts a join items i on i.kind='personal' and i.id=a.personal_card_id
  where a.user_id=u and a.created_at<=now()
 ), first_reviews as materialized (select kind,id,min(created_at) first_at from attempts group by kind,id),
 recent as materialized (
  select a.*,f.first_at::date<a.created_at::date reviewed,
   a.result in ('didnt_know','forgot','too_hard') struggled
  from attempts a join first_reviews f using(kind,id) where a.created_at>=(current_date-27)::timestamptz
 ), repeated_lapses as (
  select kind,id from recent where reviewed and struggled group by kind,id having count(distinct created_at::date)>=2
 ), selected as materialized (select e.location_id node_id from public.m132_location_states(deck_id) e where e.included),
 graph as materialized(select * from public.m117_topic_graph(p_library_id,u)),
 related as (
  select distinct a.key,b.key other from material a join material b using(kind,id)
  union
  select 'official:'||c.ancestor_id,'official:'||c.location_id from public.m132_location_closure(p_library_id) c
  union
  select 'official:'||c.location_id,'official:'||c.ancestor_id from public.m132_location_closure(p_library_id) c
  union
  select t.key,a.source||':'||a.topic_id from topics t join graph g on g.topic_id=t.id and g.source=t.source and t.source='personal'
   join graph a on a.group_key=any(g.ancestry)
  union
  select a.source||':'||a.topic_id,t.key from topics t join graph g on g.topic_id=t.id and g.source=t.source and t.source='personal'
   join graph a on a.group_key=any(g.ancestry)
 ), evidence as (
  select t.key,t.name,t.path,t.source,
   (settings#>>array['values',t.source||':topic:'||t.topic_id])::integer balance,
   case when t.source='official' then exists(select 1 from selected s where s.node_id=t.id)
    else coalesce(settings#>'{projection,personal}' ? t.id::text,false) end selected,
   (select count(*) from material m where m.key=t.key) total_items,
   (select count(*) from material m join first_reviews f using(kind,id) where m.key=t.key) covered_items,
   (select count(*) from material m join first_reviews f using(kind,id) where m.key=t.key and f.first_at>=(current_date-27)::timestamptz) new_items,
   (select count(*) from material m join recent r using(kind,id) where m.key=t.key) responses,
   (select count(distinct r.created_at::date) from material m join recent r using(kind,id) where m.key=t.key) study_days,
   coalesce((select least(28,current_date-min(a.created_at)::date+1) from material m join attempts a using(kind,id) where m.key=t.key),0) observation_days,
   (select count(*) from material m join recent r using(kind,id) where m.key=t.key and r.reviewed) review_responses,
   (select count(distinct r.created_at::date) from material m join recent r using(kind,id) where m.key=t.key and r.reviewed) review_days,
   (select count(*) from material m join recent r using(kind,id) where m.key=t.key and r.reviewed and r.struggled) review_lapses,
   (select count(*) from material m join repeated_lapses r using(kind,id) where m.key=t.key) repeated_lapse_items,
   (select count(*) from material m where m.key=t.key and exists(select 1 from recent r where r.kind=m.kind and r.id=m.id and r.reviewed)) reviewed_items,
   coalesce((select jsonb_agg(r.other order by r.other) from related r where r.key=t.key),'[]') related_keys
  from topics t where exists(select 1 from material m where m.key=t.key)
 ) select jsonb_build_object('version',1,'library_id',p_library_id,'actor_id',u,'as_of',now(),'today',current_date,
  'window_days',28,'topics',coalesce((select jsonb_agg(to_jsonb(e) order by e.key) from evidence e),'[]')) into result;
 return result;
end $function$
;

do $$ begin if md5(pg_get_functiondef('public.m122_check_graph(uuid)'::regprocedure))<>'d0d2a316254bdc00551b89abb3bdf36f' then raise exception 'Legacy graph contract changed';end if;end $$;
CREATE OR REPLACE FUNCTION public.m122_check_graph(p_library uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from public.official_topic_placements p join public.library_nodes n on n.id=p.topic_id
  where p.library_id=p_library and n.parent_id is null) then
  raise exception 'Library root cannot be shared' using errcode='23514';
 end if;
 if exists(select 1 from public.m122_edges(p_library) group by parent_id,topic_id having count(*)>1) then
  raise exception 'Duplicate Topic placement' using errcode='23505';
 end if;
 if exists(select 1 from public.m122_edges(p_library) e
  join public.m122_closure(p_library) c on c.ancestor_id=e.topic_id and c.topic_id=e.parent_id) then
  raise exception 'Topic placement cycle' using errcode='23514';
 end if;
 if exists(select 1 from public.official_topic_locations e join public.library_nodes n on n.id=e.topic_id
  where e.library_id=p_library group by e.parent_location_id,lower(btrim(n.name)) having count(*)>1) then
  raise exception 'Sibling Topic name already exists' using errcode='23505';
 end if;
end $function$
;

-- Narrow compatibility guards for pre-location callers and destructive impact review.
do $$ begin if md5(pg_get_functiondef('public.m122_delete_impact(uuid,uuid)'::regprocedure))<>'caf6a3e72efa3ca83c2175b04dee3700' then raise exception 'Released compatibility contract changed: m122_delete_impact(uuid,uuid)';end if;end $$;
set local role postgres;
CREATE OR REPLACE FUNCTION public.m122_delete_impact(p_library uuid, p_topic uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ids uuid[]; impact jsonb;
begin
 if not exists(select 1 from public.library_nodes where id=p_topic and library_id=p_library and parent_id is not null) then
  raise exception 'Non-root Topic in this Library required' using errcode='22023';end if;
 select array_agg(topic_id order by topic_id) into ids from public.m122_closure(p_library,false) where ancestor_id=p_topic;
 select jsonb_build_object('library_id',p_library,'topic_id',p_topic,'canonical_topic_ids',to_jsonb(ids),
  'incoming_locations',(select coalesce(jsonb_agg(to_jsonb(e) order by e.edge_key),'[]') from public.m122_edges(p_library) e where e.topic_id=p_topic),
  'removed_extra_locations',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.official_topic_placements p where p.library_id=p_library and (p.topic_id=any(ids) or p.parent_node_id=any(ids))),
  'concept_placements',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.concept_placements p where p.library_node_id=any(ids)),
  'article_placements',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.article_category_placements p where p.library_node_id=any(ids)),
  'affected_concept_ids',(select coalesce(jsonb_agg(distinct p.concept_id),'[]') from public.concept_placements p where p.library_node_id=any(ids)),
  'affected_question_ids',(select coalesce(jsonb_agg(q.id order by q.id),'[]') from public.questions q where exists(select 1 from public.concept_placements p where p.concept_id=q.concept_id and p.library_node_id=any(ids))),
  'content_records_deleted',false,
  'blockers',jsonb_build_object(
   'independent_locations',(select coalesce(jsonb_agg(l.id order by l.id),'[]') from public.official_topic_locations l
    join public.library_nodes n on n.id=l.topic_id left join public.official_topic_locations parent on parent.id=l.parent_location_id
    where l.topic_id=any(ids) and (parent.topic_id is distinct from n.parent_id
      or (l.legacy_occurrence_key is null and not l.is_original))),
   'shared_descendants',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.official_topic_placements p where p.topic_id=any(ids) and p.topic_id<>p_topic and not p.parent_node_id=any(ids)),
   'personal_roots',(select coalesce(jsonb_agg(p.personal_topic_id order by p.personal_topic_id),'[]') from public.personal_topic_official_placements p where p.library_node_id=any(ids)),
   'standalone_cards',(select coalesce(jsonb_agg(c.id order by c.id),'[]') from public.personal_cards c where c.library_node_id=any(ids)),
   'prerequisites',(select coalesce(jsonb_agg(p.id order by p.id),'[]') from public.concept_prerequisites p where p.prerequisite_library_node_id=any(ids)))) into impact;
 return impact||jsonb_build_object('revision',md5(jsonb_build_object('graph',public.m122_graph_revision(p_library),'impact',impact)::text));
end $function$
;
set local role postgres;

do $$ begin if md5(pg_get_functiondef('public.create_library_node_in_library(uuid,uuid,text,text,integer)'::regprocedure))<>'355a370e2bcfc387ef0947d8178bfdf6' then raise exception 'Released compatibility contract changed: create_library_node_in_library(uuid,uuid,text,text,integer)';end if;end $$;
set local role postgres;
CREATE OR REPLACE FUNCTION public.create_library_node_in_library(p_library_id uuid, p_parent_id uuid, p_name text, p_node_type text DEFAULT 'topic'::text, p_sort_order integer DEFAULT 0)
 RETURNS library_nodes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  parent_node public.library_nodes%rowtype;
  existing_node public.library_nodes%rowtype;
  created_node public.library_nodes%rowtype;
  cleaned_name text := btrim(coalesce(p_name, ''));
  normalized_node_type text := coalesce(nullif(btrim(p_node_type), ''), 'topic');
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create library categories';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if cleaned_name = '' then
    raise exception 'Category name is required';
  end if;

  if normalized_node_type not in ('section', 'chapter', 'topic', 'module') then
    raise exception 'Invalid library node type: %', normalized_node_type;
  end if;

  select *
  into parent_node
  from public.library_nodes ln
  where ln.id = p_parent_id;

  if parent_node.id is null then
    raise exception 'Parent category was not found';
  end if;

  if parent_node.library_id is distinct from p_library_id then
    raise exception 'Parent category does not belong to the active library';
  end if;

  if (select count(*) from public.official_topic_locations where topic_id=p_parent_id)>1 then
    raise exception 'Choose a specific parent location and scope in Creator Studio.' using errcode='PT409';
  end if;

  select *
  into existing_node
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and exists(select 1 from public.m122_edges(p_library_id) e where e.topic_id=ln.id and e.parent_id=p_parent_id)
    and lower(btrim(ln.name)) = lower(cleaned_name)
  order by ln.created_at, ln.id
  limit 1;

  if existing_node.id is not null then
    return existing_node;
  end if;

  insert into public.library_nodes (
    library_id,
    parent_id,
    name,
    node_type,
    sort_order
  )
  values (
    p_library_id,
    p_parent_id,
    cleaned_name,
    normalized_node_type,
    p_sort_order
  )
  returning * into created_node;

  select n.* into created_node from public.library_nodes n where n.id=created_node.id;
  return created_node;
end;
$function$
;
set local role postgres;

do $$ begin if md5(pg_get_functiondef('public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)'::regprocedure))<>'6fb2de39b6985458ea5d1a300b1fef0d' then raise exception 'Released compatibility contract changed: set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)';end if;end $$;
set local role socrates_migrator;
CREATE OR REPLACE FUNCTION public.set_study_deck_topic_subtree_preference(p_deck_id uuid, p_library_id uuid, p_group_key text, p_balance integer, p_expected_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.study_decks; u uuid:=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid; before_state jsonb; root record; reset_id uuid:=gen_random_uuid();
begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501'; end if;
 if p_balance is null or p_balance not between 0 and 100 or p_expected_revision is null then raise exception 'Balance and confirmed revision required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and library_id=p_library_id and is_active
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=p_library_id)) for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 if p_group_key like 'official:topic:%' then
  if (select count(*) from public.official_topic_locations where topic_id=split_part(p_group_key,':',3)::uuid and library_id=p_library_id)<>1 then
   raise exception 'Choose a specific Topic location before changing its subtree preference.' using errcode='PT409'; end if;
  return public.set_study_deck_location_preference(d.id,p_library_id,(select id from public.official_topic_locations where topic_id=split_part(p_group_key,':',3)::uuid and library_id=p_library_id),p_balance,p_expected_revision);
 end if;
 before_state:=public.m117_preference_state(d.id);
 if before_state->>'revision' is distinct from p_expected_revision then raise exception 'Deck settings or Topics changed. Reload Home before saving.' using errcode='40001'; end if;
 select * into root from public.m117_topic_graph(p_library_id,u) where group_key=p_group_key;
 if not found then raise exception 'Authorized Topic required' using errcode='42501'; end if;
 -- Only selected sources/descendants can initiate a reset. An ancestor reset
 -- also overwrites dormant preferences without altering their eligibility.
 if root.source='official' then
  if not exists(select 1 from public.m122_effective_nodes(d.id) e where e.node_id=root.topic_id) then
   raise exception 'Selected Topic required' using errcode='42501';
  end if;
 elsif not (before_state->'projection'->'personal' ? root.topic_id::text) then raise exception 'Selected Topic required' using errcode='42501'; end if;
 insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,reset_source)
 select d.id,u,d.library_id,g.topic_id,p_balance,reset_id from public.m122_closure(p_library_id) g where root.source='official' and g.ancestor_id=root.topic_id
 on conflict(deck_id,library_node_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source,shared_compatibility_source=null;
 insert into public.study_deck_personal_topic_preferences(deck_id,user_id,library_id,personal_topic_id,new_mastery_balance,reset_source)
 select d.id,u,d.library_id,g.topic_id,p_balance,reset_id from public.m117_topic_graph(p_library_id,u) g where g.source='personal' and p_group_key=any(g.ancestry)
 on conflict(deck_id,personal_topic_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source;
 -- An explicit reset deliberately establishes fresh source relationships. The
 -- canonical balance/reset rows were written atomically above; no second value
 -- is stored in provenance, and dormant descendants receive the same reset.
 if root.source='official' and before_state->>'version'='122' then
  update public.study_deck_node_preferences p set shared_compatibility_source=
   jsonb_build_object('version',1,'source',entry.value->>'source','origin',entry.value->>'origin','ancestors',entry.value->'ancestors')
  from jsonb_each(public.m122_preference_projection(d.id,public.m122_legacy_preference_state(d.id)||jsonb_build_object('m122_include_dormant',true))#>'{projection,official}') entry
  where p.deck_id=d.id and p.reset_source=reset_id and p.library_node_id::text=entry.key;
 end if;
 return public.m117_preference_state(d.id);
end $function$
;
set local role postgres;

create function public.m132_legacy_structure_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='official_topic_placements' then
  if tg_op='DELETE' and public.is_editor_or_admin() and nullif(current_setting('socrates.development_delete_actor',true),'')=auth.uid()::text then return old; end if;
  if tg_op='UPDATE' and new.parent_node_id=old.parent_node_id and new.topic_id=old.topic_id and new.library_id=old.library_id then return new; end if;
  raise exception 'Use location-aware Topic controls. Legacy shared-edge writes are disabled.' using errcode='PT409';
 elsif tg_op='UPDATE' and (new.parent_id is distinct from old.parent_id or new.library_id is distinct from old.library_id) then
  raise exception 'Use location-aware Topic controls to move this Topic.' using errcode='PT409';
 end if;
 return new;
end $$;
grant execute on function public.m132_legacy_structure_guard() to socrates_migrator;
set local role socrates_migrator;
create trigger m132_legacy_edge_guard before insert or update or delete on public.official_topic_placements for each row execute function public.m132_legacy_structure_guard();
set local role postgres;
create trigger m132_legacy_node_guard before update on public.library_nodes for each row execute function public.m132_legacy_structure_guard();

alter function public.set_study_deck_location_preference(uuid,uuid,uuid,integer,text) owner to socrates_migrator;

-- Remove the obsolete canonical-parent mutation entry points. No browser table
-- writes to location/selection tables; every write verifies identity and scope.
revoke execute on function public.add_official_topic_placement(uuid,uuid,uuid,text,text),
 public.position_official_topic_placement(uuid,text,uuid,uuid,text,text[],text[],text),
 public.remove_official_topic_placement(uuid,text,text,text) from authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'm132_%' or p.proname in ('change_official_topic_location','create_official_topic_at_location','set_study_deck_location_selection','set_study_deck_location_preference','save_placement_study_goal')) loop
  execute format('set local role %I',f.owner);
  execute format('revoke all on function %s from public, anon, authenticated, service_role',f.signature);
  execute format('grant execute on function %s to postgres,socrates_migrator',f.signature);
  execute 'set local role postgres';
 end loop;
end $$;
grant execute on function public.change_official_topic_location(uuid,uuid,uuid,text,text,boolean,uuid,text),
 public.create_official_topic_at_location(uuid,uuid,text,text,text),
 public.set_study_deck_location_selection(uuid,uuid,boolean,text),
 public.save_placement_study_goal(uuid,text,date,text,uuid[],uuid[],uuid,bigint) to authenticated;
set local role socrates_migrator;
grant execute on function public.set_study_deck_location_preference(uuid,uuid,uuid,integer,text) to authenticated;
set local role postgres;
grant select on public.official_topic_locations,public.study_deck_location_selections to socrates_migrator;
create policy official_topic_locations_internal_read on public.official_topic_locations for select to socrates_migrator using(true);
create policy study_deck_location_selections_internal_read on public.study_deck_location_selections for select to socrates_migrator using(true);
comment on table public.official_topic_locations is 'Persistent, independently organized official Topic locations. topic_id is canonical; this table never owns learning evidence.';
comment on table public.study_deck_location_selections is 'Private per-Deck location directives. Removing a location never removes canonical mastery or history.';
select public.m132_check_locations(id) from public.libraries;
notify pgrst,'reload schema';
commit;
