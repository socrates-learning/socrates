-- Attach reusable sources to every concept created by the existing seed batches.
-- Compatible with both the base attribution schema and migration 012.

do $backfill$
declare
  owner_id uuid;
  openrn_source_id uuid;
  openstax_source_id uuid;
  hypertension_guideline_source_id uuid;
  heart_failure_guideline_source_id uuid;
  missing_concepts text;
begin
  select c.created_by
  into owner_id
  from public.concepts c
  where lower(c.name) = lower('ACE Inhibitors')
    and c.created_by is not null
  order by (c.status = 'published') desc, c.created_at desc
  limit 1;

  if owner_id is null then
    raise exception 'Seed content owner could not be resolved';
  end if;

  select id into openrn_source_id
  from public.sources
  where url = 'https://www.ncbi.nlm.nih.gov/books/NBK595000/'
  order by created_at
  limit 1;

  if openrn_source_id is null then
    insert into public.sources (
      title,
      author,
      source_type,
      notes,
      url,
      license,
      created_by
    )
    values (
      'Nursing Pharmacology',
      'Open Resources for Nursing (Open RN)',
      'open_educational_resource',
      'Reusable reference for cardiovascular and renal medication classes, monitoring, and adverse effects.',
      'https://www.ncbi.nlm.nih.gov/books/NBK595000/',
      'CC BY 4.0',
      owner_id
    )
    returning id into openrn_source_id;
  else
    update public.sources
    set
      title = 'Nursing Pharmacology',
      author = 'Open Resources for Nursing (Open RN)',
      source_type = 'open_educational_resource',
      notes = 'Reusable reference for cardiovascular and renal medication classes, monitoring, and adverse effects.',
      license = 'CC BY 4.0',
      created_by = coalesce(created_by, owner_id)
    where id = openrn_source_id;
  end if;

  select id into openstax_source_id
  from public.sources
  where url = 'https://openstax.org/details/books/anatomy-and-physiology-2e'
  order by created_at
  limit 1;

  if openstax_source_id is null then
    insert into public.sources (
      title,
      author,
      source_type,
      notes,
      url,
      license,
      created_by
    )
    values (
      'Anatomy and Physiology 2e',
      'OpenStax',
      'open_educational_resource',
      'Reusable reference for cardiovascular physiology, cardiac output, renal regulation, and RAAS.',
      'https://openstax.org/details/books/anatomy-and-physiology-2e',
      'CC BY-NC-SA 4.0',
      owner_id
    )
    returning id into openstax_source_id;
  else
    update public.sources
    set
      title = 'Anatomy and Physiology 2e',
      author = 'OpenStax',
      source_type = 'open_educational_resource',
      notes = 'Reusable reference for cardiovascular physiology, cardiac output, renal regulation, and RAAS.',
      license = 'CC BY-NC-SA 4.0',
      created_by = coalesce(created_by, owner_id)
    where id = openstax_source_id;
  end if;

  select id into hypertension_guideline_source_id
  from public.sources
  where url = 'https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline/top-things-to-know'
  order by created_at
  limit 1;

  if hypertension_guideline_source_id is null then
    insert into public.sources (
      title,
      author,
      source_type,
      notes,
      url,
      created_by
    )
    values (
      '2025 High Blood Pressure Guideline',
      'American Heart Association and American College of Cardiology',
      'other',
      'Clinical guideline reference for hypertension and antihypertensive treatment.',
      'https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline/top-things-to-know',
      owner_id
    )
    returning id into hypertension_guideline_source_id;
  else
    update public.sources
    set
      title = '2025 High Blood Pressure Guideline',
      author = 'American Heart Association and American College of Cardiology',
      source_type = 'other',
      notes = 'Clinical guideline reference for hypertension and antihypertensive treatment.',
      created_by = coalesce(created_by, owner_id)
    where id = hypertension_guideline_source_id;
  end if;

  select id into heart_failure_guideline_source_id
  from public.sources
  where url = 'https://professional.heart.org/en/science-news/2022-guideline-for-the-management-of-heart-failure'
  order by created_at
  limit 1;

  if heart_failure_guideline_source_id is null then
    insert into public.sources (
      title,
      author,
      source_type,
      notes,
      url,
      created_by
    )
    values (
      '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
      'American Heart Association, American College of Cardiology, and Heart Failure Society of America',
      'other',
      'Clinical guideline reference for heart failure and guideline-directed medication therapy.',
      'https://professional.heart.org/en/science-news/2022-guideline-for-the-management-of-heart-failure',
      owner_id
    )
    returning id into heart_failure_guideline_source_id;
  else
    update public.sources
    set
      title = '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
      author = 'American Heart Association, American College of Cardiology, and Heart Failure Society of America',
      source_type = 'other',
      notes = 'Clinical guideline reference for heart failure and guideline-directed medication therapy.',
      created_by = coalesce(created_by, owner_id)
    where id = heart_failure_guideline_source_id;
  end if;

  insert into public.content_source_notes (
    source_id,
    concept_id,
    learn_section_id,
    note,
    created_by
  )
  select
    mapping.source_id,
    concept.id,
    null,
    mapping.note,
    coalesce(concept.created_by, owner_id)
  from (
    values
      (openrn_source_id, 'ACE Inhibitors', 'Supports medication-class mechanism, use, monitoring, and safety content.'),
      (openrn_source_id, 'ARBs', 'Supports medication-class mechanism, use, monitoring, and safety content.'),
      (openrn_source_id, 'Beta Blockers', 'Supports beta-blocker mechanism, use, monitoring, and safety content.'),
      (openrn_source_id, 'Calcium Channel Blockers', 'Supports calcium channel blocker mechanism, use, monitoring, and safety content.'),
      (openrn_source_id, 'Thiazide Diuretics', 'Supports thiazide mechanism, use, electrolyte monitoring, and safety content.'),
      (openrn_source_id, 'Loop Diuretics', 'Supports loop diuretic mechanism, use, electrolyte monitoring, and safety content.'),
      (openrn_source_id, 'Hyperkalemia', 'Supports potassium monitoring in cardiovascular and renal medication therapy.'),
      (openrn_source_id, 'Hypokalemia', 'Supports potassium monitoring and diuretic-related safety content.'),

      (openstax_source_id, 'Cardiac Output', 'Supports cardiac output and cardiovascular physiology content.'),
      (openstax_source_id, 'Renin-Angiotensin-Aldosterone System', 'Supports renal regulation, blood pressure, and RAAS physiology content.'),
      (openstax_source_id, 'Heart Failure', 'Supports foundational cardiovascular physiology used in this concept.'),
      (openstax_source_id, 'Hypertension', 'Supports foundational blood pressure and cardiovascular physiology content.'),

      (hypertension_guideline_source_id, 'Hypertension', 'Supports current hypertension definitions and treatment context.'),
      (hypertension_guideline_source_id, 'ACE Inhibitors', 'Supports the antihypertensive treatment context for this drug class.'),
      (hypertension_guideline_source_id, 'ARBs', 'Supports the antihypertensive treatment context for this drug class.'),
      (hypertension_guideline_source_id, 'Beta Blockers', 'Supports the antihypertensive treatment context for this drug class.'),
      (hypertension_guideline_source_id, 'Calcium Channel Blockers', 'Supports the antihypertensive treatment context for this drug class.'),
      (hypertension_guideline_source_id, 'Thiazide Diuretics', 'Supports the antihypertensive treatment context for this drug class.'),

      (heart_failure_guideline_source_id, 'Heart Failure', 'Supports current heart failure classification and treatment context.'),
      (heart_failure_guideline_source_id, 'ACE Inhibitors', 'Supports this drug class in guideline-directed heart failure therapy.'),
      (heart_failure_guideline_source_id, 'ARBs', 'Supports this drug class in guideline-directed heart failure therapy.'),
      (heart_failure_guideline_source_id, 'Beta Blockers', 'Supports this drug class in guideline-directed heart failure therapy.'),
      (heart_failure_guideline_source_id, 'Loop Diuretics', 'Supports diuretic use for congestion in heart failure.'),
      (heart_failure_guideline_source_id, 'Cardiac Output', 'Supports the heart failure context for impaired cardiac performance.')
  ) as mapping(source_id, concept_name, note)
  join public.concepts concept
    on lower(concept.name) = lower(mapping.concept_name)
  on conflict (source_id, concept_id)
    where concept_id is not null
  do update
  set note = excluded.note;

  select string_agg(c.name || ' [' || c.id::text || ']', ', ' order by c.name)
  into missing_concepts
  from public.concepts c
  where lower(c.name) in (
    lower('ACE Inhibitors'),
    lower('ARBs'),
    lower('Beta Blockers'),
    lower('Calcium Channel Blockers'),
    lower('Cardiac Output'),
    lower('Heart Failure'),
    lower('Hyperkalemia'),
    lower('Hypertension'),
    lower('Hypokalemia'),
    lower('Loop Diuretics'),
    lower('Renin-Angiotensin-Aldosterone System'),
    lower('Thiazide Diuretics')
  )
  and not exists (
    select 1
    from public.content_source_notes csn
    where csn.concept_id = c.id
  );

  if missing_concepts is not null then
    raise exception 'Seed attribution backfill incomplete: %', missing_concepts;
  end if;
end
$backfill$;
