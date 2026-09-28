-- LOCAL ONLY: synthetic fixtures, always rolled back. Never run against Production.
\set ON_ERROR_STOP on
do $local$ begin
 if current_database() not like 'socrates111_%' then raise exception 'Use a disposable socrates111_ database';end if;
end $local$;
begin;
-- Fixture clock: successive RPC calls in this single rollback transaction get distinct timestamps, as separate request transactions do.
alter table public.personal_review_attempts alter column created_at set default clock_timestamp();
CREATE OR REPLACE FUNCTION public.m111_test_baseline_selector(p_study_session_id uuid, p_include_debug boolean DEFAULT false)
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
      (state.personal_concept_id is null) as is_unseen_concept,
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
    left join public.user_personal_concept_state state
      on state.user_id = current_user_id
     and state.personal_concept_id = candidate.personal_concept_id
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
      else public.m109_card_balance(score.personal_card_id,preference_context.settings) end as effective_balance) balance
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
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if; raise notice 'PASS: %',label;end;$$;
create function pg_temp.fail_card_delete() returns trigger language plpgsql as $$begin
 if current_setting('m111.fixture_fail',true)='on' then raise exception 'Injected late deletion failure' using errcode='P0001';end if;return old;end;$$;
create trigger zz_m111_fixture_failure after delete on public.personal_cards for each row execute function pg_temp.fail_card_delete();
do $test$
declare
 staff uuid:=gen_random_uuid(); learner uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
 root uuid:=gen_random_uuid(); lib uuid:=gen_random_uuid();node uuid:=gen_random_uuid();deck uuid:=gen_random_uuid();card uuid:=gen_random_uuid();session uuid;submission uuid:=gen_random_uuid();
 topic uuid;concept uuid:=gen_random_uuid();concept_card uuid:=gen_random_uuid();custom_card uuid:=gen_random_uuid();d2 uuid:=gen_random_uuid();s2 uuid;
 oldnode uuid:=gen_random_uuid();olddeck uuid:=gen_random_uuid();oldcard uuid:=gen_random_uuid();oldsession uuid;
 empty_score jsonb;positive_score jsonb;negative_score jsonb;aged_score jsonb;result jsonb;again jsonb;
 initial_evidence jsonb;final_evidence jsonb;cram_score jsonb;before_counts jsonb;
 unstudied_collection uuid:=gen_random_uuid();empty_topic uuid;empty_card uuid:=gen_random_uuid();collection uuid:=gen_random_uuid();calibrated jsonb;expected_score float8;base_score float8;review_need float8;shared_before jsonb;shared_after jsonb;dependent_before jsonb;dependent_after jsonb;row_count integer;tbl record;hits bigint;official_concept uuid:=gen_random_uuid();official_question uuid:=gen_random_uuid();study_delete_blocked boolean:=false;f boolean;idx integer;balance integer;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values
 (staff,'authenticated','authenticated',staff||'@example.invalid','','{}','{}'),
 (learner,'authenticated','authenticated',learner||'@example.invalid','','{}','{}'),
 (other_user,'authenticated','authenticated',other_user||'@example.invalid','','{}','{}');
 insert into public.user_roles(user_id,role) values(staff,'admin'),(learner,'learner'),(other_user,'learner');
 perform set_config('request.jwt.claim.sub',staff::text,true);
 insert into public.libraries(id,name,slug,status) values(lib,'111 disposable fixture',lib::text,'active');
 insert into public.library_nodes(id,library_id,name,node_type) values(root,lib,'Root','section');
 insert into public.library_nodes(id,library_id,parent_id,name,node_type) values(node,lib,root,'Card fixture','topic'),(oldnode,lib,root,'Aged Card fixture','topic');
 insert into public.user_libraries(user_id,library_id) values(learner,lib),(other_user,lib);
 perform set_config('request.jwt.claim.sub',learner::text,true);
 select t.id into topic from public.create_personal_topic('Card custom fixture',null,node,0) t;
 insert into public.personal_concepts(id,owner_id,topic_id,name) values(concept,learner,topic,'Real Concept');
 insert into public.personal_cards(id,owner_id,concept_id,question,answer) values(concept_card,learner,concept,'Concept Front','Concept Back');
 select jsonb_build_array((select count(*) from public.personal_topics),(select count(*) from public.personal_concepts)) into before_counts;
 insert into public.personal_cards(id,owner_id,library_node_id,library_id,question,answer) values(card,learner,node,lib,'Standalone Front','Standalone Back'),(oldcard,learner,oldnode,lib,'Old Front','Old Back');
 insert into public.personal_cards(id,owner_id,personal_topic_id,question,answer) values(custom_card,learner,topic,'Custom Front','Custom Back');
 perform pg_temp.check(before_counts=jsonb_build_array((select count(*) from public.personal_topics),(select count(*) from public.personal_concepts)),'No synthetic Topic or Concept generated');
 insert into public.study_decks(id,user_id,library_id,name,is_active,cram_mode) values(deck,learner,lib,'Direct',true,false),(d2,learner,lib,'Concept',false,false),(olddeck,learner,lib,'Old',false,false);
 insert into public.user_study_node_selections(user_id,library_id,node_id,deck_id) values(learner,lib,node,deck),(learner,lib,oldnode,olddeck);
 insert into public.study_deck_personal_topic_selections(deck_id,user_id,library_id,personal_topic_id) values(d2,learner,lib,topic);
 perform pg_temp.check((select count(*)=1 from public.resolve_study_candidates(deck)),'Canonical selection does not auto-select custom subtopic');
 perform pg_temp.check((select count(*)=2 from public.resolve_study_candidates(d2)),'Explicit custom subtopic includes standalone and Concept-backed Cards');
 -- Actual RLS role checks: only owned rows and correctly qualified attachments are writable.
 execute 'set local role authenticated';
 f:=false;
 begin insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(other_user,topic,'Forged owner','Back');exception when insufficient_privilege or foreign_key_violation then f:=true;end;
 perform pg_temp.check(f,'Authenticated cross-owner Card insert rejected');
 f:=false;
 begin insert into public.personal_cards(owner_id,library_node_id,library_id,question,answer) values(learner,node,gen_random_uuid(),'Forged Library','Back');exception when check_violation or foreign_key_violation then f:=true;end;
 perform pg_temp.check(f,'Authenticated canonical Topic/Library mismatch rejected');
 f:=false;
 begin insert into public.personal_cards(owner_id,concept_id,personal_topic_id,question,answer) values(learner,concept,topic,'Two attachments','Back');exception when check_violation then f:=true;end;
 perform pg_temp.check(f,'Exactly-one-attachment check rejects ambiguous attachment');
 update public.personal_cards set question='Edited custom Front',answer='Edited custom Back' where id=custom_card;
 perform pg_temp.check((select question='Edited custom Front' and answer='Edited custom Back' from public.personal_cards where id=custom_card),'Owner can edit standalone Front and Back');
 perform set_config('request.jwt.claim.sub',other_user::text,true);
 perform pg_temp.check(not exists(select 1 from public.personal_cards where id in(card,custom_card,concept_card)),'Other owner cannot read Cards under authenticated RLS');
 f:=false;
 begin insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(other_user,topic,'Cross-owner Topic','Back');exception when check_violation or foreign_key_violation then f:=true;end;
 perform pg_temp.check(f,'Authenticated cross-owner custom Topic target rejected');
 perform set_config('request.jwt.claim.sub',learner::text,true);
 insert into public.personal_collections(id,owner_id,name) values(unstudied_collection,learner,'Unstudied group');
 insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) values(unstudied_collection,learner,custom_card);
 insert into public.study_candidate_flags(user_id,personal_card_id) values(learner,custom_card);
 delete from public.personal_cards where id=custom_card;
 perform pg_temp.check(not exists(select 1 from public.personal_collection_cards where personal_card_id=custom_card) and not exists(select 1 from public.study_candidate_flags where personal_card_id=custom_card),'Unstudied deletion clears membership and flag');
 perform pg_temp.check(not exists(select 1 from public.personal_cards where id=custom_card),'Unstudied standalone Card hard deletion works');
 execute 'reset role';
 -- Keep the Concept-only fixture independent of standalone selection during baseline comparison.
 delete from public.personal_cards where id=custom_card;
 session:=public.start_study_session(deck,50);
 update public.study_decks set is_active=false where id=deck;
 update public.study_decks set is_active=true where id=d2;
 s2:=public.start_study_session(d2,50);
 update public.study_decks set is_active=false where id=d2;
 update public.study_decks set is_active=true where id=olddeck;
 oldsession:=public.start_study_session(olddeck,50);
 select jsonb_build_array((select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id,x.personal_concept_id),'[]') from public.user_personal_concept_state x),(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.review_attempts x),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.user_concept_testing_angle_state x)) into initial_evidence;
 empty_score:=public.select_next_personal_study_card(session,true);
 perform pg_temp.check((empty_score->>'card_new_component')::float8=1 and empty_score->>'selection_reason'='personal_unseen_concept' and (empty_score->>'personal_concept_need')::float8=0.7,'Zero Card attempts is unseen/new');
 update public.study_sessions set cram_mode=true where id=session;
 cram_score:=public.select_next_personal_study_card(session,true);
 perform pg_temp.check((cram_score->>'personal_cram_need')::float8=0.85,'Unseen Cram retains existing 0.85 default');
 update public.study_sessions set cram_mode=false where id=session;
 result:=public.record_personal_study_attempt(session,deck,card,null,'easy',submission);
 again:=public.record_personal_study_attempt(session,deck,card,null,'easy',submission);
 perform pg_temp.check(result=again and (select count(*)=1 from public.personal_review_attempts where personal_card_id=card),'Conceptless response retry is idempotent');
 perform pg_temp.check(result->'state'='null'::jsonb and result->'personalConceptId'='null'::jsonb,'Conceptless response has no fabricated Concept state');
 positive_score:=public.select_next_personal_study_card(session,true);
 perform pg_temp.check((positive_score->>'card_new_component')::float8=0 and positive_score->>'selection_reason'<>'personal_unseen_concept' and (positive_score->>'personal_evidence_count')::integer=1,'First recorded attempt ends unseen classification');
 perform pg_temp.check((positive_score->>'personal_concept_need')::float8 < (empty_score->>'personal_concept_need')::float8 and (positive_score->>'personal_consecutive_success_count')::integer=1,'Positive Card history lowers need with existing formula');
 update public.study_sessions set cram_mode=true where id=session;
 cram_score:=public.select_next_personal_study_card(session,true);
 perform pg_temp.check(abs((cram_score->>'personal_cram_need')::float8-0.55/3)<1e-12,'Cram uses reviewed Card history, not permanent unseen');
 update public.study_sessions set cram_mode=false where id=session;
 perform public.record_personal_study_attempt(session,deck,card,null,'forgot',gen_random_uuid());
 perform public.record_personal_study_attempt(session,deck,card,null,'forgot',gen_random_uuid());
 negative_score:=public.select_next_personal_study_card(session,true);
 perform pg_temp.check((negative_score->>'personal_concept_need')::float8>(positive_score->>'personal_concept_need')::float8 and (negative_score->>'personal_consecutive_lapse_count')::integer=2 and (negative_score->>'personal_consecutive_success_count')::integer=0 and (negative_score->>'personal_is_critical')::boolean,'Negative/lapse Card history raises need and critical status');
 insert into public.personal_review_attempts(user_id,study_session_id,study_deck_id,personal_card_id,personal_concept_id,result,sequence_position,created_at) values(learner,oldsession,olddeck,oldcard,null,'easy',1,now()-interval '21 days');
 aged_score:=public.select_next_personal_study_card(oldsession,true);
 perform pg_temp.check(abs((aged_score->>'card_revisit_need')::float8-(1-exp(-21.0/14)))<1e-12 and abs((aged_score->>'personal_concept_need')::float8-(positive_score->>'personal_concept_need')::float8-0.10*(1-exp(-1)))<1e-12,'Card last-review timestamp drives existing 14/21-day timing');
 select jsonb_build_array((select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id,x.personal_concept_id),'[]') from public.user_personal_concept_state x),(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.review_attempts x),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.user_concept_testing_angle_state x)) into final_evidence;
 perform pg_temp.check(initial_evidence=final_evidence,'Standalone responses mutate zero official or personal Concept evidence');
 -- Existing selected-collection preferences calibrate the standalone Card with the exact 109 expression.
 insert into public.personal_collections(id,owner_id,name) values(collection,learner,'111 fixture');
 insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) values(collection,learner,card);
 insert into public.study_deck_personal_collection_selections(deck_id,user_id,library_id,personal_collection_id) values(deck,learner,lib,collection);
 perform pg_temp.check((select count(*)=1 from public.resolve_study_candidates(deck)),'Topic and collection overlap deduplicates standalone Card');
 update public.study_sessions set selection_snapshot=jsonb_set(selection_snapshot,array['unified_deck_settings','selected_collection_ids'],jsonb_build_array(collection)) where id=session;
 foreach balance in array array[0,50,100] loop
  update public.study_sessions set selection_snapshot=jsonb_set(selection_snapshot,array['unified_deck_settings','collection_preferences'],jsonb_build_object(collection::text,balance)) where id=session;
  update public.study_sessions set selection_snapshot=jsonb_set(selection_snapshot,array['node_preferences'],jsonb_build_object(node::text,balance)) where id=session;
  calibrated:=public.select_next_personal_study_card(session,true);
  base_score:=(calibrated->>'personal_base_priority')::float8;
  review_need:=(0.60*(calibrated->>'personal_concept_need')::float8+0.15*(calibrated->>'card_outcome_need')::float8+0.05*(calibrated->>'card_revisit_need')::float8)/0.80;
  expected_score:=least(1::float8,greatest(0::float8,base_score+0.20*(balance/100.0-0.5)*review_need*4*base_score*(1-base_score)));
  perform pg_temp.check((calibrated->>'effective_new_mastery_balance')::float8=balance and abs((calibrated->>'personal_priority')::float8-expected_score)<1e-12,'Standalone collection New/Mastery uses unchanged bounded 109 calibration, balance='||balance);
 end loop;
 perform pg_temp.check(public.m111_card_balance(card,jsonb_build_object('selected_node_ids',jsonb_build_array(root,node),'node_preferences',jsonb_build_object(root::text,100,node::text,0)),jsonb_build_object('version',109))=0,'Standalone canonical preference uses most-specific selected Topic');
 perform pg_temp.check(public.m111_card_balance(card,jsonb_build_object('selected_node_ids',jsonb_build_array(node),'node_preferences',jsonb_build_object(node::text,0)),jsonb_build_object('version',109,'selected_collection_ids',jsonb_build_array(collection),'collection_preferences',jsonb_build_object(collection::text,100)))=50,'Canonical Topic and collection contributions average once each');
 insert into public.personal_cards(id,owner_id,personal_topic_id,question,answer) values(custom_card,learner,topic,'Custom preference fixture','Back');
 perform pg_temp.check(public.m111_card_balance(custom_card,'{}',jsonb_build_object('version',109,'effective_topic_sources',jsonb_build_object(topic::text,topic::text),'topic_preferences',jsonb_build_object(topic::text,80)))=80,'Custom subtopic preference uses existing effective personal Topic source');
 delete from public.personal_cards where id=custom_card;
 -- Compare whole debug payloads against the released selector with identical real-Concept fixtures.
 for idx in 0..3 loop
  if idx>0 then perform public.record_personal_study_attempt(s2,d2,concept_card,concept,case when idx=1 then 'easy' else 'forgot' end,gen_random_uuid());end if;
  foreach balance in array array[0,50,100] loop
   update public.study_sessions set selection_snapshot=jsonb_set(selection_snapshot,array['unified_deck_settings','topic_preferences',topic::text],to_jsonb(balance)) where id=s2;
   perform pg_temp.check(public.select_next_personal_study_card(s2,true)=public.m111_test_baseline_selector(s2,true),'Concept-backed complete normal payload unchanged, attempts='||idx||', balance='||balance);
  end loop;
  update public.study_sessions set cram_mode=true where id=s2;
  perform pg_temp.check(public.select_next_personal_study_card(s2,true)=public.m111_test_baseline_selector(s2,true),'Concept-backed complete Cram payload unchanged, attempts='||idx);
  update public.study_sessions set cram_mode=false where id=s2;
 end loop;

 -- Real Concept-backed material shares the standalone Card's session.
 insert into public.study_deck_personal_topic_selections(deck_id,user_id,library_id,personal_topic_id) values(deck,learner,lib,topic);
 perform public.record_personal_study_attempt(session,deck,concept_card,concept,'average',gen_random_uuid());
 perform set_config('request.jwt.claim.sub',staff::text,true);
 insert into public.concepts(id,name,status,created_by,body_markdown) values(official_concept,'Official preserved fixture','published',staff,'');
 insert into public.questions(id,concept_id,question_type,prompt,explanation,status,sort_order,difficulty,testing_angle,created_by)
 values(official_question,official_concept,'short_answer','Preserved official question','Explanation','published',0,'medium','General Understanding',staff);
 insert into public.concept_placements(concept_id,library_node_id,sort_order) values(official_concept,node,0);
 insert into public.question_accepted_answers(question_id,answer_text,sort_order) values(official_question,'Preserved answer',0);
 perform set_config('request.jwt.claim.sub',learner::text,true);
 perform public.record_study_session_attempt(session,official_question,official_concept,'easy',gen_random_uuid());
 perform set_config('request.jwt.claim.sub',learner::text,true);
 insert into public.study_candidate_flags(user_id,personal_card_id) values(learner,card),(learner,concept_card);
 -- Source-qualified collisions must not turn official/Topic references into Card history.
 insert into public.personal_cards(id,owner_id,library_node_id,library_id,question,answer)
 values(official_question,learner,node,lib,'UUID collision with official Question','Back'),(node,learner,node,lib,'UUID collision with Topic','Back'),
 (official_concept,learner,node,lib,'UUID collision with official Concept','Back'),
 (concept,learner,node,lib,'UUID collision with personal Concept','Back'),
 (session,learner,node,lib,'UUID collision with Study session','Back'),
 (deck,learner,node,lib,'UUID collision with Deck','Back');
 delete from public.personal_cards where id in(official_question,node,official_concept,concept,session,deck);
 perform pg_temp.check(not exists(select 1 from public.personal_cards where id in(official_question,node,official_concept,concept,session,deck)) and exists(select 1 from public.questions where id=official_question) and exists(select 1 from public.library_nodes where id=node) and exists(select 1 from public.review_attempts where question_id=official_question),'Hard delete preserves typed Question, Topic, official/personal Concept, session and Deck UUID collisions');
 -- Snapshot shared records and every unrelated public row before deleting anything.
 create temporary table deletion_shared_before on commit drop as
 select 'sessions' kind,to_jsonb(t) data from public.study_sessions t
 union all select 'official_attempts',to_jsonb(t) from public.review_attempts t
 union all select 'personal_state',to_jsonb(t) from public.user_personal_concept_state t
 union all select 'official_state',to_jsonb(t) from public.user_concept_mastery t
 union all select 'angle_state',to_jsonb(t) from public.user_concept_testing_angle_state t
 union all select 'submastery',to_jsonb(t) from public.user_submastery t
 union all select 'questions',to_jsonb(t) from public.questions t
 union all select 'concepts',to_jsonb(t) from public.concepts t
 union all select 'other_cards',to_jsonb(t) from public.personal_cards t where t.id<>card
 union all select 'other_attempts',to_jsonb(t) from public.personal_review_attempts t where t.personal_card_id<>card
 union all select 'other_submissions',to_jsonb(t) from public.study_response_submissions t where t.request->>'p_personal_card_id' is distinct from card::text;
 select jsonb_build_array((select to_jsonb(c) from public.personal_cards c where id=card),
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.personal_review_attempts a where personal_card_id=card),
 (select jsonb_agg(to_jsonb(s) order by s.submission_id) from public.study_response_submissions s where request->>'p_personal_card_id'=card::text),
 (select jsonb_agg(to_jsonb(m)) from public.personal_collection_cards m where personal_card_id=card),
 (select jsonb_agg(to_jsonb(flag_row)) from public.study_candidate_flags flag_row where personal_card_id=card)) into dependent_before;
 f:=false;begin update public.personal_cards set concept_id=concept,library_node_id=null,library_id=null where id=card;exception when check_violation then f:=true;end;
 perform pg_temp.check(f,'Studied standalone cannot be reattributed to a Concept');
 -- Another Card's legitimate submission must survive unknown nested references.
 select to_jsonb(s) into shared_before from public.study_response_submissions s
 where s.request->>'p_personal_card_id'=concept_card::text limit 1;
 perform pg_temp.check(shared_before is not null,'Shared-reference fixture contains real unrelated Card history');
 for idx in 1..5 loop
  update public.study_response_submissions set
   request=case idx
    when 1 then request||jsonb_build_object('related_cards',jsonb_build_array(jsonb_build_object('personalCardId',card)))
    when 3 then request||jsonb_build_object('p_study_deck_id',jsonb_build_object('nested_card',card))
    when 4 then request||jsonb_build_object('unknown_reference',upper(card::text))
    else request end,
   response=case idx when 2 then response||jsonb_build_object('shared_history',jsonb_build_array(card))
    when 5 then to_jsonb(card::text) else response end
  where user_id=learner and submission_id=(shared_before->>'submission_id')::uuid;
  select to_jsonb(s) into shared_after from public.study_response_submissions s
   where user_id=learner and submission_id=(shared_before->>'submission_id')::uuid;
  execute 'set local role authenticated';
  f:=false;begin delete from public.personal_cards where id=card;exception when check_violation then f:=true;end;
  execute 'reset role';
  select jsonb_build_array((select to_jsonb(c) from public.personal_cards c where id=card),
   (select jsonb_agg(to_jsonb(a) order by a.id) from public.personal_review_attempts a where personal_card_id=card),
   (select jsonb_agg(to_jsonb(s) order by s.submission_id) from public.study_response_submissions s where request->>'p_personal_card_id'=card::text),
   (select jsonb_agg(to_jsonb(m)) from public.personal_collection_cards m where personal_card_id=card),
   (select jsonb_agg(to_jsonb(flag_row)) from public.study_candidate_flags flag_row where personal_card_id=card)) into dependent_after;
  perform pg_temp.check(f and dependent_before=dependent_after,'Unsupported submission reference rejects atomically, case='||idx);
  perform pg_temp.check(shared_after=(select to_jsonb(s) from public.study_response_submissions s where user_id=learner and submission_id=(shared_before->>'submission_id')::uuid),
   'Unrelated shared submission preserved byte-for-byte, case='||idx);
  update public.study_response_submissions set request=shared_before->'request',response=shared_before->'response'
   where user_id=learner and submission_id=(shared_before->>'submission_id')::uuid;
 end loop;
 -- Unauthorized direct DELETE stays an RLS no-op, including for a staff non-owner.
 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',other_user::text,true);
 delete from public.personal_cards where id=card;get diagnostics row_count=row_count;
 perform pg_temp.check(row_count=0,'Other owner cannot delete studied standalone Card');
 perform set_config('request.jwt.claim.sub',staff::text,true);
 delete from public.personal_cards where id=card;get diagnostics row_count=row_count;
 perform pg_temp.check(row_count=0,'Staff non-owner cannot delete standalone Card');
 perform set_config('request.jwt.claim.sub',learner::text,true);
 perform set_config('m111.fixture_fail','on',true);
 f:=false;
 begin delete from public.personal_cards where id=card;exception when raise_exception then f:=true;end;
 perform set_config('m111.fixture_fail','off',true);
 execute 'reset role';
 select jsonb_build_array((select to_jsonb(c) from public.personal_cards c where id=card),
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.personal_review_attempts a where personal_card_id=card),
 (select jsonb_agg(to_jsonb(s) order by s.submission_id) from public.study_response_submissions s where request->>'p_personal_card_id'=card::text),
 (select jsonb_agg(to_jsonb(m)) from public.personal_collection_cards m where personal_card_id=card),
 (select jsonb_agg(to_jsonb(flag_row)) from public.study_candidate_flags flag_row where personal_card_id=card)) into dependent_after;
 perform pg_temp.check(f and dependent_before=dependent_after,'Late deletion failure rolls back Card, attempts, submissions, membership and flags exactly');
 -- Unexpected shared history is rejected without guessing a destructive JSON edit.
 update public.study_sessions set selection_snapshot=selection_snapshot||jsonb_build_object('unknown_card_history',card) where id=session;
 f:=false;begin delete from public.personal_cards where id=card;exception when check_violation then f:=true;end;
 perform pg_temp.check(f and exists(select 1 from public.personal_cards where id=card),'Unknown shared JSON reference fails closed without retention model');
 update public.study_sessions set selection_snapshot=selection_snapshot-'unknown_card_history' where id=session;
 -- Restore updated_at for a byte-for-byte shared snapshot comparison after the injected fixture.
 update public.study_sessions t set updated_at=(b.data->>'updated_at')::timestamptz from deletion_shared_before b where b.kind='sessions' and b.data->>'id'=t.id::text;
 -- updated_at trigger may assign now(); all fixture operations share this transaction time.
 execute 'set local role authenticated';
 delete from public.personal_cards where id=card;get diagnostics row_count=row_count;
 perform pg_temp.check(row_count=1,'Owner hard-deletes studied standalone Card');
 perform pg_temp.check(not exists(select 1 from public.personal_cards where id=card or question='Standalone Front'),'Deleted Card absent from owner Creator/search data');
 perform pg_temp.check(not exists(select 1 from public.resolve_study_candidates(deck) where personal_card_id=card),'Deleted Card absent from Study eligibility');
 execute 'reset role';
 perform pg_temp.check(public.select_next_personal_study_card(session,true)->>'personal_card_id' is distinct from card::text,'Normal selector cannot deliver deleted Card');
 execute 'set local role authenticated';
 perform pg_temp.check(position(card::text in public.select_next_study_candidate(session,true)::text)=0,'Authenticated unified Study delivery excludes deleted Card');
 execute 'reset role';
 execute 'reset role';
 update public.study_sessions set cram_mode=true where id=session;
 perform pg_temp.check(public.select_next_personal_study_card(session,true)->>'personal_card_id' is distinct from card::text,'Cram selector cannot deliver deleted Card');
 execute 'set local role authenticated';
 perform pg_temp.check(position(card::text in public.select_next_study_candidate(session,true)::text)=0,'Authenticated unified Cram delivery excludes deleted Card');
 execute 'reset role';
 update public.study_sessions set cram_mode=false where id=session;
 perform pg_temp.check(not exists(select 1 from public.personal_review_attempts where personal_card_id=card),'All Card-exclusive attempts removed');
 perform pg_temp.check(not exists(select 1 from public.study_response_submissions where request->>'p_personal_card_id'=card::text),'All Card-exclusive idempotency references removed');
 perform pg_temp.check(not exists(select 1 from public.personal_collection_cards where personal_card_id=card),'Collection membership removed');
 perform pg_temp.check(not exists(select 1 from public.study_candidate_flags where personal_card_id=card),'Flag removed');
 f:=false;begin perform public.record_personal_study_attempt(session,deck,card,null,'easy',submission);exception when raise_exception then f:=true;end;
 perform pg_temp.check(f and not exists(select 1 from public.study_response_submissions where submission_id=submission),'Stale response retry cannot restore history or dangling submission');
 create temporary table deletion_shared_after on commit drop as
 select 'sessions' kind,to_jsonb(t) data from public.study_sessions t
 union all select 'official_attempts',to_jsonb(t) from public.review_attempts t
 union all select 'personal_state',to_jsonb(t) from public.user_personal_concept_state t
 union all select 'official_state',to_jsonb(t) from public.user_concept_mastery t
 union all select 'angle_state',to_jsonb(t) from public.user_concept_testing_angle_state t
 union all select 'submastery',to_jsonb(t) from public.user_submastery t
 union all select 'questions',to_jsonb(t) from public.questions t
 union all select 'concepts',to_jsonb(t) from public.concepts t
 union all select 'other_cards',to_jsonb(t) from public.personal_cards t where t.id<>card
 union all select 'other_attempts',to_jsonb(t) from public.personal_review_attempts t where t.personal_card_id<>card
 union all select 'other_submissions',to_jsonb(t) from public.study_response_submissions t where t.request->>'p_personal_card_id' is distinct from card::text;
 perform pg_temp.check(not exists((select * from deletion_shared_before except select * from deletion_shared_after) union all (select * from deletion_shared_after except select * from deletion_shared_before)),'Shared sessions, other Cards, unrelated attempts/submissions and official evidence exactly preserved');
 for tbl in select tablename from pg_tables where schemaname='public' loop
  execute format('select count(*) from public.%I t where position($1 in to_jsonb(t)::text)>0',tbl.tablename) into hits using card::text;
  perform pg_temp.check(hits=0,'No deleted Card UUID in public.'||tbl.tablename);
 end loop;
 select t.id into empty_topic from public.create_personal_topic('Deletion lifecycle fixture',null,node,0) t;
 insert into public.personal_cards(id,owner_id,personal_topic_id,question,answer) values(empty_card,learner,empty_topic,'Delete lifecycle','Back');
 delete from public.personal_cards where id=empty_card;
 delete from public.personal_topics where id=empty_topic;
 perform pg_temp.check(not exists(select 1 from public.personal_topics where id=empty_topic),'Deleted standalone leaves no custom-subtopic deletion blocker');
 f:=false;begin delete from public.personal_cards where id=concept_card;exception when foreign_key_violation then f:=true;end;
 perform pg_temp.check(f and exists(select 1 from public.personal_cards where id=concept_card),'Studied Concept-backed Card deletion semantics remain restrictive');
 raise notice 'SCORES unseen=%, positive=%, lapse=%, aged=%',empty_score->>'personal_priority',positive_score->>'personal_priority',negative_score->>'personal_priority',aged_score->>'personal_priority';
