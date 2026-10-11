-- Private learner annotations, independent of official content and learning evidence.
begin;

create table public.personal_question_notes (
 user_id uuid not null references auth.users(id) on delete cascade,
 question_id uuid not null references public.questions(id) on delete cascade,
 note text not null check (note = btrim(note) and char_length(note) between 1 and 4000),
 revision uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (user_id, question_id)
);
create index personal_question_notes_question_idx on public.personal_question_notes(question_id);
alter table public.personal_question_notes enable row level security;
revoke all on public.personal_question_notes from public, anon, authenticated, service_role;
grant select on public.personal_question_notes to authenticated;
create policy personal_question_notes_owner_read on public.personal_question_notes
 for select to authenticated using (user_id = (select auth.uid()) and public.has_socrates_role());

-- Never accept an actor supplied by the browser. Only published official
-- material in an accessible, active Library can be opened or annotated.
create function public.m125_require_question(p_library_id uuid, p_question_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare u uuid := (select auth.uid());
begin
 if u is null or not public.has_socrates_role() or not exists (
  select 1 from public.questions q
  join public.concepts c on c.id = q.concept_id and c.status = 'published'
  join public.concept_placements p on p.concept_id = c.id
  join public.library_nodes n on n.id = p.library_node_id
  join public.libraries l on l.id = n.library_id and l.status = 'active'
  where q.id = p_question_id and q.status = 'published' and l.id = p_library_id
  and (public.is_editor_or_admin() or exists (
   select 1 from public.user_libraries m where m.user_id = u and m.library_id = l.id
  ))
 ) then raise exception 'Question notes are unavailable.' using errcode = '42501'; end if;
 return u;
end $$;

create function public.get_my_question_note(p_library_id uuid, p_question_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public.m125_require_question(p_library_id, p_question_id);
begin
 return (select jsonb_build_object('question_id', n.question_id, 'note', n.note, 'revision', n.revision)
  from public.personal_question_notes n where n.user_id = u and n.question_id = p_question_id);
end $$;

create function public.save_my_question_note(p_library_id uuid, p_question_id uuid, p_note text, p_expected_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public.m125_require_question(p_library_id, p_question_id);
 result public.personal_question_notes%rowtype;
begin
 if p_note is null or char_length(btrim(p_note)) not between 1 and 4000 then
  raise exception 'Enter a note of 1 to 4000 characters.' using errcode = '22023';
 end if;
 if p_expected_revision is null then
  insert into public.personal_question_notes(user_id, question_id, note)
   values (u, p_question_id, btrim(p_note)) on conflict do nothing returning * into result;
 else
  update public.personal_question_notes n set note = btrim(p_note), revision = gen_random_uuid(), updated_at = now()
   where n.user_id = u and n.question_id = p_question_id and n.revision = p_expected_revision returning n.* into result;
 end if;
 if result.user_id is null then
  raise exception 'Your note changed. Reload it before saving.' using errcode = '40001';
 end if;
 return jsonb_build_object('question_id', result.question_id, 'note', result.note, 'revision', result.revision);
end $$;

create function public.delete_my_question_note(p_library_id uuid, p_question_id uuid, p_expected_revision uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public.m125_require_question(p_library_id, p_question_id);
begin
 delete from public.personal_question_notes n where n.user_id = u and n.question_id = p_question_id and n.revision = p_expected_revision;
 if not found then raise exception 'Your note changed. Reload it before removing.' using errcode = '40001'; end if;
end $$;

revoke all on function public.m125_require_question(uuid, uuid),
 public.get_my_question_note(uuid, uuid), public.save_my_question_note(uuid, uuid, text, uuid),
 public.delete_my_question_note(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_my_question_note(uuid, uuid),
 public.save_my_question_note(uuid, uuid, text, uuid), public.delete_my_question_note(uuid, uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
