-- Heart Failure Physiology content batch.
-- Requires 012_batch_source_attribution.sql and the canonical sources from 013.

do $batch$
declare
  owner_id uuid;
  heart_failure_id uuid;
  current_concept_id uuid;
  section_id uuid;
  concept_record jsonb;
  section_record jsonb;
  source_payload jsonb;
  openstax_source public.sources%rowtype;
  heart_failure_guideline_source public.sources%rowtype;
  openrn_source public.sources%rowtype;
begin
  select c.id, c.created_by
  into heart_failure_id, owner_id
  from public.concepts c
  where lower(c.name) = lower('Heart Failure')
    and c.created_by is not null
  order by (c.status = 'published') desc, c.created_at desc
  limit 1;

  if heart_failure_id is null or owner_id is null then
    raise exception 'Published Heart Failure seed concept and owner are required';
  end if;

  if (
    select count(*)
    from public.sources
    where url = 'https://openstax.org/details/books/anatomy-and-physiology-2e'
  ) <> 1 then
    raise exception 'Expected exactly one canonical OpenStax Anatomy and Physiology 2e source';
  end if;

  if (
    select count(*)
    from public.sources
    where url = 'https://professional.heart.org/en/science-news/2022-guideline-for-the-management-of-heart-failure'
  ) <> 1 then
    raise exception 'Expected exactly one canonical 2022 heart failure guideline source';
  end if;

  if (
    select count(*)
    from public.sources
    where url = 'https://www.ncbi.nlm.nih.gov/books/NBK595000/'
  ) <> 1 then
    raise exception 'Expected exactly one canonical OpenRN Nursing Pharmacology source';
  end if;

  select *
  into openstax_source
  from public.sources
  where url = 'https://openstax.org/details/books/anatomy-and-physiology-2e';

  select *
  into heart_failure_guideline_source
  from public.sources
  where url = 'https://professional.heart.org/en/science-news/2022-guideline-for-the-management-of-heart-failure';

  select *
  into openrn_source
  from public.sources
  where url = 'https://www.ncbi.nlm.nih.gov/books/NBK595000/';

  for concept_record in
    select value
    from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object(
        'name', 'Ejection Fraction',
        'concept_type', 'Physiology',
        'importance', 'High',
        'difficulty', 'Beginner',
        'estimated_time', '10 min',
        'summary', 'Ejection fraction is the percentage of blood in a ventricle that leaves with each contraction.',
        'why_it_matters', 'It helps describe left ventricular pumping performance and guides classification of heart failure.',
        'sources', jsonb_build_array('openstax', 'guideline'),
        'sort_order', 10,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Ejection fraction compares the amount ejected during systole with the amount present at the end of filling. It is usually reported for the left ventricle as a percentage.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Ejection fraction equals stroke volume divided by end-diastolic volume. It can fall when contraction weakens or when ventricular loading conditions change.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Clinicians use ejection fraction to help classify heart failure, choose certain therapies, and follow changes in ventricular function.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Ejection fraction itself does not cause harm. A reduced value may accompany low forward flow, congestion, exercise intolerance, and higher arrhythmia risk.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply to the concept. The imaging method used to estimate it may have separate limitations.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Ejection fraction is a percentage, while stroke volume is an amount of blood. A preserved ejection fraction does not guarantee normal filling or normal cardiac output.')
        )
      ),
      jsonb_build_object(
        'name', 'Stroke Volume',
        'concept_type', 'Physiology',
        'importance', 'High',
        'difficulty', 'Beginner',
        'estimated_time', '10 min',
        'summary', 'Stroke volume is the amount of blood one ventricle ejects during a single heartbeat.',
        'why_it_matters', 'Stroke volume links ventricular filling and contraction to cardiac output and tissue perfusion.',
        'sources', jsonb_build_array('openstax'),
        'sort_order', 11,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Stroke volume is the difference between end-diastolic volume and end-systolic volume. It changes from beat to beat as filling, resistance, and contractile strength change.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Preload, afterload, and contractility are major determinants. More effective filling and contraction tend to raise stroke volume, while excessive resistance to ejection tends to lower it.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Stroke volume helps explain changes in cardiac output, pulse pressure, perfusion, and response to fluids or cardiovascular treatment.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'A low stroke volume can reduce organ perfusion. An excessive volume load can increase cardiac work and contribute to congestion in a vulnerable heart.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply because stroke volume is a physiologic measurement, not a treatment.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Stroke volume is blood ejected per beat. Cardiac output is blood ejected per minute and also depends on heart rate.')
        )
      ),
      jsonb_build_object(
        'name', 'Preload',
        'concept_type', 'Physiology',
        'importance', 'High',
        'difficulty', 'Intermediate',
        'estimated_time', '10 min',
        'summary', 'Preload describes ventricular muscle stretch near the end of filling, before contraction begins.',
        'why_it_matters', 'Too little preload can limit output, while too much can worsen venous and pulmonary congestion.',
        'sources', jsonb_build_array('openstax', 'guideline'),
        'sort_order', 12,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Preload reflects how much the ventricle is filled and stretched at end diastole. Venous return, blood volume, and ventricular compliance all influence it.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Within a useful range, greater filling stretches cardiac fibers and can strengthen the next contraction. In heart failure, extra filling pressure may produce congestion without a meaningful rise in output.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Preload is considered when evaluating volume status, jugular venous pressure, edema, lung congestion, and response to fluids or diuretics.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Excessive preload can raise venous and pulmonary pressures. Inadequate preload can reduce stroke volume and blood pressure.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply to preload itself. Attempts to increase preload can be harmful when congestion is already present.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Preload concerns filling before contraction. Afterload is the resistance the ventricle must overcome during ejection.')
        )
      ),
      jsonb_build_object(
        'name', 'Afterload',
        'concept_type', 'Physiology',
        'importance', 'High',
        'difficulty', 'Intermediate',
        'estimated_time', '10 min',
        'summary', 'Afterload is the force the ventricle must overcome to eject blood.',
        'why_it_matters', 'High afterload increases cardiac work and can reduce stroke volume in a weakened ventricle.',
        'sources', jsonb_build_array('openstax', 'guideline'),
        'sort_order', 13,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Afterload is shaped by arterial pressure, vascular resistance, outflow obstruction, and ventricular wall stress. It is not identical to blood pressure, but blood pressure is an important contributor.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'The ventricle must generate enough pressure to open the outflow valve and move blood forward. A larger opposing load leaves more blood behind after systole and may lower stroke volume.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Afterload helps explain why hypertension and valve obstruction strain the heart and why selected vasodilators can improve forward flow.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Persistently high afterload can promote ventricular hypertrophy, greater oxygen demand, and worsening pump performance.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply to the concept. Excessive therapeutic afterload reduction can cause hypotension or impaired perfusion.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Afterload opposes ejection. Preload describes filling, and contractility describes the intrinsic strength of contraction.')
        )
      ),
      jsonb_build_object(
        'name', 'Contractility',
        'concept_type', 'Physiology',
        'importance', 'High',
        'difficulty', 'Intermediate',
        'estimated_time', '10 min',
        'summary', 'Contractility is the intrinsic ability of cardiac muscle to generate force at a given load.',
        'why_it_matters', 'Reduced contractility is a major reason stroke volume and ejection fraction fall in systolic heart failure.',
        'sources', jsonb_build_array('openstax', 'guideline'),
        'sort_order', 14,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Contractility describes contraction strength apart from changes in filling and resistance. Sympathetic stimulation and intracellular calcium are important influences.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Calcium binding within cardiac cells allows actin and myosin to generate force. More available calcium generally strengthens contraction, while ischemia or damaged myocardium can weaken it.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Contractility helps explain reduced systolic function, the action of inotropic drugs, and changes in stroke volume during acute illness.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Poor contractility can cause low output and congestion. Excessive stimulation can raise oxygen demand and increase arrhythmia risk.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply to the physiologic property. Drugs that increase contractility require careful use because their risks vary by clinical setting.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Contractility is intrinsic muscle performance. It is different from preload, afterload, heart rate, and the measured ejection fraction.')
        )
      ),
      jsonb_build_object(
        'name', 'Venous Return',
        'concept_type', 'Physiology',
        'importance', 'High',
        'difficulty', 'Intermediate',
        'estimated_time', '10 min',
        'summary', 'Venous return is the flow of blood back to the right atrium.',
        'why_it_matters', 'It supplies ventricular filling and connects blood volume, venous tone, and body position to cardiac output.',
        'sources', jsonb_build_array('openstax'),
        'sort_order', 15,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Venous return depends on the pressure gradient toward the right atrium and the resistance within the venous circulation. Muscle pumping, breathing, and venous valves help move blood centrally.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Blood flows toward the chest when peripheral venous pressure exceeds right atrial pressure. Venoconstriction and increased blood volume can shift more blood toward the heart.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Venous return helps explain changes caused by standing, hemorrhage, positive-pressure ventilation, fluid administration, and venodilator therapy.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Too little venous return can reduce preload and output. Excess return to a failing heart can increase filling pressures and congestion.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply because venous return is a normal physiologic process.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Venous return is flow back to the heart. Preload is the resulting ventricular stretch and filling state near end diastole.')
        )
      ),
      jsonb_build_object(
        'name', 'Fluid Overload',
        'concept_type', 'Pathophysiology',
        'importance', 'High',
        'difficulty', 'Beginner',
        'estimated_time', '12 min',
        'summary', 'Fluid overload is excess retained sodium and water that expands vascular and tissue fluid volume.',
        'why_it_matters', 'It is a common driver of edema, breathlessness, hospitalization, and weight gain in heart failure.',
        'sources', jsonb_build_array('openstax', 'guideline', 'openrn'),
        'sort_order', 16,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Fluid overload occurs when intake and retention exceed effective removal. Findings may include rapid weight gain, peripheral edema, elevated neck veins, abdominal fullness, and lung congestion.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Reduced effective circulation activates sodium- and water-retaining pathways. Rising venous pressure then pushes fluid from vessels into tissues and may further impair organ function.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Daily weight, symptoms, edema, lung findings, urine output, and laboratory trends help assess congestion and response to diuretic therapy.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Complications include pulmonary edema, impaired oxygenation, skin injury, abdominal congestion, reduced mobility, and worsening heart or kidney function.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply to the condition. Treatment intensity must account for blood pressure, kidney function, and electrolyte balance.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Fluid overload describes excess total fluid and congestion. Edema is one possible sign and may also occur from local venous, lymphatic, or protein disorders.')
        )
      ),
      jsonb_build_object(
        'name', 'Pulmonary Edema',
        'concept_type', 'Pathophysiology',
        'importance', 'High',
        'difficulty', 'Intermediate',
        'estimated_time', '12 min',
        'summary', 'Pulmonary edema is excess fluid in lung tissue and air spaces that interferes with gas exchange.',
        'why_it_matters', 'Acute pulmonary edema can cause severe breathing difficulty and requires rapid assessment and treatment.',
        'sources', jsonb_build_array('openstax', 'guideline', 'openrn'),
        'sort_order', 17,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Pulmonary edema commonly develops when pressure rises behind the left side of the heart. Patients may have shortness of breath, orthopnea, crackles, low oxygen levels, or frothy sputum.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Elevated pulmonary capillary pressure drives fluid into the interstitial space and then the alveoli. The added fluid reduces lung compliance and increases the distance for oxygen diffusion.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Recognition relies on symptoms, oxygenation, examination, imaging, and the clinical context. Management targets oxygenation, congestion, blood pressure, and the underlying cause.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Severe pulmonary edema can lead to respiratory failure, marked sympathetic stress, reduced exercise capacity, and impaired organ oxygen delivery.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply to the condition. Individual treatments have contraindications based on blood pressure, kidney function, and other patient factors.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Cardiogenic pulmonary edema results from elevated cardiac filling pressure. Noncardiogenic edema results from increased lung permeability without the same pressure mechanism.')
        )
      ),
      jsonb_build_object(
        'name', 'BNP',
        'concept_type', 'Biomarker',
        'importance', 'High',
        'difficulty', 'Intermediate',
        'estimated_time', '10 min',
        'summary', 'B-type natriuretic peptide is a hormone released when ventricular walls are stretched.',
        'why_it_matters', 'BNP can support evaluation of suspected heart failure when interpreted with symptoms, examination, and other tests.',
        'sources', jsonb_build_array('openstax', 'guideline'),
        'sort_order', 18,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'BNP and the related marker NT-proBNP rise when cardiac wall stress increases. A laboratory value is useful only in the context of the patient and the assay used.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Ventricular stretch stimulates release of natriuretic peptides. Their physiologic actions favor sodium loss, water loss, and lower vascular tone, although these effects may not fully offset heart failure pathways.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'BNP testing can help evaluate unexplained breathlessness, estimate risk, and support assessment of heart failure. Serial interpretation may be useful in selected settings.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'BNP measurement does not cause disease. Misinterpretation can lead to incorrect conclusions because age, kidney function, rhythm, body size, and acute illness can alter levels.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'There are no concept-specific contraindications to BNP measurement. Standard considerations for blood sampling still apply.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'BNP is a biomarker of wall stress, not a direct measurement of fluid volume or ejection fraction. NT-proBNP is a related but numerically different laboratory test.')
        )
      ),
      jsonb_build_object(
        'name', 'Cardiac Remodeling',
        'concept_type', 'Pathophysiology',
        'importance', 'High',
        'difficulty', 'Intermediate',
        'estimated_time', '12 min',
        'summary', 'Cardiac remodeling is a lasting change in heart size, shape, structure, or function after chronic stress or injury.',
        'why_it_matters', 'Maladaptive remodeling can create a cycle of rising wall stress, weaker pumping, valve leakage, and worsening heart failure.',
        'sources', jsonb_build_array('openstax', 'guideline'),
        'sort_order', 19,
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Overview', 'body', 'Remodeling may include chamber dilation, wall thickening, fibrosis, and changes in cell function. Some early changes preserve output, but persistent stress can make the heart less efficient.'),
          jsonb_build_object('title', 'Mechanism', 'body', 'Pressure, volume, ischemic injury, and neurohormonal activation alter cardiac cells and extracellular tissue. These changes increase wall stress and can promote further dilation or stiffness.'),
          jsonb_build_object('title', 'Clinical Uses', 'body', 'Imaging helps follow chamber size, wall thickness, valve function, and ejection fraction. Heart failure therapies may slow or partly reverse harmful remodeling.'),
          jsonb_build_object('title', 'Adverse Effects', 'body', 'Maladaptive remodeling can reduce systolic or diastolic performance, worsen functional valve regurgitation, and increase arrhythmia and congestion risk.'),
          jsonb_build_object('title', 'Contraindications', 'body', 'No contraindications apply because remodeling is a disease process rather than an intervention.'),
          jsonb_build_object('title', 'Key Distinctions', 'body', 'Remodeling is a structural and functional process over time. Hypertrophy and dilation are individual patterns that may occur within that broader process.')
        )
      )
    ))
  loop
    source_payload := '[]'::jsonb;

    if (concept_record -> 'sources') ? 'openstax' then
      source_payload := source_payload || jsonb_build_array(jsonb_build_object(
        'source_key', openstax_source.source_key,
        'title', openstax_source.title,
        'author', openstax_source.author,
        'edition', openstax_source.edition,
        'source_type', openstax_source.source_type,
        'notes', openstax_source.notes,
        'url', openstax_source.url,
        'license', openstax_source.license,
        'note', 'Supports the cardiovascular anatomy and physiology in this concept.'
      ));
    end if;

    if (concept_record -> 'sources') ? 'guideline' then
      source_payload := source_payload || jsonb_build_array(jsonb_build_object(
        'source_key', heart_failure_guideline_source.source_key,
        'title', heart_failure_guideline_source.title,
        'author', heart_failure_guideline_source.author,
        'edition', heart_failure_guideline_source.edition,
        'source_type', heart_failure_guideline_source.source_type,
        'notes', heart_failure_guideline_source.notes,
        'url', heart_failure_guideline_source.url,
        'license', heart_failure_guideline_source.license,
        'note', 'Supports the heart failure definitions, evaluation, and clinical context in this concept.'
      ));
    end if;

    if (concept_record -> 'sources') ? 'openrn' then
      source_payload := source_payload || jsonb_build_array(jsonb_build_object(
        'source_key', openrn_source.source_key,
        'title', openrn_source.title,
        'author', openrn_source.author,
        'edition', openrn_source.edition,
        'source_type', openrn_source.source_type,
        'notes', openrn_source.notes,
        'url', openrn_source.url,
        'license', openrn_source.license,
        'note', 'Supports clinical monitoring, congestion, and medication-related context in this concept.'
      ));
    end if;

    current_concept_id := public.import_seed_concept(
      jsonb_build_object(
        'name', concept_record ->> 'name',
        'concept_type', concept_record ->> 'concept_type',
        'importance', concept_record ->> 'importance',
        'difficulty', concept_record ->> 'difficulty',
        'estimated_time', concept_record ->> 'estimated_time',
        'summary', concept_record ->> 'summary',
        'why_it_matters', concept_record ->> 'why_it_matters',
        'created_by', owner_id,
        'is_public', true,
        'status', 'published'
      ),
      source_payload
    );

    update public.concepts
    set
      concept_type = concept_record ->> 'concept_type',
      importance = concept_record ->> 'importance',
      difficulty = concept_record ->> 'difficulty',
      estimated_time = concept_record ->> 'estimated_time',
      summary = concept_record ->> 'summary',
      why_it_matters = concept_record ->> 'why_it_matters',
      is_public = true,
      status = 'published',
      updated_at = now()
    where id = current_concept_id;

    for section_record in
      select value from jsonb_array_elements(concept_record -> 'sections')
    loop
      section_id := null;

      update public.learn_sections
      set
        body = section_record ->> 'body',
        sort_order = case section_record ->> 'title'
          when 'Overview' then 0
          when 'Mechanism' then 1
          when 'Clinical Uses' then 2
          when 'Adverse Effects' then 3
          when 'Contraindications' then 4
          when 'Key Distinctions' then 5
        end,
        created_by = owner_id,
        updated_at = now()
      where learn_sections.concept_id = current_concept_id
        and lower(learn_sections.title) = lower(section_record ->> 'title')
      returning id into section_id;

      if section_id is null then
        insert into public.learn_sections (
          concept_id,
          title,
          body,
          sort_order,
          created_by
        )
        values (
          current_concept_id,
          section_record ->> 'title',
          section_record ->> 'body',
          case section_record ->> 'title'
            when 'Overview' then 0
            when 'Mechanism' then 1
            when 'Clinical Uses' then 2
            when 'Adverse Effects' then 3
            when 'Contraindications' then 4
            when 'Key Distinctions' then 5
          end,
          owner_id
        );
      end if;
    end loop;

    insert into public.concept_placements (
      concept_id,
      library_node_id,
      sort_order
    )
    select
      current_concept_id,
      hf_placement.library_node_id,
      (concept_record ->> 'sort_order')::integer
    from public.concept_placements hf_placement
    where hf_placement.concept_id = heart_failure_id
    on conflict (concept_id, library_node_id) do update
    set sort_order = excluded.sort_order;
  end loop;

  insert into public.concept_relationships (
    source_concept_id,
    target_concept_id,
    relationship_type,
    created_by
  )
  select
    source_concept.id,
    target_concept.id,
    relationship.relationship_type,
    owner_id
  from (
    values
      ('Heart Failure', 'Ejection Fraction', 'related_to'),
      ('Ejection Fraction', 'Stroke Volume', 'related_to'),
      ('Stroke Volume', 'Preload', 'related_to'),
      ('Stroke Volume', 'Afterload', 'related_to'),
      ('Stroke Volume', 'Contractility', 'related_to'),
      ('Cardiac Output', 'Stroke Volume', 'related_to'),
      ('Cardiac Output', 'Preload', 'related_to'),
      ('Cardiac Output', 'Afterload', 'related_to'),
      ('Cardiac Output', 'Contractility', 'related_to'),
      ('Cardiac Output', 'Heart Failure', 'related_to'),
      ('Venous Return', 'Preload', 'related_to'),
      ('Fluid Overload', 'Pulmonary Edema', 'causes'),
      ('BNP', 'Fluid Overload', 'related_to'),
      ('Cardiac Remodeling', 'Heart Failure', 'related_to'),
      ('Heart Failure', 'Fluid Overload', 'causes'),
      ('Pulmonary Edema', 'Heart Failure', 'related_to')
  ) as relationship(source_name, target_name, relationship_type)
  join lateral (
    select c.id
    from public.concepts c
    where lower(c.name) = lower(relationship.source_name)
      and c.created_by = owner_id
    order by (c.status = 'published') desc, c.created_at desc
    limit 1
  ) source_concept on true
  join lateral (
    select c.id
    from public.concepts c
    where lower(c.name) = lower(relationship.target_name)
      and c.created_by = owner_id
    order by (c.status = 'published') desc, c.created_at desc
    limit 1
  ) target_concept on true
  on conflict (source_concept_id, target_concept_id, relationship_type)
  do nothing;
