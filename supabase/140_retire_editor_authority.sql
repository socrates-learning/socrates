-- 140: retire Editor official authoring and all new personal content creation.
-- Local candidate only. No data backfill, role reassignment, or role deletion.
-- The shared Library/study/owner helpers are deliberately NOT redefined.
-- Each audited official-authoring predicate becomes the existing active-Admin
-- predicate. All other function bodies, locks, Library checks and ACLs stay intact.
begin;
set local search_path = public, pg_catalog, pg_temp;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $guard$ begin
 if current_user <> 'postgres' then raise exception '140: authorized postgres migration role required'; end if;
 if to_regprocedure('public.m138_require_active_admin()') is null
 or to_regprocedure('account_deletion_private.prepare_account_deletion(uuid,text)') is null then
  raise exception '140: installed Migrations 138 and 139 are required';
 end if;
end $guard$;

-- Exact installed definitions prevent a changed dependency from being silently
-- rewritten. CREATE OR REPLACE preserves each existing owner and execute ACL.
do $official$
declare item record; definition text; replacement jsonb;
begin
 for item in select * from (values
 ('archive_catalog_tag(uuid)','faf64fe1e1b13098cdb8de73d1ad29a4','d512e406fc0e6586a43d208d333fa972','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('archive_library_group(uuid)','819b8ca839f413cc47a9f74719ff7e84','fc2305ff973428cd2f2944d0666a8490','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('archive_question(uuid)','720b581bc77e87986b4048e240baa3c0','e31027b3de1c627926b6ea93e81a3c25','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('attach_question_source(uuid,uuid,text)','1b84e0e4afaecfefd8e0e2ae9002b7b8','0c66217ade41f129c0c1b37764f3d181','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('can_manage_testing_angle_vocabulary()','8a69e379965e9f3624040d9b882f6c8e','e18a1f0cd28381f2e255a8e1462f2777','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('create_article_core_concept(uuid,text,text,uuid,uuid[],text)','555d5d471a6312c3741d72756f7fed02','16de37a2ec28c8cfa6e73adf9a5c2bdd','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('create_catalog_tag(text)','d2e71b165b59a022e4e229e766332142','a2799719653edce950defa864643bdbb','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('create_library_group(uuid,text)','11c3cb7ecbe084407bb4019abaff3075','4d3e3f068942250ee450ccb8ed537a69','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('create_library_node_in_library(uuid,uuid,text,text,integer)','e6a9491c5893cbffb8686ecf8d3dfb92','9cb065c654026caeec56e0c43ff7f102','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('create_library_with_root(uuid,text,text)','42b832d1525c4065d1a5c644803767cc','ad0cb2f4e9388a010b7e3f9b1455f161','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('create_personal_concept_overlay(uuid,text,text,uuid,uuid,text)','c2121ba0c093b692559bfc9e887c935b','b35da9ed1c27fbfad3fdcfded071dccb','[["-- New legacy records are retired for Admins and Learners. Preserve the\n  -- separately managed legacy Editor authorization without trusting JWT roles.\n  if not public.is_editor_or_admin() or public.is_admin() then","-- New legacy Concepts and their creation overlays are retired for all\n  -- application roles. Historical owner updates use the separate save operation.\n  if true then"]]'::jsonb),
 ('create_question(uuid,text,text,text,uuid,integer,text,text)','6b73d207a2988a6cdeb06d749dc9c9a6','5c40939bea0e094629f26bf0e3c5ce4b','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('delete_development_content(text,uuid)','75b53add5dcd9419481a71f55a2a6994','6ac76f86d88f6eb5cac9f6574275fa33','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('delete_draft_question(uuid)','26ca569935d2f9410cd927a29398f740','3debca037eddb65393f61f81a4aea098','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('delete_empty_library_group(uuid)','08113384f9c0229d9fd0f91c95246760','8eecfd5329629a46c0552994e60f5948','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('delete_empty_library_node_in_library(uuid,uuid)','c5bdab96718e361270e0a73a61711acd','1e10bca40fd5af4e0f7c27c1914bec7e','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('delete_empty_library(uuid)','7cec42d422ac652e77966ceb19a02942','9258f92e526b688b86140bdcb0287b5a','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('delete_empty_tag(uuid)','ba7c43cc1bff40295fe1b649359b70ab','0eabc639701def2ddd4d3f7ba4a397fa','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('delete_unused_source(uuid)','9fb3ccb6f0cd8ec2e4f084e7370124e7','230464fef9ca99e8132fd075db747a9e','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('detach_question_source(uuid)','c31df266e285f22cfc382f15db34e35b','edb5129facb96b9213fb39a52193bde4','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('empty_tag_delete_block_reason(uuid)','aafa3aa71c83db19d3cff0b87097ed24','49218e68d7ffdfe9389a4a6155d34965','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('enforce_concept_lifecycle()','85ffc767519940f5e28680287db853bb','8a6bd5fa4c9df8a621a433e7fb75ac2c','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('get_concept_prerequisites(uuid)','c9045c705dcee9a74f60557514cd6b87','b247ba0fc573311143a3b31237799a4c','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('get_concept_tags(uuid)','402219b252c60a8fee0cd71e4c2db59c','1178cad1c0c914528f0938e2dfb4c1f5','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('get_creator_algorithm_diagnostics(uuid)','22b9739ae3f6d641d3f17a4c99c2da25','b230a3b40ecdfc72c5e97f2d151cf29b','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('get_creator_questions(uuid,uuid)','a0e3bcedc96d8ade5c6d59a490a7868f','26514ab79a36888343d7d79b15330c58','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('get_development_delete_summary(text,uuid)','d73e38ef998055444c7464f8de6fca66','a63b88deaed9a2159957434a24f69566','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('get_library_organizer_delete_eligibility()','40db71b3f62d2a9e02d7d78b43f85e17','8963629cf33a2bd5c80bd167d97e6689','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('link_article_core_concept(uuid,uuid,text,text)','61215438bb396db60a4ef8bdb59a7bd4','ddc5c66e952f3b74a08caf5a7947e956','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m112_manage_asset(uuid)','919c10bf91fc95e611f1d57e0ec7ddc4','80a63ca84d48fc4e15de420f0ab8ef22','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m112_target_allowed(uuid,uuid,uuid,uuid,uuid,uuid)','21664adf5575c55852acd32dd1ba0876','2dfb50fb03dc59e7fe554a933469470f','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m113_delivery(uuid,uuid,uuid)','c847184d99a2562a03e35f10d522aeb4','74d94e72dcb6fac48326298cbf0dcaa9','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m114_author(uuid,uuid)','b82d9e9cc006137a33024b2a6974efa3','28ae2f13818015e0eb17604be7888978','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m114_manifest(uuid,uuid,uuid)','8f75beb0c6cb6f4a16a76226fb63b84f','1692096f518bc6f9c0d698c9796d4a6b','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m115_author(uuid,uuid)','d70bb438455193db02c27e6587df6ccc','53a3c4737ad34e1b3ec43379813a29cf','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m115_read_target(uuid,uuid,uuid)','bba1688aa8e4c5f794c277f341ed9b92','cc1740d9a1b72658cf78328e35a1beea','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m116_concept_draft_core(uuid,text,text,uuid,uuid[],text[])','5ca13ccc1487e368a2764dbf959541d3','3340655a54751d0f707866ba6f257a86','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m116_concept_version_core(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,text)','a955232a57bef987e3c06efd7a33dc4e','1869bb90cfba418b42b3d7a75c3d4e24','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m116_legacy_concept(uuid)','d546096e4586e701c5e7d69adcfab1dc','4d4070b15998dc96cd514270d15613dd','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m116_legacy_question(uuid,jsonb)','9a562ea36c71b9def29c68488e2ca1d7','ebafe39185b36067239e62401c0654b7','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m116_question_save_core(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[],text)','7040de96d7112ea1bb6be21e1522a56f','f7ef017cb668093f7fc0992a9f4d12d7','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m116_replace_answers_core(uuid,jsonb)','602d611b6245472c0e2a4f42c02f7fc8','b31bbee19d996b5af6bf5d968965e10c','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m116_update_question_core(uuid,text,text,text,text,uuid,integer,text,text)','41c8f78e0d684372fbec888afdce6436','f6e8e126ffca33e1268d62095794d7d0','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('m122_require_library(uuid,boolean)','dadf7080fffd68bfa82734a1a62aad95','92acedb1956a25a1abbf8a74d73622db','[["(p_write and not public.is_editor_or_admin())","(p_write and not public.is_admin())"]]'::jsonb),
 ('m132_legacy_structure_guard()','d40a9dfd750f39b3248819e0058aca76','083b38e17d4060c165b1eec5d82df75a','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('move_library_group(uuid,uuid)','b4fddc9df2f4c9d85a179d011861a553','edd5ce8bd49202c779d207a926b2710e','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('move_library_node_in_library(uuid,uuid,uuid)','7a060ccb66de2bbd2b0a5a303a6f1df8','aed0d8baa1c691503236781386e346d0','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('move_library_to_group(uuid,uuid)','28a4f91fc0a21587ba285a6a54abff7e','be2b58db39aa67eb166b0fb318827e90','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])','309a4b4c23c66fba4e9ced0493d9535b','15037308dbc48d7c23331e45fcac874b','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('prevent_article_version_mutation()','beb05d033cae56858a16b28a1bf6c63b','485a95a32043f3a0d7c5dc24bf5baa8b','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('prevent_content_version_mutation()','7a46f119d6228fdae13b536a27293214','0ebdad509bbb7bc97c3e30a418a782b3','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('protect_library_root_node()','7a280a4c70afcd65ecc0484229749f50','f72776b67cfbae7d76083062a2caa45f','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('question_media_hint(questions)','1bd6074b75fe0267ce6574cb9ac9fa5e','7593d8057603fd8e00651c583c875c42','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('reactivate_catalog_tag(uuid)','d1974481d92de85ef4734f380d18bc5a','19f0458a7b01a709eca2f42fd74f6a14','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('rename_catalog_tag(uuid,text)','1d24785b831cda8c2f1950eee89ba6ef','4528319af7383f5bef435155d288ddc5','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('rename_library_group(uuid,text)','7afc636b6c49a91a54b6148f69467a5f','ce84da37bb0dec96b782ad34ba84b525','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('rename_library_node_in_library(uuid,uuid,text)','dc824f76ddd893020bdf188afebb049d','67fc108c753f5ff6bb92987794c0efc5','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('rename_library_with_root(uuid,text)','084c3cd45baa5a0625559e9277cdf1cf','dd62dae1408d4c514c0fca33c160e662','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('reorder_library_group(uuid,text)','a7a7241359072b955275cec3b6acdde0','49779d6aa2e5b929356817fffb0cd6b1','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('replace_question_accepted_answers(uuid,jsonb)','e5ebda7b7a1e19fac838a21662103adc','23032d2ca47753d30bea7a967ede42a8','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('replace_question_options(uuid,jsonb)','0306736a96277e460952b66dbe2b2b12','e6259c1efd5e1ee5792a26fc8aa1fa49','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('reserve_media_upload(uuid,text,uuid)','3cc7ec049aeff0b3fe54bd00ec2ddaf9','e3ab54293df761d209dcf44d4ae59e4d','[["public.is_editor_or_admin()","public.is_admin()"],["p_key is null or (p_scope=''official''","p_key is null or exists(select 1 from public.user_roles where user_id=auth.uid() and role=''editor'') or (p_scope=''official''"]]'::jsonb),
 ('save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,text[],boolean)','fbfc45ecf08d1b7382101d53e596b0fd','020b1dae9ae6ef876812a041593fe0a2','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,uuid[],boolean)','eb70b05f18041ff1b75e7c5a8e610c6e','9a146a7702aa65706af64d4d3985517e','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('save_concept_draft(uuid,text,text,uuid,uuid[],text[])','a65066ffd56b4fe6237e9ba0f9c6ff36','d337ce95dec089eba71321f56e9eb0a1','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('save_concept_with_version(uuid,text,text,uuid,uuid[],text[],text,jsonb)','f658ac781503bd115bbfa186cb5febb4','7d41b40a308dacd02d5f2be09998d812','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('save_concept_with_version(uuid,text,text,uuid,uuid[],uuid[],text,jsonb)','0ac4dfcfced6062c78a6b3036f34a67a','7b12f19e0a39b8ca84f8c7ee9cfa14fc','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[])','7590d9badb54f8424094c347b444c172','84b7438ce86bc63f4481e2d6ef5f598a','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('save_question_with_version(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[])','db1df03c773396176ee0ce81b83a92db','14e8c3671b2ad2838be1cee0232eb478','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('search_creator_questions(uuid,text,text,text,text,uuid,uuid,text,uuid,integer,timestamp with time zone,uuid)','da3facc70b3748dc8c6482790bf5afa4','ac629a56eae141f0b936b1bce9d2d10e','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('set_library_organizer_status(uuid,text)','55cf90034a7766c1db2c8bad4bfff7e8','87abce6d9e4462cee366b1c45a0c9683','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('sync_concept_prerequisites(uuid,uuid,jsonb)','e296daa3851ffc6ca73387f740024dbf','73590717b60087b523280d0f856e8d0c','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('sync_concept_references(uuid,jsonb)','39e3aea5f43655bb7369b7a43f1a88ee','402b4d6801211ac86ab5654599afd4fa','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('unlink_article_core_concept(uuid)','55689fababa150e9dd912fb5d7bc1c13','bc7e59044d2506b86318ac021ae2e9b3','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('update_question(uuid,text,text,text,text,uuid,integer,text,text)','326e8b52e2233aef4f6446393e919c36','38d5772102a1d81cf132a239e173f91f','[["public.is_editor_or_admin()","public.is_admin()"]]'::jsonb),
 ('create_personal_topic(text,uuid,uuid,integer)','bf057617b3b828d536db526a12c11877','7c50d52c52f500aef6fb4540a7e13647','[["  if normalized_name is null or normalized_name = '''' then","  if exists(select 1 from public.user_roles where user_id=caller_id and role=''editor'') then\n    raise exception ''Legacy Editor accounts cannot create new personal Topics'' using errcode=''42501'';\n  end if;\n\n  if normalized_name is null or normalized_name = '''' then"]]'::jsonb)
 ) changes(signature,before_hash,after_hash,replacements) loop
  if to_regprocedure('public.'||item.signature) is null then
   raise exception '140: missing official authorization dependency %', item.signature;
  end if;
  definition := pg_get_functiondef(('public.'||item.signature)::regprocedure);
  if md5(definition) <> item.before_hash then
   raise exception '140: changed official authorization dependency %', item.signature;
  end if;
  for replacement in select value from jsonb_array_elements(item.replacements) loop
   definition := replace(definition,replacement->>0,replacement->>1);
  end loop;
  if md5(definition) <> item.after_hash then
   raise exception '140: unexpected permission transformation %', item.signature;
  end if;
  execute definition;
 end loop;
end $official$;

-- Change only the audited permission expressions, preserving policy command,
-- role, permissive/restrictive mode, ownership tests, and table grants.
do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='article_category_placements' and policyname='Editors and admins read all article placements'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'article_category_placements', 'Editors and admins read all article placements';
 end if;
end $policy$;
ALTER POLICY "Editors and admins read all article placements" ON public."article_category_placements"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='article_concepts' and policyname='Editors and admins read all article concepts'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'article_concepts', 'Editors and admins read all article concepts';
 end if;
end $policy$;
ALTER POLICY "Editors and admins read all article concepts" ON public."article_concepts"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='article_sources' and policyname='Editors and admins read all article sources'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'article_sources', 'Editors and admins read all article sources';
 end if;
end $policy$;
ALTER POLICY "Editors and admins read all article sources" ON public."article_sources"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='article_tags' and policyname='Editors and admins read all article tags'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'article_tags', 'Editors and admins read all article tags';
 end if;
end $policy$;
ALTER POLICY "Editors and admins read all article tags" ON public."article_tags"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='article_versions' and policyname='Editors and admins read all article versions'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'article_versions', 'Editors and admins read all article versions';
 end if;
end $policy$;
ALTER POLICY "Editors and admins read all article versions" ON public."article_versions"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='articles' and policyname='Editors and admins read all articles'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'articles', 'Editors and admins read all articles';
 end if;
end $policy$;
ALTER POLICY "Editors and admins read all articles" ON public."articles"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_distinctions' and policyname='Editors manage concept distinctions'
  and cmd='ALL' and permissive='PERMISSIVE'
  and roles=ARRAY['public']::name[]
  and qual is not distinct from '(EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text])))))'
  and with_check is not distinct from '((auth.uid() = created_by) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text]))))))') then
  raise exception '140: changed policy dependency %.%', 'concept_distinctions', 'Editors manage concept distinctions';
 end if;
end $policy$;
ALTER POLICY "Editors manage concept distinctions" ON public."concept_distinctions"
 USING (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text]))))) AND is_admin()))
 WITH CHECK ((((auth.uid() = created_by) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text])))))) AND is_admin()));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_distinctions' and policyname='Readable concept distinctions'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(is_editor_or_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = concept_distinctions.concept_id) AND (c.status = ''published''::text))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'concept_distinctions', 'Readable concept distinctions';
 end if;
end $policy$;
ALTER POLICY "Readable concept distinctions" ON public."concept_distinctions"
 USING ((is_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = concept_distinctions.concept_id) AND (c.status = 'published'::text)))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_placements' and policyname='Readable concept placements'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(is_editor_or_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = concept_placements.concept_id) AND (c.status = ''published''::text))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'concept_placements', 'Readable concept placements';
 end if;
end $policy$;
ALTER POLICY "Readable concept placements" ON public."concept_placements"
 USING ((is_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = concept_placements.concept_id) AND (c.status = 'published'::text)))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_prerequisites' and policyname='Editors read concept prerequisites'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'concept_prerequisites', 'Editors read concept prerequisites';
 end if;
end $policy$;
ALTER POLICY "Editors read concept prerequisites" ON public."concept_prerequisites"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_relationships' and policyname='Editors delete own concept relationships'
  and cmd='DELETE' and permissive='PERMISSIVE'
  and roles=ARRAY['public']::name[]
  and qual is not distinct from '((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text]))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'concept_relationships', 'Editors delete own concept relationships';
 end if;
end $policy$;
ALTER POLICY "Editors delete own concept relationships" ON public."concept_relationships"
 USING ((((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text])))))) AND is_admin()));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_relationships' and policyname='Editors insert concept relationships'
  and cmd='INSERT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '(is_editor_or_admin() AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM concepts source_concept
  WHERE (source_concept.id = concept_relationships.source_concept_id))) AND (EXISTS ( SELECT 1
   FROM concepts target_concept
  WHERE (target_concept.id = concept_relationships.target_concept_id))))') then
  raise exception '140: changed policy dependency %.%', 'concept_relationships', 'Editors insert concept relationships';
 end if;
end $policy$;
ALTER POLICY "Editors insert concept relationships" ON public."concept_relationships"
 WITH CHECK ((is_admin() AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM concepts source_concept
  WHERE (source_concept.id = concept_relationships.source_concept_id))) AND (EXISTS ( SELECT 1
   FROM concepts target_concept
  WHERE (target_concept.id = concept_relationships.target_concept_id)))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_relationships' and policyname='Readable concept relationships'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(is_editor_or_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts source_concept
  WHERE ((source_concept.id = concept_relationships.source_concept_id) AND (source_concept.status = ''published''::text)))) AND (EXISTS ( SELECT 1
   FROM concepts target_concept
  WHERE ((target_concept.id = concept_relationships.target_concept_id) AND (target_concept.status = ''published''::text))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'concept_relationships', 'Readable concept relationships';
 end if;
end $policy$;
ALTER POLICY "Readable concept relationships" ON public."concept_relationships"
 USING ((is_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts source_concept
  WHERE ((source_concept.id = concept_relationships.source_concept_id) AND (source_concept.status = 'published'::text)))) AND (EXISTS ( SELECT 1
   FROM concepts target_concept
  WHERE ((target_concept.id = concept_relationships.target_concept_id) AND (target_concept.status = 'published'::text)))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concept_tags' and policyname='Readable concept tags'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(has_socrates_role() AND (is_editor_or_admin() OR (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = concept_tags.concept_id) AND (c.status = ''published''::text))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'concept_tags', 'Readable concept tags';
 end if;
end $policy$;
ALTER POLICY "Readable concept tags" ON public."concept_tags"
 USING ((has_socrates_role() AND (is_admin() OR (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = concept_tags.concept_id) AND (c.status = 'published'::text)))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='concepts' and policyname='Editors read all concepts'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'concepts', 'Editors read all concepts';
 end if;
end $policy$;
ALTER POLICY "Editors read all concepts" ON public."concepts"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='content_source_notes' and policyname='Editors attach own sources to learn sections'
  and cmd='INSERT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '(is_editor_or_admin() AND (created_by = ( SELECT auth.uid() AS uid)) AND (concept_id IS NULL) AND (learn_section_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM sources s
  WHERE ((s.id = content_source_notes.source_id) AND (s.created_by = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM learn_sections ls
  WHERE (ls.id = content_source_notes.learn_section_id))))') then
  raise exception '140: changed policy dependency %.%', 'content_source_notes', 'Editors attach own sources to learn sections';
 end if;
end $policy$;
ALTER POLICY "Editors attach own sources to learn sections" ON public."content_source_notes"
 WITH CHECK ((is_admin() AND (created_by = ( SELECT auth.uid() AS uid)) AND (concept_id IS NULL) AND (learn_section_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM sources s
  WHERE ((s.id = content_source_notes.source_id) AND (s.created_by = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM learn_sections ls
  WHERE (ls.id = content_source_notes.learn_section_id)))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='content_source_notes' and policyname='Readable concept attribution'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(is_editor_or_admin() OR (has_socrates_role() AND (((concept_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = content_source_notes.concept_id) AND (c.status = ''published''::text))))) OR ((learn_section_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (learn_sections ls
     JOIN concepts c ON ((c.id = ls.concept_id)))
  WHERE ((ls.id = content_source_notes.learn_section_id) AND (c.status = ''published''::text))))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'content_source_notes', 'Readable concept attribution';
 end if;
end $policy$;
ALTER POLICY "Readable concept attribution" ON public."content_source_notes"
 USING ((is_admin() OR (has_socrates_role() AND (((concept_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = content_source_notes.concept_id) AND (c.status = 'published'::text))))) OR ((learn_section_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (learn_sections ls
     JOIN concepts c ON ((c.id = ls.concept_id)))
  WHERE ((ls.id = content_source_notes.learn_section_id) AND (c.status = 'published'::text)))))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='learn_sections' and policyname='Editors insert learn sections'
  and cmd='INSERT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '(is_editor_or_admin() AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE (c.id = learn_sections.concept_id))))') then
  raise exception '140: changed policy dependency %.%', 'learn_sections', 'Editors insert learn sections';
 end if;
end $policy$;
ALTER POLICY "Editors insert learn sections" ON public."learn_sections"
 WITH CHECK ((is_admin() AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE (c.id = learn_sections.concept_id)))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='learn_sections' and policyname='Editors update learn sections'
  and cmd='UPDATE' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from 'is_editor_or_admin()') then
  raise exception '140: changed policy dependency %.%', 'learn_sections', 'Editors update learn sections';
 end if;
end $policy$;
ALTER POLICY "Editors update learn sections" ON public."learn_sections"
 USING (is_admin())
 WITH CHECK (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='learn_sections' and policyname='Readable learn sections'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(is_editor_or_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = learn_sections.concept_id) AND (c.status = ''published''::text))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'learn_sections', 'Readable learn sections';
 end if;
end $policy$;
ALTER POLICY "Readable learn sections" ON public."learn_sections"
 USING ((is_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM concepts c
  WHERE ((c.id = learn_sections.concept_id) AND (c.status = 'published'::text)))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='library_group_libraries' and policyname='Authorized users read visible Library group placements'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(is_editor_or_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM library_groups group_record
  WHERE ((group_record.id = library_group_libraries.group_id) AND (group_record.status = ''active''::text)))) AND (EXISTS ( SELECT 1
   FROM libraries library_record
  WHERE ((library_record.id = library_group_libraries.library_id) AND (library_record.status = ''active''::text))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'library_group_libraries', 'Authorized users read visible Library group placements';
 end if;
end $policy$;
ALTER POLICY "Authorized users read visible Library group placements" ON public."library_group_libraries"
 USING ((is_admin() OR (has_socrates_role() AND (EXISTS ( SELECT 1
   FROM library_groups group_record
  WHERE ((group_record.id = library_group_libraries.group_id) AND (group_record.status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM libraries library_record
  WHERE ((library_record.id = library_group_libraries.library_id) AND (library_record.status = 'active'::text)))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='library_groups' and policyname='Authorized users read visible Library groups'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(is_editor_or_admin() OR (has_socrates_role() AND (status = ''active''::text)))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'library_groups', 'Authorized users read visible Library groups';
 end if;
end $policy$;
ALTER POLICY "Authorized users read visible Library groups" ON public."library_groups"
 USING ((is_admin() OR (has_socrates_role() AND (status = 'active'::text))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='library_nodes' and policyname='Editors can manage library nodes'
  and cmd='ALL' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor()'
  and with_check is not distinct from 'is_editor()') then
  raise exception '140: changed policy dependency %.%', 'library_nodes', 'Editors can manage library nodes';
 end if;
end $policy$;
ALTER POLICY "Editors can manage library nodes" ON public."library_nodes"
 USING (is_admin())
 WITH CHECK (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='library_nodes' and policyname='Editors insert library nodes'
  and cmd='INSERT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '(EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text])))))') then
  raise exception '140: changed policy dependency %.%', 'library_nodes', 'Editors insert library nodes';
 end if;
end $policy$;
ALTER POLICY "Editors insert library nodes" ON public."library_nodes"
 WITH CHECK (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text]))))) AND is_admin()));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='library_nodes' and policyname='Editors update library nodes'
  and cmd='UPDATE' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text])))))'
  and with_check is not distinct from '(EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text])))))') then
  raise exception '140: changed policy dependency %.%', 'library_nodes', 'Editors update library nodes';
 end if;
