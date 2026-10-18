-- Admin-only Inbox storage. No public submission endpoint or integration.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regprocedure('public.account_is_active()') is null then
  raise exception '128 requires postgres and released account-deletion safeguards';
 end if;
end $$;

create table public.admin_inbox_messages (
 id uuid primary key default gen_random_uuid(),
 subject text not null check (subject = btrim(subject) and char_length(subject) between 1 and 200),
 content text not null check (content = btrim(content) and char_length(content) between 1 and 20000),
 category text not null check (category in ('Account Assistance','Technical Support','New Topic','Content Correction','Feature Suggestion','Other')),
 -- Text, rather than an enum, permits additional trusted integrations later.
 source text not null check (source ~ '^[a-z][a-z0-9_]{0,49}$'),
 sender_name text check (sender_name = btrim(sender_name) and char_length(sender_name) between 1 and 200),
 sender_contact text check (sender_contact = btrim(sender_contact) and char_length(sender_contact) between 1 and 320),
 question_id uuid references public.questions(id) on delete set null,
 topic_id uuid references public.library_nodes(id) on delete set null,
 submitted_at timestamptz not null default now(),
 status text not null default 'New' check (status in ('New','In Review','Resolved')),
 admin_notes text not null default '' check (char_length(admin_notes) <= 10000),
 updated_at timestamptz not null default now(),
 revision uuid not null default gen_random_uuid()
);
create index admin_inbox_submitted_idx on public.admin_inbox_messages(submitted_at desc, id desc);
create index admin_inbox_question_idx on public.admin_inbox_messages(question_id) where question_id is not null;
create index admin_inbox_topic_idx on public.admin_inbox_messages(topic_id) where topic_id is not null;
alter table public.admin_inbox_messages enable row level security;
revoke all on public.admin_inbox_messages from public, anon, authenticated, service_role;
grant select on public.admin_inbox_messages to authenticated;
create policy admin_inbox_admin_read on public.admin_inbox_messages for select to authenticated
 using ((select public.is_admin()));

-- Private schema is NOT exposed through the Data API. Trusted server SQL only;
-- service_role can create a record but cannot directly read/update/delete rows.
create schema admin_inbox_internal;
revoke all on schema admin_inbox_internal from public, anon, authenticated, service_role;
grant usage on schema admin_inbox_internal to service_role;

create function admin_inbox_internal.create_message(
 p_subject text, p_content text, p_category text, p_source text,
 p_sender_name text default null, p_sender_contact text default null,
 p_question_id uuid default null, p_topic_id uuid default null,
 p_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if p_topic_id is not null and not exists (
  select 1 from public.library_nodes where id = p_topic_id and node_type = 'topic'
 ) then raise exception 'Associated Topic is unavailable.' using errcode = '22023'; end if;
 insert into public.admin_inbox_messages(id,subject,content,category,source,sender_name,sender_contact,question_id,topic_id)
 values(p_id,btrim(p_subject),btrim(p_content),p_category,p_source,
  nullif(btrim(p_sender_name),''),nullif(btrim(p_sender_contact),''),p_question_id,p_topic_id)
 returning id into result;
 return result;
end $$;

create function public.get_admin_inbox_messages()
returns setof public.admin_inbox_messages language plpgsql stable security invoker set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Admin access required.' using errcode = '42501'; end if;
 return query select * from public.admin_inbox_messages order by submitted_at desc, id desc;
end $$;

create function public.save_admin_inbox_message(p_id uuid, p_status text, p_admin_notes text, p_expected_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.admin_inbox_messages%rowtype;
begin
 if not public.is_admin() then raise exception 'Admin access required.' using errcode = '42501'; end if;
 -- Keep writes fenced during account deletion, like the existing application.
 perform public.m127_assert_writable(auth.uid());
 if p_status is null or p_status not in ('New','In Review','Resolved')
    or p_admin_notes is null or char_length(p_admin_notes) > 10000 then
  raise exception 'Invalid message status or administrator notes.' using errcode = '22023';
 end if;
 update public.admin_inbox_messages m set status=p_status,admin_notes=p_admin_notes,
  updated_at=clock_timestamp(),revision=gen_random_uuid()
 where m.id=p_id and m.revision=p_expected_revision returning m.* into result;
 if result.id is null then
  raise exception 'This message changed or is unavailable. Reload it before saving.' using errcode = '40001';
 end if;
 return to_jsonb(result);
end $$;

revoke all on function admin_inbox_internal.create_message(text,text,text,text,text,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function admin_inbox_internal.create_message(text,text,text,text,text,text,uuid,uuid,uuid) to service_role;
revoke all on function public.get_admin_inbox_messages(),public.save_admin_inbox_message(uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_inbox_messages(),public.save_admin_inbox_message(uuid,text,text,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
