-- LOCAL CANDIDATE ONLY. Requires the accepted Migration 110; no Production installation authorized.
-- No historical migration changes. Existing formulas and authority remain intact.
begin;
do $preflight$
begin
 if session_user<>'postgres' or current_user<>'postgres' then raise exception '111 requires postgres installer';end if;
 if exists(select 1 from pg_attribute where attrelid='public.personal_cards'::regclass and attname='library_node_id' and not attisdropped) then raise exception '111 already or partially installed';end if;
 if md5(pg_get_functiondef('public.resolve_study_candidates(uuid)'::regprocedure))<>'35cfa27c5c8351d50886f0f2367cab9e'
 or md5(pg_get_functiondef('public.select_next_personal_study_card(uuid,boolean)'::regprocedure))<>'b8f44806127889b43d16d17150288790'
 or md5(pg_get_functiondef('public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text)'::regprocedure))<>'83fa3e33a9b234c8018f745fc9b4d578'
 or md5(pg_get_functiondef('public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)'::regprocedure))<>'ece1269d20531b538daf33b6c18a2901'
 then raise exception '111 prerequisite function mismatch';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.enforce_canonical_personal_topic_placement()') and prosecdef and proowner='postgres'::regrole and md5(pg_get_functiondef(oid))='8b04ab5742d932a6be6bbab021b13d5e')
 or not exists(select 1 from pg_trigger where tgrelid='public.library_nodes'::regclass and tgname='m104_structure_lock' and tgenabled='O')
 or not exists(select 1 from pg_trigger where tgrelid='public.libraries'::regclass and tgname='m104_structure_lock' and tgenabled='O')
 or not exists(select 1 from pg_roles where rolname='socrates_migrator' and not rolcanlogin and not rolsuper and not rolbypassrls)
 then raise exception '111 requires 103/104/110 authority and structure';end if;
 if exists(select 1 from pg_constraint where contype='f' and confrelid='public.personal_cards'::regclass
 and conname not in ('personal_collection_cards_card_owner_fkey','study_candidate_flags_personal_card_user_fkey','personal_review_attempts_card_concept_owner_fkey'))
 or exists(select 1 from pg_constraint where contype='f' and confrelid='public.personal_review_attempts'::regclass)
 then raise exception 'Unreviewed Card dependency requires cleanup audit';end if;
 if exists(select 1 from pg_class where oid in ('public.personal_cards'::regclass,'public.personal_review_attempts'::regclass,'public.study_response_submissions'::regclass,'public.personal_topics'::regclass,'public.personal_topic_official_placements'::regclass,'public.library_nodes'::regclass,'public.libraries'::regclass) and (relowner<>'postgres'::regrole or relforcerowsecurity))
 then raise exception '111 requires existing postgres table-owner integrity authority';end if;
end $preflight$;
create temporary table m111_security_before on commit drop as
select 'relation' kind,oid::text id,jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity)::text value from pg_class where relnamespace='public'::regnamespace
union all select 'policy',oid::text,to_jsonb(p)::text from pg_policy p
union all select 'role',oid::text,to_jsonb(r)::text from pg_roles r
union all select 'membership',oid::text,to_jsonb(m)::text from pg_auth_members m;

alter table public.personal_cards alter column concept_id drop not null,
 add column library_node_id uuid,
 add column library_id uuid,
 add column personal_topic_id uuid,
 add constraint personal_cards_one_attachment check(num_nonnulls(concept_id,library_node_id,personal_topic_id)=1),
 add constraint personal_cards_library_pair check((library_node_id is null)=(library_id is null)),
 add constraint personal_cards_node_library_fkey foreign key(library_node_id,library_id) references public.library_nodes(id,library_id) on delete restrict on update restrict,
 add constraint personal_cards_topic_owner_fkey foreign key(personal_topic_id,owner_id) references public.personal_topics(id,owner_id) on delete restrict on update restrict;
create index personal_cards_node_library_idx on public.personal_cards(library_node_id,library_id,owner_id) where library_node_id is not null;
create index personal_cards_topic_owner_idx on public.personal_cards(personal_topic_id,owner_id) where personal_topic_id is not null;
alter table public.personal_review_attempts alter column personal_concept_id drop not null,
 add constraint personal_review_attempts_card_owner_fkey foreign key(personal_card_id,user_id) references public.personal_cards(id,owner_id) on delete restrict on update restrict;