end $policy$;
ALTER POLICY "Editors update library nodes" ON public."library_nodes"
 USING (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text]))))) AND is_admin()))
 WITH CHECK (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text]))))) AND is_admin()));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='personal_cards' and policyname='personal_cards_legacy_insert_restriction'
  and cmd='INSERT' and permissive='RESTRICTIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '((concept_id IS NULL) OR ( SELECT (is_editor_or_admin() AND (NOT is_admin()))))') then
  raise exception '140: changed policy dependency %.%', 'personal_cards', 'personal_cards_legacy_insert_restriction';
 end if;
end $policy$;
ALTER POLICY "personal_cards_legacy_insert_restriction" ON public."personal_cards"
 WITH CHECK ((concept_id IS NULL AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='learner')));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='personal_collections' and policyname='personal_collections_legacy_insert_restriction'
  and cmd='INSERT' and permissive='RESTRICTIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '( SELECT (is_editor_or_admin() AND (NOT is_admin())))') then
  raise exception '140: changed policy dependency %.%', 'personal_collections', 'personal_collections_legacy_insert_restriction';
 end if;
end $policy$;
ALTER POLICY "personal_collections_legacy_insert_restriction" ON public."personal_collections"
 WITH CHECK (false);

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='personal_concepts' and policyname='personal_concepts_legacy_insert_restriction'
  and cmd='INSERT' and permissive='RESTRICTIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '( SELECT (is_editor_or_admin() AND (NOT is_admin())))') then
  raise exception '140: changed policy dependency %.%', 'personal_concepts', 'personal_concepts_legacy_insert_restriction';
 end if;
