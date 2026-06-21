-- Link new review attempts to the article section being reviewed.

alter table public.review_attempts
  add column if not exists learn_section_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'review_attempts'
      and c.conname = 'review_attempts_learn_section_id_fkey'
  ) then
    alter table public.review_attempts
      add constraint review_attempts_learn_section_id_fkey
      foreign key (learn_section_id)
      references public.learn_sections(id)
      on delete set null;
  end if;
end
$migration$;

create index if not exists review_attempts_learn_section_id_idx
  on public.review_attempts(learn_section_id);