set local role socrates_migrator;
create function public.m111_validate_card_attachment() returns trigger
language plpgsql security invoker set search_path='' as $body$
declare target_library uuid;
begin
 if tg_op='UPDATE' and old.concept_id is distinct from new.concept_id
 and (old.concept_id is null or new.concept_id is null)
 and exists(select 1 from public.personal_review_attempts a where a.personal_card_id=old.id and a.user_id=old.owner_id)
 then raise exception 'Studied Card attribution cannot change' using errcode='23514';end if;
 if new.concept_id is not null then return new;end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid() or not public.has_socrates_role() then raise exception 'Owned Card required' using errcode='42501';end if;
 -- Explicit standalone creation is owner-qualified for every authorized role.
 -- Normal Concept/Question creation destinations are unaffected.
 if new.library_node_id is not null then
  select n.library_id into target_library from public.library_nodes n where n.id=new.library_node_id and n.library_id=new.library_id;
 else
  with recursive ancestry as(
   select t.id,t.parent_id,array[t.id] visited from public.personal_topics t where t.id=new.personal_topic_id and t.owner_id=new.owner_id
   union all select t.id,t.parent_id,a.visited||t.id from ancestry a join public.personal_topics t on t.id=a.parent_id and t.owner_id=new.owner_id where not t.id=any(a.visited)
  ) select n.library_id into target_library from ancestry a join public.personal_topic_official_placements p on p.personal_topic_id=a.id and p.owner_id=new.owner_id join public.library_nodes n on n.id=p.library_node_id where a.parent_id is null;
 end if;
 if target_library is null or not exists(select 1 from public.libraries l where l.id=target_library and l.status='active') then raise exception 'Valid active Topic attachment required' using errcode='23514';end if;
 if not public.is_editor_or_admin() and not exists(select 1 from public.user_libraries m where m.user_id=auth.uid() and m.library_id=target_library) then raise exception 'Topic Library access required' using errcode='42501';end if;
 return new;
end $body$;
revoke all on function public.m111_validate_card_attachment() from public,anon,authenticated,service_role;
grant execute on function public.m111_validate_card_attachment() to postgres;

create function public.m111_validate_attempt_card() returns trigger
language plpgsql security invoker set search_path='' as $body$
declare actual_concept uuid;
begin
 select c.concept_id into actual_concept from public.personal_cards c where c.id=new.personal_card_id and c.owner_id=new.user_id for key share;
 if not found or actual_concept is distinct from new.personal_concept_id then raise exception 'Card and Concept attribution must match' using errcode='23514';end if;
 return new;
end $body$;
revoke all on function public.m111_validate_attempt_card() from public,anon,authenticated,service_role;
grant execute on function public.m111_validate_attempt_card() to postgres;

create function public.m111_card_history(p_card_id uuid)
returns table(evidence_count integer,positive_evidence_count integer,negative_evidence_count integer,consecutive_success_count integer,consecutive_lapse_count integer,last_result text,last_reviewed_at timestamptz)
language plpgsql stable security invoker set search_path='' as $body$
begin
 return query
 with ranked as(
  select a.*,row_number() over(order by a.created_at desc,a.id desc) recency,
   a.result in ('easy','average','hard') positive
  from public.personal_review_attempts a
  where a.user_id=auth.uid() and a.personal_card_id=p_card_id
 ), summary as(
  select count(*)::integer e,count(*) filter(where positive)::integer p,count(*) filter(where not positive)::integer n,
   min(recency) filter(where positive) first_positive,min(recency) filter(where not positive) first_negative,
   (array_agg(result order by recency))[1] r,max(created_at) t from ranked
 ) select e,p,n,
 case when r in ('easy','average','hard') then coalesce(first_negative-1,e)::integer else 0 end,
 case when r in ('didnt_know','forgot','too_hard') then coalesce(first_positive-1,e)::integer else 0 end,r,t from summary;
end;
$body$;
revoke all on function public.m111_card_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.m111_card_history(uuid) to postgres;

reset role;
create trigger m111_card_structure_lock before insert or update or delete on public.personal_cards for each statement execute function public.lock_topic_structure_before_write();
create trigger m111_card_attachment before insert or update on public.personal_cards for each row execute function public.m111_validate_card_attachment();
create trigger m111_attempt_card before insert or update on public.personal_review_attempts for each row execute function public.m111_validate_attempt_card();
set local role socrates_migrator;
-- Extend only the attachment-to-preference lookup. Migration 109's averaging,
-- default, and bounded scoring expression remain unchanged.
create function public.m111_card_balance(p_card_id uuid,p_snapshot jsonb,p_settings jsonb) returns double precision
language plpgsql stable security invoker set search_path='' as $body$
declare b double precision;
begin
 if p_settings->>'version' is distinct from '109' then return 50::double precision;end if;
 with recursive card as (
  select c.* from public.personal_cards c where c.id=p_card_id and c.owner_id=auth.uid() and c.concept_id is null
 ), ancestors as (
  select n.id,n.parent_id,n.library_id,0 distance,array[n.id] visited from card c join public.library_nodes n on n.id=c.library_node_id and n.library_id=c.library_id
  union all select n.id,n.parent_id,n.library_id,a.distance+1,a.visited||n.id
  from ancestors a join public.library_nodes n on n.id=a.parent_id and n.library_id=a.library_id where not n.id=any(a.visited)
 ), canonical_source as (
  select a.id from ancestors a where p_snapshot->'selected_node_ids' ? a.id::text order by a.distance limit 1
 ), contributions as (
  select 'official:topic:'||s.id::text key,coalesce((p_snapshot->'node_preferences'->>s.id::text)::double precision,50) balance from canonical_source s
  union
  select 'personal:topic:'||(p_settings->'effective_topic_sources'->>c.personal_topic_id::text),
   coalesce((p_settings->'topic_preferences'->>(p_settings->'effective_topic_sources'->>c.personal_topic_id::text))::double precision,50)
  from card c where p_settings->'effective_topic_sources' ? c.personal_topic_id::text
  union
  select 'personal:collection:'||m.collection_id::text,coalesce((p_settings->'collection_preferences'->>m.collection_id::text)::double precision,50)
  from card c join public.personal_collection_cards m on m.personal_card_id=c.id and m.owner_id=c.owner_id
  where p_settings->'selected_collection_ids' ? m.collection_id::text
 ) select coalesce(avg(balance),50) into b from contributions;
 return b;