end $policy$;
ALTER POLICY "personal_concepts_legacy_insert_restriction" ON public."personal_concepts"
 WITH CHECK (false);

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='question_accepted_answers' and policyname='Editors read short-answer keys'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'question_accepted_answers', 'Editors read short-answer keys';
 end if;
end $policy$;
ALTER POLICY "Editors read short-answer keys" ON public."question_accepted_answers"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='question_additional_testing_angles' and policyname='question_additional_testing_angles_editor_read'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'question_additional_testing_angles', 'question_additional_testing_angles_editor_read';
 end if;
end $policy$;
ALTER POLICY "question_additional_testing_angles_editor_read" ON public."question_additional_testing_angles"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='question_options' and policyname='Editors read all question options'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'question_options', 'Editors read all question options';
 end if;
end $policy$;
ALTER POLICY "Editors read all question options" ON public."question_options"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='question_related_concepts' and policyname='question_related_concepts_editor_read'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'question_related_concepts', 'question_related_concepts_editor_read';
 end if;
end $policy$;
ALTER POLICY "question_related_concepts_editor_read" ON public."question_related_concepts"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='question_sources' and policyname='Editors read all question sources'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'question_sources', 'Editors read all question sources';
 end if;
end $policy$;
ALTER POLICY "Editors read all question sources" ON public."question_sources"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='question_tags' and policyname='Readable question tags'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '(has_socrates_role() AND (is_editor_or_admin() OR (EXISTS ( SELECT 1
   FROM (questions q
     JOIN concepts c ON ((c.id = q.concept_id)))
  WHERE ((q.id = question_tags.question_id) AND (q.status = ''published''::text) AND (c.status = ''published''::text))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'question_tags', 'Readable question tags';
 end if;
