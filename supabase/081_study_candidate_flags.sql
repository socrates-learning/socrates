-- Phase 5B: private, user-owned flags for Study Mode candidates.
-- Flags are intentionally isolated from feedback, attempts, mastery, sessions,
-- candidate eligibility, and scheduling priority.

begin;

create table public.study_candidate_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  question_id uuid null
    references public.questions(id) on delete cascade,
  personal_card_id uuid null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_candidate_flags_exactly_one_target_check
    check (num_nonnulls(question_id, personal_card_id) = 1),
  constraint study_candidate_flags_note_check
    check (
      note is null
      or (note = btrim(note) and char_length(note) <= 4000)
    ),
  constraint study_candidate_flags_user_question_key
    unique (user_id, question_id),
  constraint study_candidate_flags_user_personal_card_key
    unique (user_id, personal_card_id),
  constraint study_candidate_flags_personal_card_user_fkey
    foreign key (personal_card_id, user_id)
    references public.personal_cards(id, owner_id)
    on delete cascade
);

create or replace function public.prepare_study_candidate_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'A Study candidate flag cannot be transferred to another user';
  end if;

  new.note := nullif(btrim(coalesce(new.note, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger prepare_study_candidate_flag
  before insert or update on public.study_candidate_flags
  for each row execute function public.prepare_study_candidate_flag();

alter table public.study_candidate_flags enable row level security;

create policy "Users read own Study candidate flags"
  on public.study_candidate_flags
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users create own Study candidate flags"
  on public.study_candidate_flags
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users update own Study candidate flags"
  on public.study_candidate_flags
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  )
  with check (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users delete own Study candidate flags"
  on public.study_candidate_flags
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.study_candidate_flags
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.study_candidate_flags
  to authenticated;

revoke all on function public.prepare_study_candidate_flag()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