end $test$;
-- Equivalent synthetic actors exercise the real authenticated RLS role.
do $roles$
declare actors uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; roles text[]:=array['learner','editor','admin'];
 lib uuid:=gen_random_uuid(); root uuid:=gen_random_uuid(); node uuid:=gen_random_uuid(); card uuid; deck uuid; session uuid; i integer;j integer;n integer;
 score jsonb;cram jsonb;gold jsonb;actual jsonb;before_evidence jsonb;after_evidence jsonb;
begin
 for i in 1..3 loop
  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values(actors[i],'authenticated','authenticated',actors[i]||'@example.invalid','','{}','{}');
  insert into public.user_roles(user_id,role) values(actors[i],roles[i]);
 end loop;
 perform set_config('request.jwt.claim.sub',actors[3]::text,true);
 insert into public.libraries(id,name,slug,status) values(lib,'111 role parity',lib::text,'active');
 insert into public.library_nodes(id,library_id,name,node_type) values(root,lib,'Role Root','section');
 insert into public.library_nodes(id,library_id,parent_id,name,node_type) values(node,lib,root,'Role Topic','topic');
 for i in 1..3 loop insert into public.user_libraries(user_id,library_id) values(actors[i],lib);end loop;
 select jsonb_build_array((select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id,x.personal_concept_id),'[]') from public.user_personal_concept_state x),(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.review_attempts x),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.user_concept_testing_angle_state x)) into before_evidence;
 for i in 1..3 loop
  card:=gen_random_uuid();deck:=gen_random_uuid();
  perform set_config('request.jwt.claim.sub',actors[i]::text,true);
  execute 'set local role authenticated';
  insert into public.personal_cards(id,owner_id,library_node_id,library_id,question,answer) values(card,actors[i],node,lib,'Equivalent Front','Equivalent Back');
  perform pg_temp.check((select owner_id=actors[i] and concept_id is null and library_node_id=node from public.personal_cards where id=card),roles[i]||' explicit creation is owned standalone, never official');
  update public.personal_cards set question='Edited Front' where id=card;
  perform pg_temp.check((select question='Edited Front' from public.personal_cards where id=card),roles[i]||' can edit own standalone');
  execute 'reset role';
  insert into public.study_decks(id,user_id,library_id,name,is_active,cram_mode) values(deck,actors[i],lib,'Equivalent Deck',true,false);
  insert into public.user_study_node_selections(user_id,library_id,node_id,deck_id) values(actors[i],lib,node,deck);
  execute 'set local role authenticated';
  session:=public.start_study_session(deck,50);
  perform public.record_personal_study_attempt(session,deck,card,null,'easy',gen_random_uuid());
  execute 'reset role';
  score:=public.select_next_personal_study_card(session,true);
  execute 'reset role';
  update public.study_sessions set cram_mode=true where id=session;
  cram:=public.select_next_personal_study_card(session,true);
  actual:=jsonb_build_array(score->'personal_priority',score->'personal_concept_need',score->'personal_evidence_count',score->'card_new_component',cram->'personal_cram_need');
  if i=1 then gold:=actual;end if;
  perform pg_temp.check(actual=gold and score->>'personal_evidence_count'='1' and score->>'card_new_component'='0',roles[i]||' normal/Cram Card history equals equivalent learner');
  execute 'set local role authenticated';
  for j in 1..3 loop
   if i=j then continue;end if;
   perform set_config('request.jwt.claim.sub',actors[j]::text,true);
   perform pg_temp.check(not exists(select 1 from public.personal_cards where id=card),roles[j]||' cannot read another '||roles[i]||' Card');
   update public.personal_cards set answer='Unauthorized' where id=card;get diagnostics n=row_count;
   perform pg_temp.check(n=0,roles[j]||' cannot edit another '||roles[i]||' Card');
   delete from public.personal_cards where id=card;get diagnostics n=row_count;
   perform pg_temp.check(n=0,roles[j]||' cannot delete another '||roles[i]||' Card');
  end loop;
  perform set_config('request.jwt.claim.sub',actors[i]::text,true);
  delete from public.personal_cards where id=card;get diagnostics n=row_count;
  perform pg_temp.check(n=1 and not exists(select 1 from public.personal_review_attempts where personal_card_id=card),roles[i]||' studied owner deletion removes Card and history');
  execute 'reset role';
 end loop;
 select jsonb_build_array((select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id,x.personal_concept_id),'[]') from public.user_personal_concept_state x),(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.review_attempts x),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.user_concept_testing_angle_state x)) into after_evidence;
 perform pg_temp.check(before_evidence=after_evidence,'All actor roles leave Concept and official evidence unchanged');
end $roles$;
rollback;
