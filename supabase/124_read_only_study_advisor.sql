-- Advisory evidence only: no table, policy, scheduler or existing function changes.
begin;
do $$ begin
 if to_regprocedure('public.get_study_goals(uuid)') is null or to_regprocedure('public.m123_goal_topics(uuid)') is null then
  raise exception 'Study Advisor requires Goal Dates (123).';
 end if;
end $$;

create function public.get_study_advisor(p_library_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
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
  select t.*,t.source||':'||t.id key from public.m123_goal_topics(p_library_id) t
 ), material as materialized (
  -- The released Goal/Study published short-answer + accepted-answer contract.
  -- Direct attachments identify the Topic to discuss; shared paths are not copies.
  select distinct 'official'::text kind,q.id,t.key
  from public.questions q join public.concepts c on c.id=q.concept_id and c.status='published'
  join public.concept_placements p on p.concept_id=c.id
  join topics t on t.source='official' and t.id=p.library_node_id
  where q.status='published' and q.question_type='short_answer'
   and exists(select 1 from public.question_accepted_answers a where a.question_id=q.id)
  union
  select 'personal',c.id,t.key from public.personal_cards c
  left join public.personal_concepts pc on pc.id=c.concept_id and pc.owner_id=u
  join topics t on (t.source='personal' and t.id=case when c.concept_id is null then c.personal_topic_id else pc.topic_id end)
   or (t.source='official' and (
    (c.concept_id is null and c.library_node_id=t.id) or exists(
     select 1 from public.personal_concept_official_placements p
     where p.personal_concept_id=pc.id and p.owner_id=u and p.library_node_id=t.id
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
 ), selected as materialized (select e.node_id from public.m122_effective_nodes(deck_id) e),
 graph as materialized(select * from public.m117_topic_graph(p_library_id,u)),
 related as (
  select distinct a.key,b.key other from material a join material b using(kind,id)
  union
  select 'official:'||c.ancestor_id,'official:'||c.topic_id from public.m122_closure(p_library_id) c
  union
  select 'official:'||c.topic_id,'official:'||c.ancestor_id from public.m122_closure(p_library_id) c
  union
  select t.key,a.source||':'||a.topic_id from topics t join graph g on g.topic_id=t.id and g.source=t.source
   join graph a on a.group_key=any(g.ancestry)
  union
  select a.source||':'||a.topic_id,t.key from topics t join graph g on g.topic_id=t.id and g.source=t.source
   join graph a on a.group_key=any(g.ancestry)
 ), evidence as (
  select t.key,t.name,t.path,t.source,
   (settings#>>array['values',t.source||':topic:'||t.id])::integer balance,
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
end $$;
revoke all on function public.get_study_advisor(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_study_advisor(uuid) to authenticated;
comment on function public.get_study_advisor(uuid) is 'Owner and Library scoped, read-only evidence. Uses canonical Topic identities and released preference projection. Never changes Study settings or outcomes.';
notify pgrst,'reload schema';
commit;