end $body$;
revoke all on function public.m111_card_balance(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.m111_card_balance(uuid,jsonb,jsonb) to postgres;
reset role;
CREATE OR REPLACE FUNCTION public.resolve_study_candidates(p_deck_id uuid)
 RETURNS TABLE(candidate_type text, candidate_id uuid, official_question_id uuid, official_concept_id uuid, personal_card_id uuid, personal_concept_id uuid, personal_topic_id uuid, prompt text, answer text, explanation text, difficulty text, testing_angle text, candidate_position bigint, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive deck as (
    select
      study_deck.id,
      study_deck.user_id,
      study_deck.library_id
    from public.study_decks study_deck
    where study_deck.id = p_deck_id
      and study_deck.user_id = (select auth.uid())
      and public.has_socrates_role()
      and (
        public.is_editor_or_admin()
        or exists (
          select 1
          from public.user_libraries membership
          where membership.user_id = (select auth.uid())
            and membership.library_id = study_deck.library_id
        )
      )
  ),
  official_concepts as (
    select
      resolved.concept_id,
      row_number() over (
        order by lower(resolved.concept_name), resolved.concept_id
      ) as concept_position
    from deck
    cross join lateral public.resolve_study_deck(deck.id) resolved
  ),
  official_candidates as (
    select
      'official'::text as candidate_type,
      question.id as candidate_id,
      question.id as official_question_id,
      question.concept_id as official_concept_id,
      null::uuid as personal_card_id,
      null::uuid as personal_concept_id,
      null::uuid as personal_topic_id,
      question.prompt,
      accepted_answer.answer_text as answer,
      question.explanation,
      question.difficulty,
      question.testing_angle,
      0::integer as source_position,
      official_concept.concept_position,
      question.sort_order as item_sort_order,
      question.created_at
    from official_concepts official_concept
    join public.questions question
      on question.concept_id = official_concept.concept_id
    join lateral (
      select accepted.answer_text
      from public.question_accepted_answers accepted
      where accepted.question_id = question.id
      order by accepted.sort_order, accepted.id
      limit 1
    ) accepted_answer on true
    where question.status = 'published'
      and question.question_type = 'short_answer'
  ),
  selected_official_nodes as (
    select selection.node_id
    from deck
    join public.user_study_node_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id
    join public.library_nodes node
      on node.id = selection.node_id
     and node.library_id = deck.library_id

    union

    select child.id
    from selected_official_nodes selected
    join public.library_nodes parent
      on parent.id = selected.node_id
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = parent.library_id
    join deck on deck.library_id = child.library_id
  ),
  selected_personal_topics as (
    select e.topic_id as personal_topic_id from public.m109_effective_topics(p_deck_id) e where e.is_included
  ),
  eligible_personal_concepts as (
    select concept.id
    from selected_personal_topics selected
    join deck on true
    join public.personal_topics topic
      on topic.id = selected.personal_topic_id
     and topic.owner_id = deck.user_id
    join public.personal_concepts concept
      on concept.topic_id = topic.id
     and concept.owner_id = deck.user_id

    union

    select placement.personal_concept_id
    from deck
    join public.personal_concept_official_placements placement
      on placement.owner_id = deck.user_id
     and placement.official_concept_id is null
    join selected_official_nodes selected
      on selected.node_id = placement.library_node_id
    join public.library_nodes node
      on node.id = placement.library_node_id
     and node.library_id = deck.library_id

    union

    select placement.personal_concept_id
    from deck
    join public.personal_concept_official_placements placement
      on placement.owner_id = deck.user_id
     and placement.official_concept_id is not null
    join official_concepts official
      on official.concept_id = placement.official_concept_id
    join public.library_nodes node
      on node.id = placement.library_node_id
     and node.library_id = deck.library_id
  ),
  standalone_cards as (
    select c.id from deck
    join public.personal_cards c on c.owner_id=deck.user_id and c.concept_id is null
    where (c.library_node_id is not null and c.library_id=deck.library_id and exists(
      select 1 from public.resolve_effective_study_nodes(deck.id) n where n.node_id=c.library_node_id))
    or (c.personal_topic_id is not null and exists(
      select 1 from selected_personal_topics t where t.personal_topic_id=c.personal_topic_id))
  ),
  eligible_personal_cards as (
    select id from standalone_cards
    union
    select card.id
    from eligible_personal_concepts eligible
    join deck on true
    join public.personal_cards card
      on card.concept_id = eligible.id
     and card.owner_id = deck.user_id

    union

    select membership.personal_card_id
    from deck
    join public.study_deck_personal_collection_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id
    join public.personal_collections collection
      on collection.id = selection.personal_collection_id
     and collection.owner_id = deck.user_id
    join public.personal_collection_cards membership
      on membership.collection_id = collection.id
     and membership.owner_id = deck.user_id
  ),
  personal_candidate_rows as (
    select
      card.id,
      card.owner_id,
      card.concept_id,
      coalesce(concept.topic_id,card.personal_topic_id) as topic_id,
      card.question,
      card.answer,
      topic.sort_order as topic_sort_order,
      topic.name as topic_name,
      concept.name as concept_name,
      concept.created_at as concept_created_at,
      card.created_at
    from eligible_personal_cards eligible
    join deck on true
    join public.personal_cards card
      on card.id = eligible.id
     and card.owner_id = deck.user_id
    left join public.personal_concepts concept
      on concept.id = card.concept_id
     and concept.owner_id = deck.user_id
    left join public.personal_topics topic
      on topic.id = coalesce(concept.topic_id,card.personal_topic_id)
     and topic.owner_id = deck.user_id
    where card.library_node_id is null or card.library_id=deck.library_id
  ),
  personal_candidates as (
    select
      'personal'::text as candidate_type,
      personal_card.id as candidate_id,
      null::uuid as official_question_id,
      null::uuid as official_concept_id,
      personal_card.id as personal_card_id,
      personal_card.concept_id as personal_concept_id,
      personal_card.topic_id as personal_topic_id,
      personal_card.question as prompt,
      personal_card.answer,
      null::text as explanation,
      null::text as difficulty,
      null::text as testing_angle,
      1::integer as source_position,
      dense_rank() over (
        order by
          personal_card.topic_sort_order,
          lower(personal_card.topic_name),
          personal_card.topic_id,
          lower(personal_card.concept_name),
          personal_card.concept_created_at,
          personal_card.concept_id
      ) as concept_position,
      0::integer as item_sort_order,
      personal_card.created_at
    from personal_candidate_rows personal_card
  ),
  combined_candidates as (
    select * from official_candidates
    union all
    select * from personal_candidates
  ),
  positioned_candidates as (
    select
      combined.*,
      row_number() over (
        order by
          combined.source_position,
          combined.concept_position,
          combined.item_sort_order,
          combined.created_at,
          combined.candidate_id
      ) as candidate_position
    from combined_candidates combined
  )
  select
    positioned.candidate_type,
    positioned.candidate_id,
    positioned.official_question_id,
    positioned.official_concept_id,
    positioned.personal_card_id,
    positioned.personal_concept_id,
    positioned.personal_topic_id,
    positioned.prompt,
    positioned.answer,
    positioned.explanation,
    positioned.difficulty,
    positioned.testing_angle,
    positioned.candidate_position,
    positioned.created_at
  from positioned_candidates positioned
  order by positioned.candidate_position;
$function$
;
CREATE OR REPLACE FUNCTION public.select_next_personal_study_card(p_study_session_id uuid, p_include_debug boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  selection_result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to select a personal Study Card.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for share;

  if target_session.id is null then
    raise exception 'Active study session not found.';
  end if;

  with
  personal_candidates as (
    select candidate.*
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'personal'
  ),
  card_history as (
    select
      candidate.personal_card_id,
      count(attempt.id)::integer as total_attempt_count,
      count(attempt.id) filter (
        where attempt.result in ('easy', 'average', 'hard')
      )::integer as positive_attempt_count,
      count(attempt.id) filter (
        where attempt.result in ('didnt_know', 'forgot', 'too_hard')
      )::integer as negative_attempt_count,
      count(attempt.id) filter (
        where attempt.study_session_id = target_session.id
      )::integer as session_attempt_count,
      max(attempt.sequence_position) filter (
        where attempt.study_session_id = target_session.id
      ) as session_latest_position,
      max(attempt.created_at) as last_attempt_at,
      (
        array_agg(attempt.result order by attempt.created_at desc, attempt.id desc)
          filter (where attempt.id is not null)
      )[1] as latest_card_result
    from personal_candidates candidate
    left join public.personal_review_attempts attempt
      on attempt.personal_card_id = candidate.personal_card_id
     and attempt.user_id = current_user_id
    group by candidate.personal_card_id
  ),
  personal_traversal as (
    select min(history.session_attempt_count) as minimum_attempt_count
    from card_history history
  ),
  personal_inputs as (
    select
      candidate.*,
      history.total_attempt_count,
      history.positive_attempt_count,
      history.negative_attempt_count,
      history.session_attempt_count,
      history.session_latest_position,
      history.last_attempt_at,
      history.latest_card_result,
      traversal.minimum_attempt_count,
      state.evidence_count,
      state.positive_evidence_count,
      state.negative_evidence_count,
      state.consecutive_success_count,
      state.consecutive_lapse_count,
      state.last_result,
      state.last_reviewed_at,
      (state.history_present is null) as is_unseen_concept,
      case state.last_result
        when 'easy' then 0.00::double precision
        when 'average' then 0.15::double precision
        when 'hard' then 0.30::double precision
        when 'didnt_know' then 0.85::double precision
        when 'forgot' then 1.00::double precision
        when 'too_hard' then 0.70::double precision
        else 0.00::double precision
      end as latest_result_need
    from personal_candidates candidate
    join card_history history
      on history.personal_card_id = candidate.personal_card_id
    cross join personal_traversal traversal
    left join lateral (
      select s.evidence_count,s.positive_evidence_count,s.negative_evidence_count,
        s.consecutive_success_count,s.consecutive_lapse_count,s.last_result,s.last_reviewed_at,
        true as history_present
      from public.user_personal_concept_state s
      where s.user_id=current_user_id and s.personal_concept_id=candidate.personal_concept_id
      union all
      select h.evidence_count,h.positive_evidence_count,h.negative_evidence_count,
        h.consecutive_success_count,h.consecutive_lapse_count,h.last_result,h.last_reviewed_at,
        case when h.evidence_count>0 then true else null::boolean end
      from public.m111_card_history(candidate.personal_card_id) h
      where candidate.personal_concept_id is null
    ) state on true
  ),
  personal_metrics as (
    select
      input.*,
      case
        when input.is_unseen_concept then 0.70::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.40::double precision * (
              (input.negative_evidence_count + 1)::double precision
                / (input.evidence_count + 2)::double precision
            )
            + 0.25::double precision * input.latest_result_need
            + 0.15::double precision * (
              least(input.consecutive_lapse_count, 3)::double precision / 3
            )
            + 0.10::double precision / sqrt(
              (input.evidence_count + 1)::double precision
            )
            + 0.10::double precision * (
              1::double precision - exp(
                -greatest(
                  0::double precision,
                  extract(epoch from (now() - input.last_reviewed_at))
                    / 86400::double precision
                ) / 21::double precision
              )
            )
            - 0.15::double precision * (
              least(input.consecutive_success_count, 5)::double precision / 5
            )
          )
        )
      end as personal_concept_need,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else 0::double precision
      end as card_new_component,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else
          1::double precision - exp(
            -greatest(
              0::double precision,
              extract(epoch from (now() - input.last_attempt_at))
                / 86400::double precision
            ) / 14::double precision
          )
      end as card_revisit_need,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.70::double precision * (
              (input.negative_attempt_count + 1)::double precision
                / (input.total_attempt_count + 2)::double precision
            )
            + 0.30::double precision * (
              case input.latest_card_result
                when 'easy' then 0.00::double precision
                when 'average' then 0.15::double precision
                when 'hard' then 0.30::double precision
                when 'didnt_know' then 0.85::double precision
                when 'forgot' then 1.00::double precision
                when 'too_hard' then 0.70::double precision
                else 0.00::double precision
              end
            )
          )
        )
      end as card_outcome_need,
      case
        when input.is_unseen_concept then 0.85::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.55::double precision * (
              (input.negative_evidence_count + 1)::double precision
                / (input.evidence_count + 2)::double precision
            )
            + 0.30::double precision * input.latest_result_need
            + 0.15::double precision * (
              least(input.consecutive_lapse_count, 3)::double precision / 3
            )
          )
        )
      end as personal_cram_need,
      (
        (
          input.last_result = 'forgot'
          and input.last_reviewed_at >= now() - interval '7 days'
        )
        or coalesce(input.consecutive_lapse_count, 0) >= 2
      ) as is_critical_personal
    from personal_inputs input
  ),
  personal_scores as (
    select
      metric.*,
      least(
        1::double precision,
        greatest(
          0::double precision,
          0.60::double precision * metric.personal_concept_need
            + 0.20::double precision * metric.card_new_component
            + 0.15::double precision * metric.card_outcome_need
            + 0.05::double precision * metric.card_revisit_need
        )
      ) as personal_priority,
      count(*) filter (
        where metric.session_attempt_count = metric.minimum_attempt_count
      ) over () as traversal_pool_count,
      max(metric.session_latest_position) over () as latest_personal_position
    from personal_metrics metric
  ),
  session_preference_context as materialized (
    select case when target_session.cram_mode or target_session.selection_snapshot->'unified_deck_settings'->>'version' is distinct from '109'
      then target_session.selection_snapshot->'unified_deck_settings'
      else (target_session.selection_snapshot->'unified_deck_settings') || jsonb_build_object('effective_topic_sources',
        public.m109_session_topic_sources(target_session.selection_snapshot->'unified_deck_settings')) end as settings
  ),
  calibrated_scores as (
    select score.*, case
      when target_session.cram_mode or balance.effective_balance=50 then score.personal_priority
      else least(1::double precision,greatest(0::double precision,
        score.personal_priority + 0.20::double precision * (balance.effective_balance/100::double precision - 0.5::double precision)
        * ((case when score.card_new_component=1 then 0::double precision else
          (0.60::double precision*score.personal_concept_need+0.15::double precision*score.card_outcome_need+0.05::double precision*score.card_revisit_need)/0.80::double precision end)-score.card_new_component)
        * 4::double precision*score.personal_priority*(1::double precision-score.personal_priority)))
      end as adjusted_priority,balance.effective_balance
    from personal_scores score
    cross join session_preference_context preference_context
    cross join lateral (select case when target_session.cram_mode then 50::double precision
      else case when score.personal_concept_id is not null then public.m109_card_balance(score.personal_card_id,preference_context.settings)
      else public.m111_card_balance(score.personal_card_id,target_session.selection_snapshot,preference_context.settings) end end as effective_balance) balance
  ),
  selected_personal as (
    select score.*
    from calibrated_scores score
    where score.session_attempt_count = score.minimum_attempt_count
    order by
      case
        when score.traversal_pool_count > 1
          and score.session_latest_position = score.latest_personal_position
          and score.latest_personal_position is not null
          then 1
        else 0
      end,
      case
        when target_session.cram_mode then score.personal_cram_need
        else score.adjusted_priority
      end desc,
      score.total_attempt_count,
      score.last_attempt_at asc nulls first,
      score.candidate_position,
      score.personal_card_id
    limit 1
  )
  select
    jsonb_build_object(
      'candidate_type', 'personal',
      'candidate_id', selected.candidate_id,
      'official_question_id', null,
      'official_concept_id', null,
      'personal_card_id', selected.personal_card_id,
      'personal_concept_id', selected.personal_concept_id,
      'personal_topic_id', selected.personal_topic_id,
      'prompt', selected.prompt,
      'answer', selected.answer,
      'explanation', null,
      'difficulty', null,
      'testing_angle', null,
      'candidate_position', selected.candidate_position,
      'created_at', selected.created_at
    )
    || case
      when coalesce(p_include_debug, false) then jsonb_build_object(
        'personal_priority', selected.adjusted_priority,
        'personal_concept_need', selected.personal_concept_need,
        'personal_cram_need', selected.personal_cram_need,
        'card_new_component', selected.card_new_component,
        'card_outcome_need', selected.card_outcome_need,
        'card_revisit_need', selected.card_revisit_need,
        'card_positive_attempt_count', selected.positive_attempt_count,
        'card_negative_attempt_count', selected.negative_attempt_count,
        'card_latest_result', selected.latest_card_result,
        'personal_evidence_count', selected.evidence_count,
        'personal_positive_evidence_count', selected.positive_evidence_count,
        'personal_negative_evidence_count', selected.negative_evidence_count,
        'personal_consecutive_success_count',
          selected.consecutive_success_count,
        'personal_consecutive_lapse_count', selected.consecutive_lapse_count,
        'personal_latest_result', selected.last_result,
        'personal_is_critical', selected.is_critical_personal,
        'personal_session_attempt_count', selected.session_attempt_count,
        'personal_traversal_minimum_count', selected.minimum_attempt_count,
        'selection_reason', case
          when target_session.cram_mode then 'personal_cram_need'
          when selected.is_unseen_concept then 'personal_unseen_concept'
          when selected.is_critical_personal then 'personal_lapse_priority'
          when selected.card_new_component > 0 then 'personal_new_card'
          else 'personal_priority'
        end
      )
      else '{}'::jsonb
    end
  || case when coalesce(p_include_debug,false) and not target_session.cram_mode then jsonb_build_object('personal_base_priority',selected.personal_priority,'effective_new_mastery_balance',selected.effective_balance) else '{}'::jsonb end
  into selection_result
  from selected_personal selected;

  return selection_result;
