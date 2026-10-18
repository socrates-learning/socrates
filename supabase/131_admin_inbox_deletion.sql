-- Manual Admin deletion only. 130 is reserved for the unpublished Contact candidate.
-- Apply after 128 and 129; this migration does not require or enable 130.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regprocedure('public.submit_study_suggestion_internal(uuid,uuid,uuid,uuid,text,text)') is null
  or to_regprocedure('public.save_admin_inbox_message(uuid,text,text,uuid)') is null then
  raise exception '131 requires postgres and Migrations 128 and 129';
 end if;
end $$;

-- Content-free retry/rate receipts, inaccessible to browser and service roles.
-- They preserve 129's duplicate and quota protections after a message is removed.
-- No subject, body, notes, sender contact, Question or Topic is retained here.
create table admin_inbox_internal.deleted_study_receipts (
 sender_user_id uuid not null references auth.users(id) on delete cascade,
 submission_key uuid not null,
 submission_hash text not null check (submission_hash ~ '^[0-9a-f]{64}$'),
 message_id uuid not null unique,
 submitted_at timestamptz not null,
 primary key (sender_user_id,submission_key)
);
create index deleted_study_receipts_sender_time_idx on admin_inbox_internal.deleted_study_receipts(sender_user_id,submitted_at desc);
alter table admin_inbox_internal.deleted_study_receipts enable row level security;
revoke all on admin_inbox_internal.deleted_study_receipts from public,anon,authenticated,service_role;

create function public.delete_admin_inbox_message(p_id uuid,p_expected_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare message public.admin_inbox_messages%rowtype;
begin
 if not public.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
 perform public.m127_assert_writable(auth.uid());
 if p_id is null or p_expected_revision is null then raise exception 'Message identity and revision required.' using errcode='22023'; end if;
 -- A row lock serializes deletion with revision-protected Admin saves/deletes.
 select * into message from public.admin_inbox_messages where id=p_id for update;
 if not found then
  -- Safe retry after a committed deletion whose acknowledgement was lost.
  return jsonb_build_object('id',p_id,'deleted',true);
 end if;
 if message.revision <> p_expected_revision then
  raise exception 'Message changed. Reload before deleting.' using errcode='40001';
 end if;
 if message.source='study_mode' and message.sender_user_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('study-suggestion:'||message.sender_user_id::text,0));
  if message.submission_key is not null and message.submission_hash is not null then
   insert into admin_inbox_internal.deleted_study_receipts(sender_user_id,submission_key,submission_hash,message_id,submitted_at)
   values(message.sender_user_id,message.submission_key,message.submission_hash,message.id,message.submitted_at);
  end if;
 end if;
 -- Notes and all submission details are columns of this same row.
 delete from public.admin_inbox_messages where id=message.id;
 return jsonb_build_object('id',p_id,'deleted',true);
end $$;
revoke all on function public.delete_admin_inbox_message(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_admin_inbox_message(uuid,uuid) to authenticated;

create or replace function public.submit_study_suggestion_internal(
 p_actor uuid, p_request_id uuid, p_library_id uuid, p_question_id uuid,
 p_category text, p_content text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 previous_sub text := current_setting('request.jwt.claim.sub',true);
 fingerprint text;
 existing record;
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
 -- A retry must not resurrect a message already removed by an Admin.
 select id,submitted_at,submission_hash into existing from (
  select id,submitted_at,submission_hash from public.admin_inbox_messages
   where sender_user_id=p_actor and submission_key=p_request_id
  union all
  select deleted.message_id,deleted.submitted_at,deleted.submission_hash from admin_inbox_internal.deleted_study_receipts deleted
   where deleted.sender_user_id=p_actor and deleted.submission_key=p_request_id
 ) receipts;
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
 if (select count(*) from (
     select submitted_at from public.admin_inbox_messages where sender_user_id=p_actor and source='study_mode'
     union all select submitted_at from admin_inbox_internal.deleted_study_receipts where sender_user_id=p_actor
    ) submissions where submitted_at > clock_timestamp()-interval '10 minutes') >= 5
  or (select count(*) from (
     select submitted_at from public.admin_inbox_messages where sender_user_id=p_actor and source='study_mode'
     union all select submitted_at from admin_inbox_internal.deleted_study_receipts where sender_user_id=p_actor
    ) submissions where submitted_at > clock_timestamp()-interval '24 hours') >= 20 then
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