end
$batch$;

do $verify$
declare
  owner_id uuid;
  missing_attribution text;
  missing_relationships text;
begin
  select c.created_by
  into owner_id
  from public.concepts c
  where lower(c.name) = lower('Heart Failure')
    and c.created_by is not null
  order by (c.status = 'published') desc, c.created_at desc
  limit 1;

  select string_agg(c.name || ' [' || c.id::text || ']', ', ' order by c.name)
  into missing_attribution
  from public.concepts c
  where c.created_by = owner_id
    and lower(c.name) in (
      lower('Ejection Fraction'),
      lower('Stroke Volume'),
      lower('Preload'),
      lower('Afterload'),
      lower('Contractility'),
      lower('Venous Return'),
      lower('Fluid Overload'),
      lower('Pulmonary Edema'),
      lower('BNP'),
      lower('Cardiac Remodeling')
    )
    and not exists (
      select 1
      from public.content_source_notes csn
      where csn.concept_id = c.id
    );

  if missing_attribution is not null then
    raise exception 'Heart Failure Physiology attribution incomplete: %', missing_attribution;
  end if;

  if (
    select count(distinct lower(c.name))
    from public.concepts c
    where c.created_by = owner_id
      and lower(c.name) in (
        lower('Ejection Fraction'),
        lower('Stroke Volume'),
        lower('Preload'),
        lower('Afterload'),
        lower('Contractility'),
        lower('Venous Return'),
        lower('Fluid Overload'),
        lower('Pulmonary Edema'),
        lower('BNP'),
        lower('Cardiac Remodeling')
      )
  ) <> 10 then
    raise exception 'Expected all 10 Heart Failure Physiology concepts';
  end if;

  select string_agg(
    relationship.source_name || ' -> ' || relationship.target_name,
    ', '
    order by relationship.target_name
  )
  into missing_relationships
  from (
    values
      ('Cardiac Output', 'Stroke Volume', 'related_to'),
      ('Cardiac Output', 'Preload', 'related_to'),
      ('Cardiac Output', 'Afterload', 'related_to'),
      ('Cardiac Output', 'Contractility', 'related_to'),
      ('Cardiac Output', 'Heart Failure', 'related_to')
  ) as relationship(source_name, target_name, relationship_type)
  where not exists (
    select 1
    from public.concept_relationships cr
    join public.concepts source_concept
      on source_concept.id = cr.source_concept_id
    join public.concepts target_concept
      on target_concept.id = cr.target_concept_id
    where lower(source_concept.name) = lower(relationship.source_name)
      and lower(target_concept.name) = lower(relationship.target_name)
      and source_concept.created_by = owner_id
      and target_concept.created_by = owner_id
      and cr.relationship_type = relationship.relationship_type
  );

  if missing_relationships is not null then
    raise exception 'Heart Failure Physiology relationships incomplete: %',
      missing_relationships;
  end if;
end
$verify$;