end;
$function$
;
create or replace function public.record_personal_study_attempt(
  p_study_session_id uuid,
  p_study_deck_id uuid,
  p_personal_card_id uuid,
  p_personal_concept_id uuid,
  p_result text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  card_concept_id uuid;
  next_position integer;
  new_attempt_id uuid;
  attempt_created_at timestamptz;
  is_positive boolean;
  resulting_evidence_count integer;
  resulting_positive_count integer;
  resulting_negative_count integer;
  resulting_success_streak integer;
  resulting_lapse_streak integer;
  resulting_last_result text;
  resulting_last_reviewed_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to record a personal study response.';
  end if;

  if p_result is null or p_result not in (
    'easy',
    'average',
    'hard',
    'didnt_know',
    'forgot',
    'too_hard'
  ) then
    raise exception 'Invalid personal Study response.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.study_deck_id = p_study_deck_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for update;

  if target_session.id is null then
    raise exception 'Active owned Study Session and deck not found.';
  end if;

  select card.concept_id
  into card_concept_id
  from public.personal_cards card
  where card.id = p_personal_card_id
    and card.owner_id = current_user_id;

  if not found then
    raise exception 'Owned personal Card not found.';
  end if;

  if card_concept_id is distinct from p_personal_concept_id then
    raise exception 'Personal Card does not belong to the supplied Concept.';
  end if;

  if not exists (
    select 1
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'personal'
      and candidate.personal_card_id = p_personal_card_id
      and candidate.personal_concept_id is not distinct from p_personal_concept_id
  ) then
    raise exception 'Personal Card is not eligible for this Study deck.';
  end if;

  next_position := target_session.answered_count + 1;
  is_positive := p_result in ('easy', 'average', 'hard');

  insert into public.personal_review_attempts (
    user_id,
    study_session_id,
    study_deck_id,
    personal_card_id,
    personal_concept_id,
    result,
    sequence_position
  )
  values (
    current_user_id,
    target_session.id,
    target_session.study_deck_id,
    p_personal_card_id,
    p_personal_concept_id,
    p_result,
    next_position
  )
  returning id, created_at
  into new_attempt_id, attempt_created_at;

  if card_concept_id is not null then
  insert into public.user_personal_concept_state as personal_state (
    user_id,
    personal_concept_id,
    evidence_count,
    positive_evidence_count,
    negative_evidence_count,
    consecutive_success_count,
    consecutive_lapse_count,
    last_result,
    last_reviewed_at
  )
  values (
    current_user_id,
    p_personal_concept_id,
    1,
    case when is_positive then 1 else 0 end,
    case when is_positive then 0 else 1 end,
    case when is_positive then 1 else 0 end,
    case when is_positive then 0 else 1 end,
    p_result,
    attempt_created_at
  )
  on conflict (user_id, personal_concept_id) do update
  set evidence_count = personal_state.evidence_count + 1,
      positive_evidence_count = personal_state.positive_evidence_count
        + case when is_positive then 1 else 0 end,
      negative_evidence_count = personal_state.negative_evidence_count
        + case when is_positive then 0 else 1 end,
      consecutive_success_count = case
        when is_positive then personal_state.consecutive_success_count + 1
        else 0
      end,
      consecutive_lapse_count = case
        when is_positive then 0
        else personal_state.consecutive_lapse_count + 1
      end,
      last_result = p_result,
      last_reviewed_at = attempt_created_at
  returning
    evidence_count,
    positive_evidence_count,
    negative_evidence_count,
    consecutive_success_count,
    consecutive_lapse_count,
    last_result,
    last_reviewed_at
  into
    resulting_evidence_count,
    resulting_positive_count,
    resulting_negative_count,
    resulting_success_streak,
    resulting_lapse_streak,
    resulting_last_result,
    resulting_last_reviewed_at;
  end if;

  update public.study_sessions
  set answered_count = next_position
  where id = target_session.id;

  return jsonb_build_object(
    'attemptId', new_attempt_id,
    'sequencePosition', next_position,
    'studySessionId', target_session.id,
    'studyDeckId', target_session.study_deck_id,
    'personalCardId', p_personal_card_id,
    'personalConceptId', p_personal_concept_id,
    'result', p_result,
    'state', case when card_concept_id is null then null else jsonb_build_object(
      'evidenceCount', resulting_evidence_count,
      'positiveEvidenceCount', resulting_positive_count,
      'negativeEvidenceCount', resulting_negative_count,
      'consecutiveSuccessCount', resulting_success_streak,
      'consecutiveLapseCount', resulting_lapse_streak,
      'lastResult', resulting_last_result,
      'lastReviewedAt', resulting_last_reviewed_at
    ) end
  );
end;
$$;
create or replace function public.record_personal_study_attempt(
  p_study_session_id uuid,
  p_study_deck_id uuid,
  p_personal_card_id uuid,
  p_personal_concept_id uuid,
  p_result text,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_payload jsonb := jsonb_build_object('kind', 'personal', 'p_study_session_id', p_study_session_id, 'p_study_deck_id', p_study_deck_id, 'p_personal_card_id', p_personal_card_id, 'p_personal_concept_id', p_personal_concept_id, 'p_result', p_result);
  saved public.study_response_submissions%rowtype;
  result_payload jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to record a Study response.';
  end if;
  if p_submission_id is null then
    raise exception 'A submission identifier is required.';
  end if;

  -- The unique key waits for any concurrent first writer. Its reservation,
  -- attempt, evidence, session count, and saved result commit or roll back together.
  insert into public.study_response_submissions(user_id, submission_id, request)
  values (current_user_id, p_submission_id, request_payload)
  on conflict (user_id, submission_id) do nothing;

  select * into strict saved from public.study_response_submissions
  where user_id = current_user_id and submission_id = p_submission_id
  for update;
  if saved.request is distinct from request_payload then
    raise exception 'Submission identifier was already used for a different response.';
  end if;
  if saved.response is not null then
    return saved.response;
  end if;

  -- Delegate unchanged eligibility, sequencing, and evidence formulas.
  result_payload := public.record_personal_study_attempt(p_study_session_id, p_study_deck_id, p_personal_card_id, p_personal_concept_id, p_result);
  update public.personal_review_attempts set submission_id = p_submission_id
  where id = (result_payload->>'attemptId')::uuid and user_id = current_user_id;
  update public.study_response_submissions set response = result_payload
  where user_id = current_user_id and submission_id = p_submission_id;
  return result_payload;
end;
$$;
-- Narrow privileged trigger: no browser-callable delete-history RPC or table grant.
-- postgres ownership is explicit because the existing immutable history tables
-- are postgres-owned and unavailable to the restricted migrator role.
create function public.m111_delete_standalone_dependencies() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
 if old.concept_id is not null then return old;end if;
 if auth.uid() is null or old.owner_id is distinct from auth.uid() or not public.has_socrates_role() then
  raise exception 'Authorized Card owner required' using errcode='42501';
 end if;
 -- The statement structure lock is held before any Card or submission row lock.
 -- Known submission envelopes are exclusively attributable to one Card. Never
 -- guess how to edit an unexpected shared envelope or session snapshot. Known
 -- Topic, Collection and official Concept/Question references remain typed;
 -- UUID equality across source tables never makes them Card dependencies.
 if exists(select 1 from public.study_response_submissions s
   where (s.request->>'p_personal_card_id'=old.id::text or s.response->>'personalCardId'=old.id::text)
   and not coalesce((s.user_id=old.owner_id and s.request->>'kind'='personal'
     and s.request->>'p_personal_card_id'=old.id::text
     and s.request->>'p_personal_concept_id' is null
     and s.request - array['kind','p_study_session_id','p_study_deck_id','p_personal_card_id','p_personal_concept_id','p_result'] = '{}'::jsonb
     and (s.response is null or (s.response->>'personalCardId'=old.id::text and s.response->'state'='null'::jsonb and s.response->>'personalConceptId' is null
       and s.response - array['attemptId','sequencePosition','studySessionId','studyDeckId','personalCardId','personalConceptId','result','state']='{}'::jsonb))),false))
 -- Examine every submission, not just envelopes directly attributed to this
 -- Card. Exempt only schema-defined scalar UUID fields in known envelope kinds.
 -- In particular, an object/array under a familiar field name is NOT typed.
 -- Unknown fields, nesting, envelope kinds and malformed shapes remain visible
 -- to the conservative scan and can only reject deletion, never authorize it.
 or exists(select 1 from public.study_response_submissions s
   cross join lateral (values
     (s.request, case s.request->>'kind'
       when 'personal' then array['p_study_session_id','p_study_deck_id','p_personal_card_id','p_personal_concept_id']
       when 'official' then array['p_study_session_id','p_question_id','p_concept_id']
       else array[]::text[] end),
     (s.response, case s.request->>'kind'
       when 'personal' then array['attemptId','studySessionId','studyDeckId','personalCardId','personalConceptId']
       when 'official' then array['attempt_id']
       else array[]::text[] end)
   ) envelope(payload,typed_keys)
   where position(old.id::text in lower((case when jsonb_typeof(envelope.payload)='object' then envelope.payload - coalesce((
     select array_agg(field.key)
     from jsonb_each(case when jsonb_typeof(envelope.payload)='object' then envelope.payload else '{}'::jsonb end) field
     where field.key=any(envelope.typed_keys)
       and (field.key not in ('p_personal_card_id','personalCardId') or field.value #>> '{}' = lower(field.value #>> '{}'))
       and jsonb_typeof(field.value)='string'
       and (field.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   ),array[]::text[]) else envelope.payload end)::text))>0)
 or exists(select 1 from public.study_sessions s where
   position(old.id::text in (s.selection_snapshot - array['selected_node_ids','excluded_node_ids','concept_overrides','node_preferences','cram_mode','unified_deck_settings'])::text)>0
   or position(old.id::text in (coalesce(s.selection_snapshot->'unified_deck_settings','{}') - array['version','calibration_version','included_topic_ids','excluded_topic_ids','topic_states','effective_topic_sources','effective_topics','selected_collection_ids','topic_preferences','collection_preferences'])::text)>0)
 or exists(select 1 from public.study_progress_resets r where position(old.id::text in
   (r.result_summary - array['request_id','reset_at','scope','target_id','target_name','concepts_reset','mastery_rows_reset','testing_angle_rows_reset','submastery_rows_reset','study_sessions_closed','historical_attempts_preserved','personal_progress_unchanged'])::text)>0)
 then raise exception 'Unexpected shared Card reference requires explicit cleanup review' using errcode='23514';end if;
 delete from public.personal_review_attempts a
 where a.user_id=old.owner_id and a.personal_card_id=old.id and a.personal_concept_id is null;
 delete from public.study_response_submissions s
 where s.user_id=old.owner_id and s.request->>'kind'='personal'
 and s.request->>'p_personal_card_id'=old.id::text and s.request->>'p_personal_concept_id' is null;
 -- Memberships and flags use their existing same-owner CASCADE foreign keys.
 -- The session's shared sequence high-water mark is deliberately not renumbered.
 return old;
end $body$;
revoke all on function public.m111_delete_standalone_dependencies() from public,anon,authenticated,service_role;
create trigger m111_delete_dependencies before delete on public.personal_cards
for each row execute function public.m111_delete_standalone_dependencies();

-- Internal integrity check sees dependencies across owners. It grants no browser
-- access to Cards and shares the existing Migration 104 structural serialization.
create function public.m111_guard_library_card_dependencies() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
 if new.status='active' or new.status is not distinct from old.status then return new;end if;
 if exists (
  with recursive ancestry as (
   select c.id card_id,c.owner_id,t.id,t.parent_id,array[t.id] visited
   from public.personal_cards c join public.personal_topics t on t.id=c.personal_topic_id and t.owner_id=c.owner_id
   where c.concept_id is null
   union all
   select a.card_id,a.owner_id,t.id,t.parent_id,a.visited||t.id
   from ancestry a join public.personal_topics t on t.id=a.parent_id and t.owner_id=a.owner_id
   where not t.id=any(a.visited)
  )
  select 1 from public.personal_cards c where c.concept_id is null and c.library_id=new.id
  union all
  select 1 from ancestry a
  join public.personal_topic_official_placements p on p.personal_topic_id=a.id and p.owner_id=a.owner_id
  join public.library_nodes n on n.id=p.library_node_id
  where a.parent_id is null and n.library_id=new.id
 ) then
  raise exception 'Custom Cards still depend on this Library. Delete those Cards before making the Library unavailable.' using errcode='23514';
 end if;
 return new;
end $body$;
revoke all on function public.m111_guard_library_card_dependencies() from public,anon,authenticated,service_role;
create trigger m111_library_card_dependencies before update of status on public.libraries
for each row execute function public.m111_guard_library_card_dependencies();

do $postflight$ begin
 if exists(select * from m111_security_before except
 (select 'relation',oid::text,jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity)::text from pg_class where relnamespace='public'::regnamespace
 union all select 'policy',oid::text,to_jsonb(p)::text from pg_policy p
 union all select 'role',oid::text,to_jsonb(r)::text from pg_roles r
 union all select 'membership',oid::text,to_jsonb(m)::text from pg_auth_members m)) then raise exception '111 altered existing security';end if;
end $postflight$;
commit;
