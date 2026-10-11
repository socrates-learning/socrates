-- Learner-owned goals only. No scheduler, scoring, history or selection changes.
begin;
do $$ begin
 if to_regprocedure('public.m122_closure(uuid,boolean)') is null then
  raise exception 'Study goals require released shared Topic support (122).';
 end if;
end $$;

create table public.study_goals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 library_id uuid not null references public.libraries(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 120),
 objective text not null check (objective in ('coverage','mastery')),
 deadline date not null,
 official_topic_ids uuid[] not null default '{}',
 personal_topic_ids uuid[] not null default '{}',
 revision bigint not null default 1 check (revision > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (cardinality(official_topic_ids)+cardinality(personal_topic_ids) between 1 and 200)
);
create index study_goals_owner_library on public.study_goals(user_id,library_id,deadline,id);
alter table public.study_goals enable row level security;
revoke all on public.study_goals from public,anon,authenticated,service_role;
grant select on public.study_goals to authenticated;
create policy study_goals_owner_read on public.study_goals for select to authenticated using (
 user_id=(select auth.uid()) and public.has_socrates_role()
 and exists(select 1 from public.libraries l where l.id=library_id and l.status='active')
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=(select auth.uid()) and m.library_id=study_goals.library_id))
);

create function public.m123_require_library(p_library uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=(select auth.uid());
begin
 if u is null or not public.has_socrates_role() or not exists(select 1 from public.libraries l where l.id=p_library and l.status='active')
 or (not public.is_editor_or_admin() and not exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=p_library)) then
  raise exception 'Not authorized for study goals in this Library.' using errcode='42501';
 end if;
 return u;
end $$;

-- One choice per canonical identity. Personal roots proven to belong to another
-- Library are omitted, matching Home's existing projection, not changing Study.
create function public.m123_goal_topics(p_library uuid)
returns table(source text,id uuid,parent_id uuid,name text,path text)
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.m123_require_library(p_library);
begin
 return query with recursive other_topics(id) as (
  select t.id from public.personal_topics t
  join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=u
  join public.library_nodes n on n.id=p.library_node_id
  where t.owner_id=u and t.parent_id is null and n.library_id<>p_library
  union select c.id from public.personal_topics c join other_topics p on c.parent_id=p.id where c.owner_id=u
 ), nodes as (
  select 'official'::text source,n.id,n.parent_id,n.name from public.library_nodes n where n.library_id=p_library
  union all select 'personal',t.id,t.parent_id,t.name from public.personal_topics t
  where t.owner_id=u and not exists(select 1 from other_topics o where o.id=t.id)
 ), paths as (
  select n.*,n.name::text path,array[n.id] visited from nodes n where n.parent_id is null
  union all select n.*,p.path||' › '||n.name,p.visited||n.id from nodes n
   join paths p on n.parent_id=p.id and n.source=p.source where not n.id=any(p.visited)
 ) select p.source,p.id,p.parent_id,p.name,p.path from paths p order by p.source,p.path,p.id;
end $$;

