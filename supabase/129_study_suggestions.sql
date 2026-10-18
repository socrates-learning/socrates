-- Authenticated, server-mediated Study suggestions. No public/browser insert grant.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regprocedure('admin_inbox_internal.create_message(text,text,text,text,text,text,uuid,uuid,uuid)') is null then
  raise exception '129 requires postgres and Migration 128';
 end if;
end $$;

alter table public.admin_inbox_messages
 add column sender_user_id uuid references auth.users(id) on delete set null,
 add column submission_key uuid,
 add column submission_hash text check (submission_hash ~ '^[0-9a-f]{64}$'),
 add constraint admin_inbox_submission_unique unique (sender_user_id, submission_key);
create index admin_inbox_sender_time_idx on public.admin_inbox_messages(sender_user_id,submitted_at desc)
 where sender_user_id is not null;

-- Only the authenticated Next.js handler may call this with its verified actor.
-- service_role is server-only; neither authenticated nor anon may execute it.
create function public.submit_study_suggestion_internal(
 p_actor uuid, p_request_id uuid, p_library_id uuid, p_question_id uuid,
 p_category text, p_content text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 previous_sub text := current_setting('request.jwt.claim.sub',true);
 fingerprint text;
 existing public.admin_inbox_messages%rowtype;
 topic uuid;
 message_id uuid;
 submitted timestamptz;
begin
 if p_actor is null or not exists(select 1 from public.user_roles where user_id=p_actor and role in ('admin','editor','learner')) then
  raise exception 'Approved account required.' using errcode='42501';
 end if;
 perform public.m127_assert_writable(p_actor);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if not public.account_is_active() or not public.m112_library_access(p_library_id) then
  raise exception 'Library access required.' using errcode='42501';
 end if;
 if p_request_id is null or p_category is null or p_category not in ('Content Correction','New Topic','Feature Suggestion','Other')
  or p_content is null or p_content !~ '[^[:space:]]' or char_length(btrim(p_content)) not between 1 and 4000 then
  raise exception 'Invalid suggestion.' using errcode='22023';
 end if;
 -- Serialize each sender's quota and idempotency checks across all app instances.
 perform pg_advisory_xact_lock(hashtextextended('study-suggestion:'||p_actor::text,0));
 fingerprint := encode(sha256(convert_to(jsonb_build_array(p_library_id,p_question_id,p_category,btrim(p_content))::text,'UTF8')),'hex');
 select * into existing from public.admin_inbox_messages where sender_user_id=p_actor and submission_key=p_request_id;
 if found then
  if existing.submission_hash <> fingerprint then
   raise exception 'Request already used for another suggestion.' using errcode='23505';
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  return jsonb_build_object('id',existing.id,'submittedAt',existing.submitted_at);
 end if;
 if p_question_id is not null then
  -- Reuse the released published-Question and Library authorization contract.
  perform public.m125_require_question(p_library_id,p_question_id);
  select n.id into topic from public.questions q
   join public.concept_placements cp on cp.concept_id=q.concept_id
   join public.library_nodes n on n.id=cp.library_node_id
   where q.id=p_question_id and n.library_id=p_library_id and n.node_type='topic'
   order by n.id limit 1;
 end if;
 if (select count(*) from public.admin_inbox_messages where sender_user_id=p_actor and source='study_mode'
     and submitted_at > clock_timestamp()-interval '10 minutes') >= 5
  or (select count(*) from public.admin_inbox_messages where sender_user_id=p_actor and source='study_mode'
     and submitted_at > clock_timestamp()-interval '24 hours') >= 20 then
  raise exception 'Suggestion limit reached. Try again later.' using errcode='P0429';
 end if;
 -- Never copy a Question's content, personal Cards, notes, email or study history.
 message_id := admin_inbox_internal.create_message(p_category||' — Study Mode',btrim(p_content),p_category,'study_mode',null,null,p_question_id,topic);
 update public.admin_inbox_messages set sender_user_id=p_actor,submission_key=p_request_id,submission_hash=fingerprint
  where id=message_id returning submitted_at into submitted;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 return jsonb_build_object('id',message_id,'submittedAt',submitted);
end $$;
revoke all on function public.submit_study_suggestion_internal(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_study_suggestion_internal(uuid,uuid,uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