end $policy$;
ALTER POLICY "Readable question tags" ON public."question_tags"
 USING ((has_socrates_role() AND (is_admin() OR (EXISTS ( SELECT 1
   FROM (questions q
     JOIN concepts c ON ((c.id = q.concept_id)))
  WHERE ((q.id = question_tags.question_id) AND (q.status = 'published'::text) AND (c.status = 'published'::text)))))));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='questions' and policyname='Editors read all questions'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'questions', 'Editors read all questions';
 end if;
end $policy$;
ALTER POLICY "Editors read all questions" ON public."questions"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='sources' and policyname='Editors delete own sources'
  and cmd='DELETE' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text]))))))'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'sources', 'Editors delete own sources';
 end if;
end $policy$;
ALTER POLICY "Editors delete own sources" ON public."sources"
 USING ((((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text])))))) AND is_admin()));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='sources' and policyname='Editors insert own sources'
  and cmd='INSERT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from NULL
  and with_check is not distinct from '((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text]))))))') then
  raise exception '140: changed policy dependency %.%', 'sources', 'Editors insert own sources';
 end if;
end $policy$;
ALTER POLICY "Editors insert own sources" ON public."sources"
 WITH CHECK ((((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text])))))) AND is_admin()));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='sources' and policyname='Editors read all sources'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'sources', 'Editors read all sources';
 end if;