-- Goal scope describes available material, independently of Deck selections.
-- The released short-answer/published/accepted-answer and personal-owner rules
-- are retained. Canonical item identities deduplicate shared and overlapping paths.
create function public.m123_goal_items(p_goal uuid)
returns table(kind text,id uuid,concept_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare g public.study_goals%rowtype; u uuid:=(select auth.uid());
begin
 select * into g from public.study_goals x where x.id=p_goal and x.user_id=u;
 if not found then raise exception 'Goal not found.' using errcode='42501'; end if;
 perform public.m123_require_library(g.library_id);
 return query with recursive official_nodes as (
  select distinct c.topic_id id from public.m122_closure(g.library_id) c where c.ancestor_id=any(g.official_topic_ids)
 ), personal_nodes(id) as (
  select t.id from public.m123_goal_topics(g.library_id) t where t.source='personal' and (
   t.id=any(g.personal_topic_ids) or exists(select 1 from public.personal_topic_official_placements p
    join official_nodes n on n.id=p.library_node_id where p.personal_topic_id=t.id and p.owner_id=u))
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
end $$;

create function public.m123_goal_progress(p_goal uuid) returns jsonb
language sql stable security definer set search_path='' set timezone='UTC' as $$
 with items as materialized (select * from public.m123_goal_items(p_goal)),
 attempts as materialized (
  select 'official'::text kind,a.question_id id,a.concept_id,a.created_at,a.study_session_id
  from public.review_attempts a join items i on i.kind='official' and i.id=a.question_id where a.user_id=(select auth.uid())
  union all select 'personal',a.personal_card_id,null::uuid,a.created_at,a.study_session_id
  from public.personal_review_attempts a join items i on i.kind='personal' and i.id=a.personal_card_id where a.user_id=(select auth.uid())
 ), first_reviews as (
  select kind,id,min(created_at) first_at from attempts group by kind,id
 ), concepts as (
  select distinct i.concept_id from items i where i.kind='official'
 ), concept_state as (
  select c.concept_id,coalesce(m.mastery_estimate>0.75,false) mastered,
   (select min(a.created_at) from public.review_attempts a where a.user_id=(select auth.uid()) and a.concept_id=c.concept_id) first_at
  from concepts c left join public.user_concept_mastery m on m.concept_id=c.concept_id and m.user_id=(select auth.uid())
 ), recent as (select * from attempts where created_at >= (current_date-27)::timestamptz and created_at<=now()),
 sessions as (
  select s.*,extract(epoch from s.ended_at-s.started_at)/s.answered_count seconds_per_response
  from public.study_sessions s where s.user_id=(select auth.uid()) and s.answered_count>0
  and s.ended_at>=s.started_at and s.ended_at-s.started_at between interval '1 second' and interval '4 hours'
  and s.started_at>=(current_date-27)::timestamptz and s.ended_at<=now()
  and exists(select 1 from recent a where a.study_session_id=s.id)
 ) select jsonb_build_object(
  'total_items',(select count(*) from items),'covered_items',(select count(*) from first_reviews),
  'personal_items',(select count(*) from items where kind='personal'),
  'total_concepts',(select count(*) from concepts),'mastered_concepts',(select count(*) from concept_state where mastered),
  'recent_responses',(select count(*) from recent),
  'recent_official_responses',(select count(*) from recent where kind='official'),
  'recent_study_days',(select count(distinct created_at::date) from recent),
  'recent_coverage_gain',(select count(*) from first_reviews where first_at>=(current_date-27)::timestamptz),
  'recent_mastery_cohort',(select count(*) from concept_state where mastered and first_at>=(current_date-27)::timestamptz),
  'observation_days',coalesce(least(28,current_date-(select min(created_at)::date from attempts)+1),0),
  'timed_sessions',(select count(*) from sessions),
  'timed_responses',coalesce((select sum(answered_count) from sessions),0),
  'seconds_per_response',(select percentile_cont(0.5) within group(order by seconds_per_response) from sessions)
 );
$$;

create function public.get_study_goals(p_library_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=public.m123_require_library(p_library_id); result jsonb;
begin
 select jsonb_build_object('library_id',p_library_id,'as_of',now(),'today',current_date,'mastery_threshold',0.75,
 'topics',coalesce((select jsonb_agg(to_jsonb(t)) from public.m123_goal_topics(p_library_id) t),'[]'::jsonb),
 'goals',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('progress',public.m123_goal_progress(g.id),
   'unavailable_topics',(select count(*) from (
    select 'official'::text source,unnest(g.official_topic_ids) id union all select 'personal',unnest(g.personal_topic_ids)
   ) x where not exists(select 1 from public.m123_goal_topics(p_library_id) t where t.source=x.source and t.id=x.id)))
   order by g.deadline,g.created_at,g.id) from public.study_goals g where g.user_id=u and g.library_id=p_library_id),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.save_study_goal(p_library_id uuid,p_name text,p_deadline date,p_objective text,
 p_official_topic_ids uuid[],p_personal_topic_ids uuid[],p_goal_id uuid default null,p_expected_revision bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.m123_require_library(p_library_id); result uuid; official_ids uuid[]; personal_ids uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('study-goals:'||u::text,123));
 select coalesce(array_agg(distinct x order by x),'{}') into official_ids from unnest(p_official_topic_ids) x;
 select coalesce(array_agg(distinct x order by x),'{}') into personal_ids from unnest(p_personal_topic_ids) x;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_deadline is null
 or p_objective is null or p_objective not in ('coverage','mastery') or cardinality(official_ids)+cardinality(personal_ids) not between 1 and 200
 or exists(select 1 from (select 'official'::text source,unnest(official_ids) id union all select 'personal',unnest(personal_ids)) x
 where x.id is null or not exists(select 1 from public.m123_goal_topics(p_library_id) t where t.source=x.source and t.id=x.id)) then
  raise exception 'Enter a name, deadline, objective and available Topics.' using errcode='22023';
 end if;
 if p_goal_id is null then
  if (select count(*) from public.study_goals g where g.user_id=u and g.library_id=p_library_id)>=100 then
   raise exception 'This Library already has 100 goals.' using errcode='22023';
  end if;
  insert into public.study_goals(user_id,library_id,name,deadline,objective,official_topic_ids,personal_topic_ids)
   values(u,p_library_id,btrim(p_name),p_deadline,p_objective,official_ids,personal_ids) returning id into result;
 else
  update public.study_goals g set name=btrim(p_name),deadline=p_deadline,objective=p_objective,
   official_topic_ids=official_ids,personal_topic_ids=personal_ids,revision=g.revision+1,updated_at=now()
   where g.id=p_goal_id and g.user_id=u and g.library_id=p_library_id and g.revision=p_expected_revision returning id into result;
  if result is null then raise exception 'Goal changed or is unavailable. Reload before saving.' using errcode='40001'; end if;
 end if;
 return result;
end $$;

create function public.delete_study_goal(p_library_id uuid,p_goal_id uuid,p_expected_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.m123_require_library(p_library_id);
begin
 delete from public.study_goals g where g.id=p_goal_id and g.user_id=u and g.library_id=p_library_id and g.revision=p_expected_revision;
 if not found then raise exception 'Goal changed or is unavailable. Reload before removing.' using errcode='40001'; end if;
end $$;

revoke all on function public.m123_require_library(uuid),public.m123_goal_topics(uuid),public.m123_goal_items(uuid),public.m123_goal_progress(uuid),public.get_study_goals(uuid),public.save_study_goal(uuid,text,date,text,uuid[],uuid[],uuid,bigint),public.delete_study_goal(uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.get_study_goals(uuid),public.save_study_goal(uuid,text,date,text,uuid[],uuid[],uuid,bigint),public.delete_study_goal(uuid,uuid,bigint) to authenticated;
comment on table public.study_goals is 'Owner-scoped planning only. Removing goals never removes review history; targets never alter Study selection or scoring.';
notify pgrst,'reload schema';
commit;
