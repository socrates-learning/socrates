-- Remove only the exact Production regression fixtures approved after the
-- legacy-design audit. Every identity and dependency is asserted before any
-- deletion; any drift aborts and rolls back this transaction.

begin;

do $preflight$
begin
  -- Preservation boundary: current Nursing structure and retained learner state.
  if not exists (
    select 1 from public.libraries
    where id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964'
      and name = 'Nursing' and slug = 'nursing' and status = 'active'
  ) then raise exception '067 stopped: preserved Nursing Library differs from the audit'; end if;

  if (select count(*) from public.library_nodes
      where library_id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964') <> 30
  then raise exception '067 stopped: Nursing Topic Tree count differs from 30'; end if;

  if not exists (
    select 1 from public.library_groups
    where id = 'e69b6b53-3ec9-49f9-8609-6fe236655bfa'
      and name = 'Health Sciences' and status = 'active'
  ) then raise exception '067 stopped: preserved Health Sciences group differs from the audit'; end if;

  if (select count(*) from public.library_group_libraries
      where group_id = 'e69b6b53-3ec9-49f9-8609-6fe236655bfa'
        and library_id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964') <> 1
  then raise exception '067 stopped: Health Sciences to Nursing mapping differs from the audit'; end if;

  if not exists (select 1 from public.library_nodes
    where id = 'a2488ae4-7954-4c90-a1ce-20f5b3045753'
      and library_id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964'
      and parent_id is null)
  or not exists (select 1 from public.library_nodes
    where id = '021b2632-4c75-484d-bac4-d2f1bacf86be'
      and library_id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964')
  then raise exception '067 stopped: preserved Nursing fixture-placement nodes differ from the audit'; end if;

  if not exists (select 1 from public.tags
    where id = '833dfe2d-3f8b-4882-823c-f839b5ae7a96' and name = 'Geriatrics')
  or not exists (select 1 from public.tags
    where id = '7083ef8f-0feb-4c97-ba6b-074c66396356'
      and name = 'Pediatrics' and slug = 'pediatrics' and status = 'active')
  then raise exception '067 stopped: preserved Geriatrics or Pediatrics Tag is missing or changed'; end if;

  if (select count(*) from public.study_decks
      where id in ('3c42c790-ff20-40c4-a544-2a9cd9bbdbe3',
                   'e047a286-ab82-4b4e-aa41-fb9be7aa57fd')
        and library_id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964'
        and name = 'Current Deck') <> 2
  then raise exception '067 stopped: preserved Current Deck identities differ from the audit'; end if;

  if (select count(*) from public.study_sessions
      where study_deck_id = '3c42c790-ff20-40c4-a544-2a9cd9bbdbe3') <> 43
  or (select count(*) from public.study_sessions
      where study_deck_id = 'e047a286-ab82-4b4e-aa41-fb9be7aa57fd') <> 0
  then raise exception '067 stopped: preserved Current Deck session counts differ from the audit'; end if;

  if (select count(*) from public.study_deck_node_preferences
      where deck_id = '3c42c790-ff20-40c4-a544-2a9cd9bbdbe3') <> 4
  or (select count(*) from public.study_deck_node_preferences
      where deck_id = 'e047a286-ab82-4b4e-aa41-fb9be7aa57fd') <> 1
  or (select count(*) from public.user_study_node_selections
      where deck_id = '3c42c790-ff20-40c4-a544-2a9cd9bbdbe3') <> 0
  or (select count(*) from public.user_study_node_selections
      where deck_id = 'e047a286-ab82-4b4e-aa41-fb9be7aa57fd') <> 1
  then raise exception '067 stopped: preserved deck preferences or selections differ from the audit'; end if;

  -- Cluster 1: M066 feedback regression.
  if not exists (select 1 from public.concepts
    where id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e'
      and name = 'ZZ M066 Feedback Card 20260831' and status = 'published'
      and current_version_id = '6d8f339f-72c2-42ed-91be-23136089af8e'
      and official_version_id is null)
  then raise exception '067 stopped: M066 Concept identity/status/version pointer changed'; end if;

  if (select array_agg(id order by id) from public.concept_versions
      where concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e')
     is distinct from array['502879b0-91c0-4dc4-9431-94455596b761'::uuid,
                            '6d8f339f-72c2-42ed-91be-23136089af8e'::uuid]
  or not exists (select 1 from public.concept_versions
      where id = '502879b0-91c0-4dc4-9431-94455596b761' and version_number = 1
        and parent_version_id is null)
  or not exists (select 1 from public.concept_versions
      where id = '6d8f339f-72c2-42ed-91be-23136089af8e' and version_number = 2
        and parent_version_id = '502879b0-91c0-4dc4-9431-94455596b761')
  then raise exception '067 stopped: M066 Concept version chain changed'; end if;

  if (select count(*) from public.concept_placements
      where concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e') <> 1
  or not exists (select 1 from public.concept_placements
      where id = 'c3ff4d81-9345-406d-aeed-dc242da0cfb8'
        and concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e'
        and library_node_id = 'a2488ae4-7954-4c90-a1ce-20f5b3045753')
  then raise exception '067 stopped: M066 Concept placement changed'; end if;

  if (select count(*) from public.questions
      where concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e') <> 1
  or not exists (select 1 from public.questions
      where id = '10006af6-2d08-43de-a5c1-7cb1bc87faed'
        and concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e'
        and prompt = 'ZZ M066 Feedback Question 20260831 — What validates the feedback gate?'
        and status = 'published'
        and current_version_id = '72919f25-799a-4d74-ae83-cdbf50e0075e'
        and official_version_id is null)
  then raise exception '067 stopped: M066 Question identity/status/version pointer changed'; end if;

  if (select array_agg(id order by id) from public.question_versions
      where question_id = '10006af6-2d08-43de-a5c1-7cb1bc87faed')
     is distinct from array['3fcb8924-130d-4980-b736-13afa0976c60'::uuid,
                            '72919f25-799a-4d74-ae83-cdbf50e0075e'::uuid]
  or not exists (select 1 from public.question_versions
      where id = '3fcb8924-130d-4980-b736-13afa0976c60' and version_number = 1
        and parent_version_id is null)
  or not exists (select 1 from public.question_versions
      where id = '72919f25-799a-4d74-ae83-cdbf50e0075e' and version_number = 2
        and parent_version_id = '3fcb8924-130d-4980-b736-13afa0976c60')
  then raise exception '067 stopped: M066 Question version chain changed'; end if;

  if (select count(*) from public.question_accepted_answers
      where question_id = '10006af6-2d08-43de-a5c1-7cb1bc87faed') <> 1
  or not exists (select 1 from public.question_accepted_answers
      where id = '8bcd2a04-2cd7-4c68-a11d-612462ed9606'
        and question_id = '10006af6-2d08-43de-a5c1-7cb1bc87faed')
  then raise exception '067 stopped: M066 accepted answer changed'; end if;

  if (select array_agg(id order by id) from public.study_card_feedback
      where question_id = '10006af6-2d08-43de-a5c1-7cb1bc87faed'
         or concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e')
     is distinct from array['19fe2445-c5ff-4619-a0b1-9cba61ac2648'::uuid,
                            'dff855e9-201a-4d35-a994-56f9002fd7b6'::uuid]
  or exists (select 1 from public.study_card_feedback
      where id in ('19fe2445-c5ff-4619-a0b1-9cba61ac2648',
                   'dff855e9-201a-4d35-a994-56f9002fd7b6')
        and (user_id <> 'fde7a5de-658e-4b1b-be16-f8ef59682d9c'
          or question_id <> '10006af6-2d08-43de-a5c1-7cb1bc87faed'
          or concept_id <> 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e'
          or study_session_id <> 'ea3822b8-1bdc-437a-9e86-8c7cfd22ff02'
          or status <> 'open'))
  then raise exception '067 stopped: M066 feedback rows changed'; end if;

  if (select count(*) from public.review_attempts
      where question_id = '10006af6-2d08-43de-a5c1-7cb1bc87faed'
         or concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e') <> 1
  or not exists (select 1 from public.review_attempts
      where id = '51af89bb-cf85-4bdb-a492-400d856066ee'
        and user_id = 'fde7a5de-658e-4b1b-be16-f8ef59682d9c'
        and question_id = '10006af6-2d08-43de-a5c1-7cb1bc87faed'
        and concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e'
        and study_session_id = 'ea3822b8-1bdc-437a-9e86-8c7cfd22ff02'
        and sequence_position = 1 and testing_angle = 'General Understanding')
  then raise exception '067 stopped: M066 review attempt changed'; end if;

  if (select count(*) from public.user_concept_mastery
      where concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e') <> 1
  or not exists (select 1 from public.user_concept_mastery
      where id = 'cef7efd0-bfa2-4100-9d18-795f391542fe'
        and user_id = 'fde7a5de-658e-4b1b-be16-f8ef59682d9c'
        and concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e')
  or (select count(*) from public.user_concept_testing_angle_state
      where concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e') <> 1
  or not exists (select 1 from public.user_concept_testing_angle_state
      where user_id = 'fde7a5de-658e-4b1b-be16-f8ef59682d9c'
        and concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e'
        and testing_angle = 'General Understanding')
  then raise exception '067 stopped: M066 learner state changed'; end if;

  if not exists (select 1 from public.study_sessions
      where id = 'ea3822b8-1bdc-437a-9e86-8c7cfd22ff02'
        and study_deck_id = '3c42c790-ff20-40c4-a544-2a9cd9bbdbe3')
  then raise exception '067 stopped: preserved M066 study session changed'; end if;

  -- Cluster 2: structural-deletion safety fixture.
  if not exists (select 1 from public.concepts
    where id = 'f791af05-2955-4b43-be8a-b48edc53c664'
      and name = 'ZZ Safety Concept 20260830' and status = 'draft'
      and current_version_id = '11a01380-4775-453a-b7eb-c95ebf9911a3'
      and official_version_id is null)
  or (select array_agg(id order by id) from public.concept_versions
      where concept_id = 'f791af05-2955-4b43-be8a-b48edc53c664')
     is distinct from array['11a01380-4775-453a-b7eb-c95ebf9911a3'::uuid]
  then raise exception '067 stopped: Safety Concept or version changed'; end if;

  if (select count(*) from public.questions
      where concept_id = 'f791af05-2955-4b43-be8a-b48edc53c664') <> 1
  or not exists (select 1 from public.questions
      where id = '58d60534-a131-4e8d-9289-fcc3d417c456'
        and concept_id = 'f791af05-2955-4b43-be8a-b48edc53c664'
        and prompt = 'ZZ Safety draft question 20260830?' and status = 'archived'
        and current_version_id = '9880a1de-4ca1-487d-a976-bff66077a9c4'
        and official_version_id is null
        and review_article_concept_id = 'e3e5d201-d823-4c6d-ba4f-263b714654b0')
  or (select array_agg(id order by id) from public.question_versions
      where question_id = '58d60534-a131-4e8d-9289-fcc3d417c456')
     is distinct from array['9880a1de-4ca1-487d-a976-bff66077a9c4'::uuid]
  or not exists (select 1 from public.question_versions
      where id = '9880a1de-4ca1-487d-a976-bff66077a9c4'
        and question_id = '58d60534-a131-4e8d-9289-fcc3d417c456'
        and version_number = 1 and parent_version_id is null
        and review_article_concept_id = 'e3e5d201-d823-4c6d-ba4f-263b714654b0')
  then raise exception '067 stopped: Safety Question or version changed'; end if;

  if (select count(*) from public.question_accepted_answers
      where question_id = '58d60534-a131-4e8d-9289-fcc3d417c456') <> 1
  or not exists (select 1 from public.question_accepted_answers
      where id = 'f6a74736-b356-4c16-81d5-a33d19b292f9'
        and question_id = '58d60534-a131-4e8d-9289-fcc3d417c456')
  then raise exception '067 stopped: Safety accepted answer changed'; end if;

  if not exists (select 1 from public.articles
      where id = '5a2ce3e4-49c0-4336-9c3f-e3be2b03f852'
        and title = 'ZZ Safety Article 20260830' and status = 'draft'
        and current_version_id = '08134bf2-c132-4d1b-a815-c8c5a16346d0'
        and published_version_id is null)
  or (select array_agg(id order by id) from public.article_versions
      where article_id = '5a2ce3e4-49c0-4336-9c3f-e3be2b03f852')
     is distinct from array['08134bf2-c132-4d1b-a815-c8c5a16346d0'::uuid]
  or not exists (select 1 from public.article_concepts
      where id = 'e3e5d201-d823-4c6d-ba4f-263b714654b0'
        and article_id = '5a2ce3e4-49c0-4336-9c3f-e3be2b03f852'
        and concept_id = 'f791af05-2955-4b43-be8a-b48edc53c664')
  then raise exception '067 stopped: Safety Article/version/Concept link changed'; end if;

  -- Clusters 3 and 4: Article Editor and Tag Catalog fixtures.
  if not exists (select 1 from public.articles
      where id = '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba'
        and title = 'Version Rollout Article Test 20260830 A1' and status = 'draft'
        and current_version_id = '0d6f110b-7d46-4e24-bfc5-44a12cddc4e6'
        and published_version_id is null)
  or (select array_agg(id order by id) from public.article_versions
      where article_id = '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba')
     is distinct from array['0d6f110b-7d46-4e24-bfc5-44a12cddc4e6'::uuid]
  or not exists (select 1 from public.article_category_placements
      where id = 'afa9b2c9-5e89-4495-82f2-f10dfe6c548b'
        and article_id = '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba'
        and library_node_id = '021b2632-4c75-484d-bac4-d2f1bacf86be')
  then raise exception '067 stopped: Article Editor rollout fixture changed'; end if;

  if not exists (select 1 from public.articles
      where id = 'bd36cab2-4b15-4696-a667-2918701afac1'
        and title = 'ZZ Tag Catalog Article 20260830 B1' and status = 'draft'
        and current_version_id = 'ff3ffc4d-82bb-44a8-8542-a807ac856c3a'
        and published_version_id is null)
  or (select array_agg(id order by id) from public.article_versions
      where article_id = 'bd36cab2-4b15-4696-a667-2918701afac1')
     is distinct from array['610c9b14-84f2-433a-b406-1a57f9df0daf'::uuid,
                            'ea3c2e10-e0aa-4c2d-980c-cc036d2a0d4c'::uuid,
                            'ff3ffc4d-82bb-44a8-8542-a807ac856c3a'::uuid]
  or not exists (select 1 from public.article_category_placements
      where id = '9ad51f66-71e8-48ea-a57e-2b4d20fbc1d1'
        and article_id = 'bd36cab2-4b15-4696-a667-2918701afac1'
        and library_node_id = '021b2632-4c75-484d-bac4-d2f1bacf86be')
  then raise exception '067 stopped: Tag Catalog Article fixture changed'; end if;

  if (select count(*) from public.article_category_placements
      where article_id in ('5a2ce3e4-49c0-4336-9c3f-e3be2b03f852',
                           '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba',
                           'bd36cab2-4b15-4696-a667-2918701afac1')) <> 2
  or (select count(*) from public.article_concepts
      where article_id in ('5a2ce3e4-49c0-4336-9c3f-e3be2b03f852',
                           '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba',
                           'bd36cab2-4b15-4696-a667-2918701afac1')) <> 1
  or (select count(*) from public.article_sources
      where article_id in ('5a2ce3e4-49c0-4336-9c3f-e3be2b03f852',
                           '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba',
                           'bd36cab2-4b15-4696-a667-2918701afac1')) <> 0
  then raise exception '067 stopped: target Article dependency counts changed'; end if;

  if not exists (select 1 from public.tags
      where id = 'd8fd214d-2775-4da7-8a63-61c9721840e2'
        and name = 'ZZ Tag Catalog Regression Renamed 20260830 B1')
  or (select count(*) from public.article_tags
      where tag_id = 'd8fd214d-2775-4da7-8a63-61c9721840e2') <> 1
  or not exists (select 1 from public.article_tags
      where id = '1980c2f2-e709-4b3c-a579-76598a5ab686'
        and article_id = 'bd36cab2-4b15-4696-a667-2918701afac1'
        and tag_id = 'd8fd214d-2775-4da7-8a63-61c9721840e2')
  then raise exception '067 stopped: exclusive Tag Catalog assignment changed'; end if;

  if not exists (select 1 from public.tags where id = 'f106894f-85aa-4f9f-acf6-4f93a32b13f4'
      and name = 'version-rollout-20260830-a1')
  or not exists (select 1 from public.tags where id = '79c1fd15-58ab-451c-b568-70bd28f40708'
      and name = 'ZZ M059 Concept History Only 20260831')
  or not exists (select 1 from public.tags where id = '42f3b26d-69c2-4502-84c7-656f251415b8'
      and name = 'ZZ M059 Question History Only 20260831')
  then raise exception '067 stopped: an unassigned regression Tag changed'; end if;

  if exists (select 1 from public.concept_tags where tag_id in
      ('d8fd214d-2775-4da7-8a63-61c9721840e2','f106894f-85aa-4f9f-acf6-4f93a32b13f4',
       '79c1fd15-58ab-451c-b568-70bd28f40708','42f3b26d-69c2-4502-84c7-656f251415b8'))
  or exists (select 1 from public.question_tags where tag_id in
      ('d8fd214d-2775-4da7-8a63-61c9721840e2','f106894f-85aa-4f9f-acf6-4f93a32b13f4',
       '79c1fd15-58ab-451c-b568-70bd28f40708','42f3b26d-69c2-4502-84c7-656f251415b8'))
  or exists (select 1 from public.article_tags where tag_id in
      ('f106894f-85aa-4f9f-acf6-4f93a32b13f4','79c1fd15-58ab-451c-b568-70bd28f40708',
       '42f3b26d-69c2-4502-84c7-656f251415b8'))
  then raise exception '067 stopped: a regression Tag has an unexpected live assignment'; end if;

  -- No unapproved dependencies may be hidden behind cascading foreign keys.
  if exists (select 1 from public.question_options where question_id in
      ('10006af6-2d08-43de-a5c1-7cb1bc87faed','58d60534-a131-4e8d-9289-fcc3d417c456'))
  or exists (select 1 from public.question_sources where question_id in
      ('10006af6-2d08-43de-a5c1-7cb1bc87faed','58d60534-a131-4e8d-9289-fcc3d417c456'))
  or exists (select 1 from public.question_tags where question_id in
      ('10006af6-2d08-43de-a5c1-7cb1bc87faed','58d60534-a131-4e8d-9289-fcc3d417c456'))
  or exists (select 1 from public.concept_tags where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.concept_aliases where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.concept_distinctions where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664')
      or related_concept_id in ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.concept_relationships where source_concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664')
      or target_concept_id in ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.content_source_notes where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.learn_sections where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.learning_objects where primary_concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.learning_object_concepts where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.user_notes where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.user_submastery where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.user_study_concept_overrides where concept_id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.questions
      where review_article_concept_id = 'e3e5d201-d823-4c6d-ba4f-263b714654b0'
        and id <> '58d60534-a131-4e8d-9289-fcc3d417c456')
  or exists (select 1 from public.question_versions
      where review_article_concept_id = 'e3e5d201-d823-4c6d-ba4f-263b714654b0'
        and id <> '9880a1de-4ca1-487d-a976-bff66077a9c4')
  then raise exception '067 stopped: an unapproved target dependency exists'; end if;
end
$preflight$;

-- Learner/feedback dependencies first. The Study Session and deck remain.
delete from public.study_card_feedback where id = '19fe2445-c5ff-4619-a0b1-9cba61ac2648';
delete from public.study_card_feedback where id = 'dff855e9-201a-4d35-a994-56f9002fd7b6';
delete from public.user_concept_testing_angle_state
where user_id = 'fde7a5de-658e-4b1b-be16-f8ef59682d9c'
  and concept_id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e'
  and testing_angle = 'General Understanding';
delete from public.user_concept_mastery where id = 'cef7efd0-bfa2-4100-9d18-795f391542fe';
delete from public.review_attempts where id = '51af89bb-cf85-4bdb-a492-400d856066ee';

-- Exact live assignments and child rows.
delete from public.article_tags where id = '1980c2f2-e709-4b3c-a579-76598a5ab686';
delete from public.question_accepted_answers where id = '8bcd2a04-2cd7-4c68-a11d-612462ed9606';
delete from public.question_accepted_answers where id = 'f6a74736-b356-4c16-81d5-a33d19b292f9';

-- Break stable-record version pointers, then remove immutable versions from
-- newest to oldest while holding exclusive table locks for trigger safety.
update public.questions set current_version_id = null, official_version_id = null
where id in ('10006af6-2d08-43de-a5c1-7cb1bc87faed','58d60534-a131-4e8d-9289-fcc3d417c456');
alter table public.question_versions disable trigger prevent_question_version_mutation;
delete from public.question_versions where id = '72919f25-799a-4d74-ae83-cdbf50e0075e';
delete from public.question_versions where id = '3fcb8924-130d-4980-b736-13afa0976c60';
delete from public.question_versions where id = '9880a1de-4ca1-487d-a976-bff66077a9c4';
alter table public.question_versions enable trigger prevent_question_version_mutation;
delete from public.questions where id = '10006af6-2d08-43de-a5c1-7cb1bc87faed';
delete from public.questions where id = '58d60534-a131-4e8d-9289-fcc3d417c456';

delete from public.article_concepts where id = 'e3e5d201-d823-4c6d-ba4f-263b714654b0';
delete from public.article_category_placements where id = 'afa9b2c9-5e89-4495-82f2-f10dfe6c548b';
delete from public.article_category_placements where id = '9ad51f66-71e8-48ea-a57e-2b4d20fbc1d1';
update public.articles set current_version_id = null, published_version_id = null
where id in ('5a2ce3e4-49c0-4336-9c3f-e3be2b03f852',
             '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba',
             'bd36cab2-4b15-4696-a667-2918701afac1');
alter table public.article_versions disable trigger prevent_article_version_mutation;
delete from public.article_versions where id = 'ff3ffc4d-82bb-44a8-8542-a807ac856c3a';
delete from public.article_versions where id = 'ea3c2e10-e0aa-4c2d-980c-cc036d2a0d4c';
delete from public.article_versions where id = '610c9b14-84f2-433a-b406-1a57f9df0daf';
delete from public.article_versions where id = '08134bf2-c132-4d1b-a815-c8c5a16346d0';
delete from public.article_versions where id = '0d6f110b-7d46-4e24-bfc5-44a12cddc4e6';
alter table public.article_versions enable trigger prevent_article_version_mutation;
delete from public.articles where id = '5a2ce3e4-49c0-4336-9c3f-e3be2b03f852';
delete from public.articles where id = '20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba';
delete from public.articles where id = 'bd36cab2-4b15-4696-a667-2918701afac1';

delete from public.concept_placements where id = 'c3ff4d81-9345-406d-aeed-dc242da0cfb8';
update public.concepts set current_version_id = null, official_version_id = null
where id in ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664');
alter table public.concept_versions disable trigger prevent_concept_version_mutation;
delete from public.concept_versions where id = '6d8f339f-72c2-42ed-91be-23136089af8e';
delete from public.concept_versions where id = '502879b0-91c0-4dc4-9431-94455596b761';
delete from public.concept_versions where id = '11a01380-4775-453a-b7eb-c95ebf9911a3';
alter table public.concept_versions enable trigger prevent_concept_version_mutation;
delete from public.concepts where id = 'fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e';
delete from public.concepts where id = 'f791af05-2955-4b43-be8a-b48edc53c664';

-- Tags are deleted last, after the one approved live assignment is gone.
delete from public.tags where id = 'd8fd214d-2775-4da7-8a63-61c9721840e2';
delete from public.tags where id = 'f106894f-85aa-4f9f-acf6-4f93a32b13f4';
delete from public.tags where id = '79c1fd15-58ab-451c-b568-70bd28f40708';
delete from public.tags where id = '42f3b26d-69c2-4502-84c7-656f251415b8';

do $postflight$
begin
  if exists (select 1 from public.concepts where id in
      ('fb4d0ffa-3ec9-4e6a-acdb-04edf77d868e','f791af05-2955-4b43-be8a-b48edc53c664'))
  or exists (select 1 from public.questions where id in
      ('10006af6-2d08-43de-a5c1-7cb1bc87faed','58d60534-a131-4e8d-9289-fcc3d417c456'))
  or exists (select 1 from public.articles where id in
      ('5a2ce3e4-49c0-4336-9c3f-e3be2b03f852','20f0cfb9-ad4a-42e9-bfe2-37763fb8d5ba',
       'bd36cab2-4b15-4696-a667-2918701afac1'))
  or exists (select 1 from public.tags where id in
      ('d8fd214d-2775-4da7-8a63-61c9721840e2','f106894f-85aa-4f9f-acf6-4f93a32b13f4',
       '79c1fd15-58ab-451c-b568-70bd28f40708','42f3b26d-69c2-4502-84c7-656f251415b8'))
  then raise exception '067 stopped: a disposable fixture identity survived cleanup'; end if;

  if not exists (select 1 from public.libraries
      where id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964' and name = 'Nursing')
  or (select count(*) from public.library_nodes
      where library_id = 'fd6ba480-e665-4bfd-9f06-fe0f24ec4964') <> 30
  or not exists (select 1 from public.tags
      where id = '833dfe2d-3f8b-4882-823c-f839b5ae7a96' and name = 'Geriatrics')
  or not exists (select 1 from public.tags
      where id = '7083ef8f-0feb-4c97-ba6b-074c66396356'
        and name = 'Pediatrics' and slug = 'pediatrics' and status = 'active')
  or (select count(*) from public.study_decks where id in
      ('3c42c790-ff20-40c4-a544-2a9cd9bbdbe3','e047a286-ab82-4b4e-aa41-fb9be7aa57fd')) <> 2
  or (select count(*) from public.study_sessions
      where study_deck_id = '3c42c790-ff20-40c4-a544-2a9cd9bbdbe3') <> 43
  then raise exception '067 stopped: a preservation invariant changed during cleanup'; end if;
end
$postflight$;

commit;