end $policy$;
ALTER POLICY "Editors read all sources" ON public."sources"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='sources' and policyname='Editors update own sources'
  and cmd='UPDATE' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from '((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text]))))))'
  and with_check is not distinct from '((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY[''editor''::text, ''admin''::text]))))))') then
  raise exception '140: changed policy dependency %.%', 'sources', 'Editors update own sources';
 end if;
end $policy$;
ALTER POLICY "Editors update own sources" ON public."sources"
 USING ((((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text])))))) AND is_admin()))
 WITH CHECK ((((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['editor'::text, 'admin'::text])))))) AND is_admin()));

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='study_card_feedback' and policyname='Editors and admins read study card feedback'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'study_card_feedback', 'Editors and admins read study card feedback';
 end if;
end $policy$;
ALTER POLICY "Editors and admins read study card feedback" ON public."study_card_feedback"
 USING (is_admin());

do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='user_libraries' and policyname='Editors read library memberships'
  and cmd='SELECT' and permissive='PERMISSIVE'
  and roles=ARRAY['authenticated']::name[]
  and qual is not distinct from 'is_editor_or_admin()'
  and with_check is not distinct from NULL) then
  raise exception '140: changed policy dependency %.%', 'user_libraries', 'Editors read library memberships';
 end if;
end $policy$;
ALTER POLICY "Editors read library memberships" ON public."user_libraries"
 USING (is_admin());

-- Direct inserts must not bypass the matching personal-Topic command guard.
-- Existing SELECT/UPDATE/DELETE, ownership, active-account and maintenance rules
-- are unchanged. No application role is reassigned or inferred here.
create policy personal_topics_retired_editor_insert_restriction
 on public.personal_topics as restrictive for insert to authenticated
 with check (not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='editor'));
notify pgrst, 'reload schema';
commit;
