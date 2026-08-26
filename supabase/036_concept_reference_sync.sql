-- Safe Concept Creator reference synchronization.
-- Creates new reusable sources when needed and synchronizes only the
-- concept/source associations for the supplied concept. Shared sources are
-- never deleted or silently updated by this function.

create or replace function public.sync_concept_references(
  p_concept_id uuid,
  p_references jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_references jsonb := coalesce(p_references, '[]'::jsonb);
  reference_record jsonb;
  client_reference_id text;
  requested_source_id uuid;
  target_source_id uuid;
  target_attribution_id uuid;
  source_title text;
  generated_source_key text;
  selected_source_ids uuid[] := array[]::uuid[];
  synchronized_references jsonb := '[]'::jsonb;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save concept references';
  end if;

  if p_concept_id is null
     or not exists (
       select 1
       from public.concepts c
       where c.id = p_concept_id
     ) then
    raise exception 'Concept was not found';
  end if;

  if jsonb_typeof(normalized_references) <> 'array' then
    raise exception 'Concept references must be a JSON array';
  end if;

  for reference_record in
    select value
    from jsonb_array_elements(normalized_references)
  loop
    if jsonb_typeof(reference_record) <> 'object' then
      raise exception 'Each concept reference must be a JSON object';
    end if;

    client_reference_id := nullif(btrim(reference_record ->> 'client_id'), '');
    if client_reference_id is null then
      raise exception 'Each concept reference requires a client identifier';
    end if;

    requested_source_id := null;
    target_source_id := null;
    target_attribution_id := null;

    if nullif(btrim(reference_record ->> 'source_id'), '') is not null then
      requested_source_id := (reference_record ->> 'source_id')::uuid;

      select s.id
      into target_source_id
      from public.sources s
      where s.id = requested_source_id;

      if target_source_id is null then
        raise exception 'A referenced source was not found';
      end if;
    else
      source_title := nullif(btrim(reference_record ->> 'title'), '');
      if source_title is null then
        raise exception 'New references require a source title';
      end if;

      -- The concept/client pair gives retries a stable source identity without
      -- applying unsafe global title-only deduplication.
      generated_source_key :=
        'concept-reference:' || p_concept_id::text || ':' || client_reference_id;

      select s.id
      into target_source_id
      from public.sources s
      where s.source_key = generated_source_key;

      if target_source_id is null then
        insert into public.sources (
          source_key,
          title,
          author,
          url,
          created_by
        )
        values (
          generated_source_key,
          source_title,
          nullif(btrim(reference_record ->> 'author'), ''),
          nullif(btrim(reference_record ->> 'url'), ''),
          caller_id
        )
        on conflict (source_key) do nothing
        returning id into target_source_id;

        if target_source_id is null then
          select s.id
          into target_source_id
          from public.sources s
          where s.source_key = generated_source_key;
        end if;
      end if;
    end if;

    if target_source_id = any(selected_source_ids) then
      raise exception 'A source may only be attached once to a concept';
    end if;

    selected_source_ids := array_append(selected_source_ids, target_source_id);

    insert into public.content_source_notes (
      source_id,
      concept_id,
      learn_section_id,
      note,
      created_by
    )
    values (
      target_source_id,
      p_concept_id,
      null,
      nullif(btrim(reference_record ->> 'note'), ''),
      caller_id
    )
    on conflict (source_id, concept_id)
      where concept_id is not null
    do update
    set note = excluded.note
    returning id into target_attribution_id;

    synchronized_references := synchronized_references || jsonb_build_array(
      jsonb_build_object(
        'client_id', client_reference_id,
        'source_id', target_source_id,
        'attribution_id', target_attribution_id
      )
    );
  end loop;

  -- Synchronize only concept-level links. Removing a link never deletes the
  -- reusable public.sources row or any article/question attribution.
  delete from public.content_source_notes csn
  where csn.concept_id = p_concept_id
    and csn.learn_section_id is null
    and (
      csn.source_id is null
      or cardinality(selected_source_ids) = 0
      or not csn.source_id = any(selected_source_ids)
    );

  return jsonb_build_object(
    'concept_id', p_concept_id,
    'references', synchronized_references
  );
end;
$$;

revoke all on function public.sync_concept_references(
  uuid,
  jsonb
) from public;

grant execute on function public.sync_concept_references(
  uuid,
  jsonb
) to authenticated;
