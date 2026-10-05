-- Read-only installed contract verification. No fixture/data changes.
begin read only;
do $$ begin
  if not exists(select 1 from pg_proc
    where oid=to_regprocedure('public.get_home_study_bootstrap(uuid,uuid)')
      and md5(pg_get_functiondef(oid))='7bbc5b4b4259856c7ad1ccd3cad4322e'
      and proowner='postgres'::regrole and prosecdef and provolatile='s'
      and proconfig=array['search_path=""']
      and proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
  ) then raise exception '118 Home read-model body/authority mismatch'; end if;
  if has_function_privilege('anon','public.get_home_study_bootstrap(uuid,uuid)','execute') then
    raise exception 'Home bootstrap must not admit anonymous callers';
  end if;
  if exists(select 1 from (values
    ('enforce_canonical_personal_topic_placement()','8b04ab5742d932a6be6bbab021b13d5e'),
    ('get_library_learner_progress(uuid)','39b3b17a2e29d3dd41fc20ba24a0c70b'),
    ('m109_settings_snapshot(uuid)','c548b86a1ea9aa520f43618c8f882acf'),
    ('m111_card_balance(uuid,jsonb,jsonb)','9c637e9d4d16b34287346d44d99a756b'),
    ('m117_preference_state(uuid)','0d2b7b0f5b26385f173299a312ad2849'),
    ('position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])','420c5fe6c20eea93f915028912b1da86'),
    ('record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)','b16da6561228c80148092e9c5f8067ef'),
    ('record_personal_study_attempt(uuid,uuid,uuid,uuid,text)','332ce99f63dc295898dd3835b8535607'),
    ('resolve_effective_study_nodes(uuid)','dd458aa2a36975cae173603ce0ac91da'),
    ('resolve_study_candidates(uuid)','ba74359f5e0a6dd517d7abeff1d00cb0'),
    ('resolve_study_deck(uuid)','2783a085c65258095b09b9deee0f8cc0'),
    ('select_next_study_question_hardened(uuid,boolean)','61c182ea10d0c417767dc2adcddf851a'),
    ('set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)','245f4bb29eff6b1a76405f880ac85109')
  ) expected(signature,body_hash)
    left join pg_proc p on p.oid=to_regprocedure('public.'||expected.signature)
    where p.oid is null or md5(pg_get_functiondef(p.oid))<>expected.body_hash
  ) then raise exception 'Protected eligibility, scheduling, progress, preference or structural contract changed'; end if;
  raise notice 'PASS: 118 exact Home body/authority and protected released contracts';
end $$;
rollback;
