-- Shared official Topic placements. The canonical Topic, content and evidence
-- identities do not change. Apply explicitly after released 119, never 120/121.
begin;

-- Fail closed on any drift in the 227 released application functions.
do $baseline$
declare x record; actual record;
begin
 for x in select * from jsonb_to_recordset($contracts$[{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"21ea7a18eaa4b67e07c3b7ca2b616b72","owner":"postgres","signature":"_development_delete_article(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"fbd3a18d852568d6e46bbb894000736a","owner":"postgres","signature":"_development_delete_concept(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"e5279c1611274fb537afcb59a4030854","owner":"postgres","signature":"_development_delete_group(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"a4830881f65def490ce9abf7611fc764","owner":"postgres","signature":"_development_delete_library_node(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"fb58caf520cd1e0b1276a913a26425fc","owner":"postgres","signature":"_development_delete_library(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"1c13d3ba1f0c9a762539c797915204ae","owner":"postgres","signature":"_development_delete_question(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"554ccb4e9e8f937cc35cd0dd76c9a007","owner":"postgres","signature":"_development_delete_tag(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"dd0f69368d86dd124a0a2cfc2f90e381","owner":"postgres","signature":"append_concept_version_snapshot(uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"6f6473da214b2a545bf619b2c66063a6","owner":"postgres","signature":"append_question_version_snapshot(uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"3de209813c8ada5d88d2bd16047c125f","owner":"postgres","signature":"apply_user_concept_evidence(uuid,uuid,text,text,timestamp with time zone,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"e93c65b9f83a8dfdf3d4044e06bbd294","owner":"postgres","signature":"apply_user_concept_evidence(uuid,uuid,text,text,timestamp with time zone)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"faf64fe1e1b13098cdb8de73d1ad29a4","owner":"postgres","signature":"archive_catalog_tag(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"819b8ca839f413cc47a9f74719ff7e84","owner":"postgres","signature":"archive_library_group(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"720b581bc77e87986b4048e240baa3c0","owner":"postgres","signature":"archive_question(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"c6c6d9b602e31a0f5b39bb93033ec6f1","owner":"postgres","signature":"article_slug_from_title(text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"4911b3e61519c92f82dd1ce51bbaa76a","owner":"postgres","signature":"assert_question_publishable(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"1b84e0e4afaecfefd8e0e2ae9002b7b8","owner":"postgres","signature":"attach_question_source(uuid,uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"8a69e379965e9f3624040d9b882f6c8e","owner":"postgres","signature":"can_manage_testing_angle_vocabulary()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"188618623755a0f3eafe70f2db0e39de","owner":"postgres","signature":"canonicalize_tag_catalog_row()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"171919b497d6d83744bb918e3738c776","owner":"postgres","signature":"check_question_additional_testing_angle()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"0811b3d5a16d6e39223d2690a7c9a72c","owner":"postgres","signature":"check_question_related_concept()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"555d5d471a6312c3741d72756f7fed02","owner":"postgres","signature":"create_article_core_concept(uuid,text,text,uuid,uuid[],text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"d2e71b165b59a022e4e229e766332142","owner":"postgres","signature":"create_catalog_tag(text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"11c3cb7ecbe084407bb4019abaff3075","owner":"postgres","signature":"create_library_group(uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"880e515cb5b9dcc02c7ae63b4957b0b7","owner":"postgres","signature":"create_library_node_in_library(uuid,uuid,text,text,integer)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"42b832d1525c4065d1a5c644803767cc","owner":"postgres","signature":"create_library_with_root(uuid,text,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"7bbc1968e657bf9d9afa601517e07842","owner":"postgres","signature":"create_personal_concept_overlay(uuid,text,text,uuid,uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"bf057617b3b828d536db526a12c11877","owner":"postgres","signature":"create_personal_topic(text,uuid,uuid,integer)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"6b73d207a2988a6cdeb06d749dc9c9a6","owner":"postgres","signature":"create_question(uuid,text,text,text,uuid,integer,text,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"0fb4e7abe74532b9169d9e11a3128f96","owner":"postgres","signature":"create_testing_angle(text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"ada3bc310e4335cfa84560b126c7e262","owner":"postgres","signature":"delete_development_content(text,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"26ca569935d2f9410cd927a29398f740","owner":"postgres","signature":"delete_draft_question(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"08113384f9c0229d9fd0f91c95246760","owner":"postgres","signature":"delete_empty_library_group(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"0cbbccf70b364bf2fb6f250377d41c36","owner":"postgres","signature":"delete_empty_library_node_in_library(uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"7cec42d422ac652e77966ceb19a02942","owner":"postgres","signature":"delete_empty_library(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"ba7c43cc1bff40295fe1b649359b70ab","owner":"postgres","signature":"delete_empty_tag(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"9fb3ccb6f0cd8ec2e4f084e7370124e7","owner":"postgres","signature":"delete_unused_source(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"c31df266e285f22cfc382f15db34e35b","owner":"postgres","signature":"detach_question_source(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"eaabdc01c3542824e19f99596586fa91","owner":"postgres","signature":"empty_library_delete_block_reason(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"aafa3aa71c83db19d3cff0b87097ed24","owner":"postgres","signature":"empty_tag_delete_block_reason(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"6c225cfb3a25226cdc892539f42156f0","owner":"postgres","signature":"end_study_session(uuid)"},{"acl":["postgres=X/postgres"],"md5":"8b04ab5742d932a6be6bbab021b13d5e","owner":"postgres","signature":"enforce_canonical_personal_topic_placement()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"85ffc767519940f5e28680287db853bb","owner":"postgres","signature":"enforce_concept_lifecycle()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"fbdbb93625cac08d0849a329088d6aa0","owner":"postgres","signature":"enforce_review_attempt_reset_boundary()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"feaa2db1402bc6d3c5225a8d439ba2cb","owner":"postgres","signature":"ensure_study_deck_node_preference()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"c9045c705dcee9a74f60557514cd6b87","owner":"postgres","signature":"get_concept_prerequisites(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"d8382ed29569716158a9ffd6320ed02f","owner":"postgres","signature":"get_concept_study_reset_at(uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"402219b252c60a8fee0cd71e4c2db59c","owner":"postgres","signature":"get_concept_tags(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"22b9739ae3f6d641d3f17a4c99c2da25","owner":"postgres","signature":"get_creator_algorithm_diagnostics(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"0bdad2901e6969d1fe959b1802fb1248","owner":"postgres","signature":"get_creator_questions_with_media(uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"a0e3bcedc96d8ade5c6d59a490a7868f","owner":"postgres","signature":"get_creator_questions(uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"6ddf3bff95a091336f88a91459b9a708","owner":"postgres","signature":"get_development_delete_summary(text,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"6a81b785faaf59526a7228342a38ff33","owner":"postgres","signature":"get_existing_home_study_bootstrap(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"7bbc5b4b4259856c7ad1ccd3cad4322e","owner":"postgres","signature":"get_home_study_bootstrap(uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"39b3b17a2e29d3dd41fc20ba24a0c70b","owner":"postgres","signature":"get_library_learner_progress(uuid)"},{"acl":["authenticated=X/socrates_migrator","postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"f631afc2c50cd906c5f65bdc08805949","owner":"socrates_migrator","signature":"get_library_official_availability_counts(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"40db71b3f62d2a9e02d7d78b43f85e17","owner":"postgres","signature":"get_library_organizer_delete_eligibility()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"9acf1343ed933bdf5518bf6fcf59f733","owner":"postgres","signature":"get_my_role()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"40e39c85b4f297220a1a3709c479c029","owner":"postgres","signature":"get_or_create_active_study_deck(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"76c2fcdd834f8e250bd68b240bc6b820","owner":"postgres","signature":"get_testing_angle_vocabulary()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres","socrates_migrator=X/postgres"],"md5":"721397d1c57682aeada6a32e2db17189","owner":"postgres","signature":"has_socrates_role()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"18708d17dc4d03d3f8704c00d0f6c99f","owner":"postgres","signature":"import_seed_concept(jsonb,jsonb)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"f12050bbd7cf8d42365ff883ffd5a549","owner":"postgres","signature":"is_admin()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres","socrates_migrator=X/postgres"],"md5":"a812ba74db2198e2785b3c1b9e7d8935","owner":"postgres","signature":"is_editor_or_admin()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"fd5b781ef591d7485008ac6c03d8e40c","owner":"postgres","signature":"is_editor()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"7bd094fb1620d02e4a4fa5c6ea926a7a","owner":"postgres","signature":"keep_question_primary_concept()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"f3e3210d1d214385b051d4d8d7033680","owner":"postgres","signature":"library_organization_slug(text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"61215438bb396db60a4ef8bdb59a7bd4","owner":"postgres","signature":"link_article_core_concept(uuid,uuid,text,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"7363d9c1c35a20d2065ac7fe490074b2","owner":"postgres","signature":"list_user_library_memberships()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"5b636f2e033ac377bf7bb447ad04ba66","owner":"postgres","signature":"list_users_with_roles()"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"0b85367f25677e16e06fa3ad965fa7f8","owner":"socrates_migrator","signature":"lock_topic_structure_before_write()"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"3debdb857932cfaeb5be4d4274fd0d63","owner":"socrates_migrator","signature":"m109_card_balance(uuid,jsonb)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"1835b57f892fe67dc377f5228cc9c437","owner":"socrates_migrator","signature":"m109_effective_topics(uuid)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"412c3167c7f5c06caf972b1b885a218e","owner":"socrates_migrator","signature":"m109_lock_settings_write()"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"f4ccf609ec036fd2d52f74a57144f26e","owner":"socrates_migrator","signature":"m109_session_topic_sources(jsonb)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"c548b86a1ea9aa520f43618c8f882acf","owner":"socrates_migrator","signature":"m109_settings_snapshot(uuid)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"e819a92eedfd45130003d4e986288122","owner":"socrates_migrator","signature":"m109_topic_states(uuid)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"9c637e9d4d16b34287346d44d99a756b","owner":"socrates_migrator","signature":"m111_card_balance(uuid,jsonb,jsonb)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"fb10cd4d2cf91ec0f21ace6702540804","owner":"socrates_migrator","signature":"m111_card_history(uuid)"},{"acl":["postgres=X/postgres"],"md5":"1d004eeb51cdc5acdf2e289aca57937c","owner":"postgres","signature":"m111_delete_standalone_dependencies()"},{"acl":["postgres=X/postgres"],"md5":"e921d186690864745520230d62f0c728","owner":"postgres","signature":"m111_guard_library_card_dependencies()"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"ca5bed829d26291b110fde0d1a47cdfe","owner":"socrates_migrator","signature":"m111_validate_attempt_card()"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"8eb78e6b138f3864240f601f38283dd1","owner":"socrates_migrator","signature":"m111_validate_card_attachment()"},{"acl":["postgres=X/postgres"],"md5":"1c31ee57dfa9d1c68019c3a2f42d10e0","owner":"postgres","signature":"m112_asset_guard()"},{"acl":["postgres=X/postgres"],"md5":"d932455be7a9123b772edeb8786a485e","owner":"postgres","signature":"m112_capture_version_media()"},{"acl":["postgres=X/postgres"],"md5":"e1288b02e9b23563c0dbcc3fb4795f34","owner":"postgres","signature":"m112_lease_guard()"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"0064ca9a7d6ac024b6b12d9e478c3fde","owner":"postgres","signature":"m112_library_access(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"a65ea8c12104838aa0076d4ff12980bf","owner":"postgres","signature":"m112_manage_asset(uuid)"},{"acl":["postgres=X/postgres"],"md5":"20845940af62dc6f8109c9092e9a1571","owner":"postgres","signature":"m112_queue_orphan(uuid)"},{"acl":["postgres=X/postgres"],"md5":"d6a26803bfffff8b8e8a89ba72d4e649","owner":"postgres","signature":"m112_reference_guard()"},{"acl":["postgres=X/postgres"],"md5":"a2c995cb6f93f085e2255dde64c895e2","owner":"postgres","signature":"m112_target_allowed(uuid,uuid,uuid,uuid,uuid,uuid)"},{"acl":["postgres=X/postgres"],"md5":"263992d9f33b442b288d0303c91a7cfc","owner":"postgres","signature":"m112_version_boundary()"},{"acl":["postgres=X/postgres"],"md5":"f9a7d0dfc907bc085c8d95d489af3c41","owner":"postgres","signature":"m113_actor_target(uuid,uuid,text,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"b34733ac554fa66912f1e1c6a555dd44","owner":"postgres","signature":"m113_cleanup(uuid,text,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"c847184d99a2562a03e35f10d522aeb4","owner":"postgres","signature":"m113_delivery(uuid,uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"d5a4843c7e796d389e072ab369630c12","owner":"postgres","signature":"m113_reserve(uuid,uuid,text,uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"a5b8035daf4246563b2e42f67b428982","owner":"postgres","signature":"m113_upload(uuid,uuid,uuid,text,uuid,jsonb)"},{"acl":["postgres=X/postgres"],"md5":"b82d9e9cc006137a33024b2a6974efa3","owner":"postgres","signature":"m114_author(uuid,uuid)"},{"acl":["postgres=X/postgres"],"md5":"8a83a76436e715661bc77f2b0f53392f","owner":"postgres","signature":"m114_close_operations(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"358ef696b5b270c02c706004b370f845","owner":"postgres","signature":"m114_draft(uuid,uuid,uuid,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"8f75beb0c6cb6f4a16a76226fb63b84f","owner":"postgres","signature":"m114_manifest(uuid,uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"d7944ab2065a7123894ce8bd91f11aae","owner":"postgres","signature":"m114_preview(uuid,uuid,uuid,uuid,uuid)"},{"acl":["postgres=X/postgres"],"md5":"4b9d2bdc77f6a420cbbb083e28c7935d","owner":"postgres","signature":"m114_receipt(uuid,uuid,jsonb)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"5713b0840d9aadb4d38284c446c78597","owner":"postgres","signature":"m114_reserve(uuid,uuid,uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"4da1cc9ff1e6270e6de023a91f1499de","owner":"postgres","signature":"m114_save(uuid,uuid,uuid,uuid,jsonb)"},{"acl":["postgres=X/postgres"],"md5":"a591cf78b1f5709fbb6ce44881978682","owner":"postgres","signature":"m114_token_boundary()"},{"acl":["postgres=X/postgres"],"md5":"1ec590e6bf43445f407eefe4dd33cd72","owner":"postgres","signature":"m114_tokens(text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"1887180b6ee6e67037a4dc5d3f4f0e00","owner":"postgres","signature":"m114_upload(uuid,uuid,uuid,text,uuid,jsonb)"},{"acl":["postgres=X/postgres"],"md5":"d70bb438455193db02c27e6587df6ccc","owner":"postgres","signature":"m115_author(uuid,uuid)"},{"acl":["postgres=X/postgres"],"md5":"e60691261a45e3e190723f4042885344","owner":"postgres","signature":"m115_candidate_hint(jsonb)"},{"acl":["postgres=X/postgres"],"md5":"4c86fe3ab53befe313288e8b52902888","owner":"postgres","signature":"m115_close_operations(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"bfdb322c105ac6ba38a28c5a7bea8fd3","owner":"postgres","signature":"m115_draft(uuid,uuid,uuid,uuid,uuid,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"1d178084e08463b8c4d7e9396299ebb6","owner":"postgres","signature":"m115_manifest(uuid,uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"28ef2a587fa45718f2555a33da4a68c3","owner":"postgres","signature":"m115_preview(uuid,uuid,uuid,uuid,uuid)"},{"acl":["postgres=X/postgres"],"md5":"bba1688aa8e4c5f794c277f341ed9b92","owner":"postgres","signature":"m115_read_target(uuid,uuid,uuid)"},{"acl":["postgres=X/postgres"],"md5":"a0c81bcb025c9cddd18f00441de45e8c","owner":"postgres","signature":"m115_receipt(uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"16040098659a445ce6b4b01c2899c757","owner":"postgres","signature":"m115_reserve(uuid,uuid,uuid,uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"eec9a21c5c98fc7289d2b250c613a57a","owner":"postgres","signature":"m115_save(uuid,uuid,uuid,uuid,jsonb)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"91a8800270733ae2f29fdfdae73584d5","owner":"postgres","signature":"m115_upload(uuid,uuid,uuid,text,uuid,jsonb,uuid)"},{"acl":["postgres=X/postgres"],"md5":"5ca13ccc1487e368a2764dbf959541d3","owner":"postgres","signature":"m116_concept_draft_core(uuid,text,text,uuid,uuid[],text[])"},{"acl":["postgres=X/postgres"],"md5":"a955232a57bef987e3c06efd7a33dc4e","owner":"postgres","signature":"m116_concept_version_core(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,text)"},{"acl":["postgres=X/postgres"],"md5":"2714897cb1b36a6d99eb499632b17038","owner":"postgres","signature":"m116_concept_with_prerequisites(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,jsonb,text)"},{"acl":["postgres=X/postgres"],"md5":"1960e6134b18c0f2f9df172e07ac6ee1","owner":"postgres","signature":"m116_format(text)"},{"acl":["postgres=X/postgres"],"md5":"d546096e4586e701c5e7d69adcfab1dc","owner":"postgres","signature":"m116_legacy_concept(uuid)"},{"acl":["postgres=X/postgres"],"md5":"9a562ea36c71b9def29c68488e2ca1d7","owner":"postgres","signature":"m116_legacy_question(uuid,jsonb)"},{"acl":["postgres=X/postgres"],"md5":"e73ebff479eeba44c33d40d300512d79","owner":"postgres","signature":"m116_question_context(uuid,jsonb,uuid,timestamp with time zone)"},{"acl":["postgres=X/postgres"],"md5":"7040de96d7112ea1bb6be21e1522a56f","owner":"postgres","signature":"m116_question_save_core(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[],text)"},{"acl":["postgres=X/postgres"],"md5":"602d611b6245472c0e2a4f42c02f7fc8","owner":"postgres","signature":"m116_replace_answers_core(uuid,jsonb)"},{"acl":["postgres=X/postgres"],"md5":"41c8f78e0d684372fbec888afdce6436","owner":"postgres","signature":"m116_update_question_core(uuid,text,text,text,text,uuid,integer,text,text)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"0d2b7b0f5b26385f173299a312ad2849","owner":"socrates_migrator","signature":"m117_preference_state(uuid)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"8cf1aa2db961027b96cd9627f5b2b9a4","owner":"socrates_migrator","signature":"m117_topic_graph(uuid,uuid)"},{"acl":["postgres=X/postgres"],"md5":"23879b127f9069c82e3bd33025dd3cd1","owner":"postgres","signature":"m119_available_name(text,uuid)"},{"acl":["postgres=X/postgres"],"md5":"396a372b10b9de307065f1034a838cc9","owner":"postgres","signature":"m119_catalog_identity()"},{"acl":["postgres=X/postgres"],"md5":"a1699d5556760b90a1e3f27918c5c304","owner":"postgres","signature":"m119_require_manager()"},{"acl":["postgres=X/postgres"],"md5":"ca125d99ae8d38dc9cffaa28a354ffaf","owner":"postgres","signature":"m119_validate_question_angles(uuid,text,text[])"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"b4fddc9df2f4c9d85a179d011861a553","owner":"postgres","signature":"move_library_group(uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"5f268250b6e8296b6641c7f5784277bd","owner":"postgres","signature":"move_library_node_in_library(uuid,uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"28a4f91fc0a21587ba285a6a54abff7e","owner":"postgres","signature":"move_library_to_group(uuid,uuid)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"5e4ed73996c5629b46bf0194c527d66c","owner":"socrates_migrator","signature":"normalize_topic_siblings_after_write()"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"0db5be4c83bcbc14c799057e3b302409","owner":"postgres","signature":"position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])"},{"acl":["authenticated=X/socrates_migrator","postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"420c5fe6c20eea93f915028912b1da86","owner":"socrates_migrator","signature":"position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"64909ac83084fa839cd108e365812b22","owner":"postgres","signature":"prepare_study_candidate_flag()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"aa2604f56992766c69f77e023b303abe","owner":"postgres","signature":"prevent_article_version_mutation()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"97381b075f5833ae578d185c869dd568","owner":"postgres","signature":"prevent_content_version_mutation()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"d45c8e2494cc1d9d1654c4815cb81cb6","owner":"postgres","signature":"prevent_library_group_cycle()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"7a280a4c70afcd65ecc0484229749f50","owner":"postgres","signature":"protect_library_root_node()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"443044cee4682a698af717ba39d3b02c","owner":"postgres","signature":"provision_invited_learner(text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"1bd6074b75fe0267ce6574cb9ac9fa5e","owner":"postgres","signature":"question_media_hint(questions)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"d1974481d92de85ef4734f380d18bc5a","owner":"postgres","signature":"reactivate_catalog_tag(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"b16da6561228c80148092e9c5f8067ef","owner":"postgres","signature":"record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"332ce99f63dc295898dd3835b8535607","owner":"postgres","signature":"record_personal_study_attempt(uuid,uuid,uuid,uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"0f965ff6738f62e45c4976a83df974f0","owner":"postgres","signature":"record_study_session_attempt(uuid,uuid,uuid,text,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"1a590e51a1aadec72cad63c6d2f3a9a0","owner":"postgres","signature":"record_study_session_attempt(uuid,uuid,uuid,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"d270623c27919bfb83e9e8690205a677","owner":"postgres","signature":"reject_concept_prerequisite_cycle()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"8944ba20803f2be47e43be8865051419","owner":"postgres","signature":"remove_primary_from_additional_testing_angles()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"1d24785b831cda8c2f1950eee89ba6ef","owner":"postgres","signature":"rename_catalog_tag(uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"7afc636b6c49a91a54b6148f69467a5f","owner":"postgres","signature":"rename_library_group(uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"e6fa23551623cf7ec79fecf3e4757b81","owner":"postgres","signature":"rename_library_node_in_library(uuid,uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"084c3cd45baa5a0625559e9277cdf1cf","owner":"postgres","signature":"rename_library_with_root(uuid,text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"0b8585c88bc51098e4d042ef4f52eb41","owner":"postgres","signature":"rename_testing_angle(uuid,text,bigint)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"a7a7241359072b955275cec3b6acdde0","owner":"postgres","signature":"reorder_library_group(uuid,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"e5ebda7b7a1e19fac838a21662103adc","owner":"postgres","signature":"replace_question_accepted_answers(uuid,jsonb)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"0306736a96277e460952b66dbe2b2b12","owner":"postgres","signature":"replace_question_options(uuid,jsonb)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"3cc7ec049aeff0b3fe54bd00ec2ddaf9","owner":"postgres","signature":"reserve_media_upload(uuid,text,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"ccbdc9e7959bfe2a354ef480764736ab","owner":"postgres","signature":"reset_study_progress(uuid,text,uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"dd458aa2a36975cae173603ce0ac91da","owner":"postgres","signature":"resolve_effective_study_nodes(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"ba74359f5e0a6dd517d7abeff1d00cb0","owner":"postgres","signature":"resolve_study_candidates(uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"2783a085c65258095b09b9deee0f8cc0","owner":"postgres","signature":"resolve_study_deck(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"192a67ae17cd0f3c0e11385a1c4ec898","owner":"postgres","signature":"resolve_user_study_plan(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"fbfc45ecf08d1b7382101d53e596b0fd","owner":"postgres","signature":"save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,text[],boolean)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"eb70b05f18041ff1b75e7c5a8e610c6e","owner":"postgres","signature":"save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,uuid[],boolean)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"0b6496de132e5806294b34a391193b95","owner":"postgres","signature":"save_article_question_metadata(uuid,uuid,uuid,uuid,timestamp with time zone,jsonb)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"a65066ffd56b4fe6237e9ba0f9c6ff36","owner":"postgres","signature":"save_concept_draft(uuid,text,text,uuid,uuid[],text[])"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"18873e139f5e1d7c2cfdf6413aaa7054","owner":"postgres","signature":"save_concept_with_format(uuid,uuid,timestamp with time zone,text,jsonb)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"c8aa9f978a673ad92f668965f4d3e9f4","owner":"postgres","signature":"save_concept_with_prerequisites(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,jsonb)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"f658ac781503bd115bbfa186cb5febb4","owner":"postgres","signature":"save_concept_with_version(uuid,text,text,uuid,uuid[],text[],text,jsonb)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"0ac4dfcfced6062c78a6b3036f34a67a","owner":"postgres","signature":"save_concept_with_version(uuid,text,text,uuid,uuid[],uuid[],text,jsonb)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"f6655320672be29b96ee01046c8e3711","owner":"postgres","signature":"save_personal_concept_with_overlay(uuid,uuid,text,text,text,uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"e9f5586ae4367b7b22ea0bb0194d199c","owner":"postgres","signature":"save_question_with_format(uuid,uuid,timestamp with time zone,jsonb)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"7590d9badb54f8424094c347b444c172","owner":"postgres","signature":"save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[])"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"307d9203ba294f907730e5f503c49bfe","owner":"postgres","signature":"save_question_with_relationships(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[])"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"898a28529322929a8e139f85473349f8","owner":"postgres","signature":"save_question_with_version(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[])"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"db1df03c773396176ee0ce81b83a92db","owner":"postgres","signature":"save_question_with_version(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[])"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"c4bcde1998137f99087b9548044577fa","owner":"postgres","signature":"search_creator_questions_with_media(uuid,text,text,text,text,uuid,uuid,text,uuid,integer,timestamp with time zone,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"da3facc70b3748dc8c6482790bf5afa4","owner":"postgres","signature":"search_creator_questions(uuid,text,text,text,text,uuid,uuid,text,uuid,integer,timestamp with time zone,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"a6ae79fb019cdf0f1421d5088f1b07b3","owner":"postgres","signature":"select_next_personal_study_card(uuid,boolean)"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"54ce87f83f860f7b8aac93a74ddc9a09","owner":"postgres","signature":"select_next_study_candidate_with_media(uuid,boolean)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"a5662970795486b790fb907fd5c98441","owner":"postgres","signature":"select_next_study_candidate(uuid,boolean)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"61c182ea10d0c417767dc2adcddf851a","owner":"postgres","signature":"select_next_study_question_hardened(uuid,boolean)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"7434b02cc2e0aea88c4586c411d15525","owner":"postgres","signature":"select_next_study_question(uuid,boolean)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"b2ac304f33eed9fb27fc428c3ed281f1","owner":"postgres","signature":"set_learner_account_defaults_updated_at()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"9db2c366325bee7d45f00c074692ed90","owner":"postgres","signature":"set_library_organization_updated_at()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"55cf90034a7766c1db2c8bad4bfff7e8","owner":"postgres","signature":"set_library_organizer_status(uuid,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"512411fb1e30ac5863d31eb6dc93d407","owner":"postgres","signature":"set_personal_content_updated_at()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"78e63452fe615e36d8fff852d64407d4","owner":"postgres","signature":"set_personal_topic_official_placement(uuid,uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"6a7d6839721221d24a8f508b1c431401","owner":"postgres","signature":"set_question_bank_updated_at()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"9f1f66f5c204564caebf916619e59ec5","owner":"postgres","signature":"set_source_key()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"ac50f977b013cde714f7f9c2cea6d5cd","owner":"postgres","signature":"set_sources_updated_at()"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"fbdb2915cc4406045cea9457797f2183","owner":"postgres","signature":"set_study_deck_node_selection(uuid,uuid,boolean)"},{"acl":["authenticated=X/socrates_migrator","postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"6b5e2fc3a43a4e6f8e921bb95321e3b2","owner":"socrates_migrator","signature":"set_study_deck_personal_collection_preference(uuid,uuid,integer)"},{"acl":["authenticated=X/socrates_migrator","postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"5604b7adc752d752efb7fa97b4f73162","owner":"socrates_migrator","signature":"set_study_deck_personal_collection_selection(uuid,uuid,boolean)"},{"acl":["postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"fa0ceb17623f0c2a60eb97102eb59aea","owner":"socrates_migrator","signature":"set_study_deck_personal_topic_preference(uuid,uuid,integer)"},{"acl":["authenticated=X/socrates_migrator","postgres=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"3a74ac9c29206a20e559459cf4188b65","owner":"socrates_migrator","signature":"set_study_deck_personal_topic_selection(uuid,uuid,boolean)"},{"acl":["authenticated=X/socrates_migrator","socrates_migrator=X/socrates_migrator"],"md5":"245f4bb29eff6b1a76405f880ac85109","owner":"socrates_migrator","signature":"set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"507d9bc6e300d74c6aeb9e88a0b0df61","owner":"postgres","signature":"set_study_sessions_updated_at()"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"e679dee0efd8d5eca2bc4dfaaff44a6e","owner":"postgres","signature":"set_testing_angle_retired(uuid,boolean,bigint)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"77117da42e9e4afd9ce8b54a49ba6327","owner":"postgres","signature":"set_user_libraries_updated_at()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"8e17e375fdbcd16279185c9fbc89a20c","owner":"postgres","signature":"set_user_personal_concept_state_updated_at()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"e6ae21936cb33f761b085dca8475f9dc","owner":"postgres","signature":"set_user_primary_library(uuid,uuid)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"c8ab40eee10af7cfa3a96de8d71e2e27","owner":"postgres","signature":"set_user_role_by_email(text,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"d0550ffbd4540670074dc4a61b2994f4","owner":"postgres","signature":"set_user_study_selection_updated_at()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"1d3bb51975da1be656ccd78c3ccad2c6","owner":"postgres","signature":"set_wiki_updated_at()"},{"acl":["authenticated=X/postgres","postgres=X/postgres"],"md5":"4f2b4a761bc4c439fda67d5401593a5f","owner":"postgres","signature":"start_study_session_with_candidate_and_media(uuid,integer,uuid,boolean)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"d7ef0a9f9ff7f17fa64f04b3a91489fb","owner":"postgres","signature":"start_study_session_with_candidate(uuid,integer,uuid,boolean)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"fbe62da3da3c6ec0f81e076b11767f4b","owner":"postgres","signature":"start_study_session(uuid,integer)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"c3f904064ef056fde9afc675b519039a","owner":"postgres","signature":"submit_study_card_feedback(uuid,uuid,uuid,text,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"e296daa3851ffc6ca73387f740024dbf","owner":"postgres","signature":"sync_concept_prerequisites(uuid,uuid,jsonb)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"39e3aea5f43655bb7369b7a43f1a88ee","owner":"postgres","signature":"sync_concept_references(uuid,jsonb)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"8f634e2c36951511ebfa4ec20211f566","owner":"postgres","signature":"tag_slug_from_name(text)"},{"acl":["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"],"md5":"55689fababa150e9dd912fb5d7bc1c13","owner":"postgres","signature":"unlink_article_core_concept(uuid)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"326e8b52e2233aef4f6446393e919c36","owner":"postgres","signature":"update_question(uuid,text,text,text,text,uuid,integer,text,text)"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"5a1f1c4bce478cccce4411567eca721e","owner":"postgres","signature":"validate_assignable_tag_ids(uuid[],uuid[])"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"21fa7b9a1590e9d37f2d983c4058be11","owner":"postgres","signature":"validate_personal_concept_official_placement()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"ca1b708a255394e47f63777e658d9b5c","owner":"postgres","signature":"validate_personal_topic_official_placement()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"e9d2654ada914d2a08e6a2656ec97d55","owner":"postgres","signature":"validate_personal_topic_parent()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"35f5f1461da2f25b8b3a8bd6b2b8ae98","owner":"postgres","signature":"validate_question_child_publish()"},{"acl":["postgres=X/postgres","service_role=X/postgres"],"md5":"293f86c1af5701c6afca7a3e80cd9518","owner":"postgres","signature":"validate_question_publish()"}]$contracts$::jsonb) as t(signature text, md5 text, owner text, acl text[]) loop
  select md5(pg_get_functiondef(p.oid)) hash,r.rolname owner,(select array_agg(a order by a) from unnest(p.proacl::text[]) a) acl into actual from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure('public.'||x.signature);
  if not found or actual.hash is distinct from x.md5 or actual.owner is distinct from x.owner or actual.acl is distinct from (select array_agg(a order by a) from unnest(x.acl) a) then raise exception '122 unexpected released contract: %',x.signature;end if;
 end loop;
end $baseline$;
do $$ begin
 if current_user <> 'postgres'
    or to_regclass('public.official_topic_placements') is not null
    or to_regprocedure('public.m119_catalog_identity()') is null then
  raise exception '122 requires the released baseline and an unused placement contract';
 end if;
end $$;

create table public.official_topic_placements (
 id uuid primary key default gen_random_uuid(),
 library_id uuid not null references public.libraries(id) on delete restrict,
 parent_node_id uuid not null,
 topic_id uuid not null,
 sort_order integer not null check (sort_order >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (parent_node_id,library_id) references public.library_nodes(id,library_id) on delete restrict,
 foreign key (topic_id,library_id) references public.library_nodes(id,library_id) on delete restrict,
 unique (library_id,parent_node_id,topic_id),
 check (parent_node_id <> topic_id)
);
create index official_topic_placements_parent_order on public.official_topic_placements(library_id,parent_node_id,sort_order,id);
create index official_topic_placements_target on public.official_topic_placements(library_id,topic_id);
alter table public.official_topic_placements owner to socrates_migrator;
set local role socrates_migrator;
alter table public.official_topic_placements enable row level security;
revoke all on public.official_topic_placements from public,anon,authenticated,service_role;
grant select on public.official_topic_placements to authenticated;
grant select,insert,update,delete on public.official_topic_placements to postgres;
create policy m122_placement_read on public.official_topic_placements for select to authenticated
 using (public.has_socrates_role() and (public.is_editor_or_admin() or exists (
  select 1 from public.user_libraries m
  where m.user_id=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid
    and m.library_id=official_topic_placements.library_id
 )));
reset role;
alter table public.study_deck_node_preferences add column shared_compatibility_source jsonb
 constraint m122_compatibility_provenance check(shared_compatibility_source is null or coalesce(
  jsonb_typeof(shared_compatibility_source)='object'
  and shared_compatibility_source-array['version','source','origin','ancestors']='{}'::jsonb
  and shared_compatibility_source->'version'='1'::jsonb
  and jsonb_typeof(shared_compatibility_source->'source')='string'
  and length(btrim(shared_compatibility_source->>'source'))>0
  and (shared_compatibility_source->>'origin') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and jsonb_typeof(shared_compatibility_source->'ancestors')='array'
  and jsonb_path_query_array(shared_compatibility_source,
   '$.ancestors[*] ? (@.type() == "object" && @.source.type() == "string" && @.source != "" && @.origin.type() == "string" && @.origin like_regex "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")')=shared_compatibility_source->'ancestors',false));
comment on column public.study_deck_node_preferences.shared_compatibility_source is
 'Version 1 provenance for this canonical Topic: original source group, source Topic and ancestor source groups. Balance/reset_source remain the sole learner preference. Structural edits retain provenance; explicit subtree resets replace it.';

set local role socrates_migrator;
create function public.m122_edges(p_library uuid)
 returns table(edge_key text,parent_id uuid,topic_id uuid,sort_order integer,kind text)
 language sql stable security invoker set search_path='' as $$
 select 'primary:'||n.id,n.parent_id,n.id,n.sort_order,'primary'::text
 from public.library_nodes n where n.library_id=p_library and n.parent_id is not null
 union all
 select 'placement:'||p.id,p.parent_node_id,p.topic_id,p.sort_order,'placement'
 from public.official_topic_placements p where p.library_id=p_library;
$$;

-- UNION deduplicates canonical pairs, including layered diamonds. No root-path
-- enumeration, depth column or hidden path limit is used for reachability.
create function public.m122_closure(p_library uuid,p_shared boolean default true)
 returns table(ancestor_id uuid,topic_id uuid)
 language sql stable security invoker set search_path='' as $$
 with recursive edges as materialized (
  select e.parent_id,e.topic_id from public.m122_edges(p_library) e where p_shared or e.kind='primary'
 ), walk as (
  select n.id ancestor_id,n.id topic_id from public.library_nodes n where n.library_id=p_library
  union
  select w.ancestor_id,e.topic_id from walk w join edges e on e.parent_id=w.topic_id
 ) select * from walk;
$$;

create function public.m122_shared_nodes(p_library uuid) returns table(topic_id uuid)
 language sql stable security invoker set search_path='' as $$
 select distinct c.topic_id from public.m122_closure(p_library) c
 join public.official_topic_placements p on p.library_id=p_library and p.topic_id=c.ancestor_id;
$$;

create function public.m122_graph_revision(p_library uuid) returns text
 language sql stable security invoker set search_path='' as $$
 select md5(jsonb_build_object(
  'nodes',(select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]') from public.library_nodes n where n.library_id=p_library),
  'edges',(select coalesce(jsonb_agg(to_jsonb(e) order by e.edge_key),'[]') from public.m122_edges(p_library) e)
 )::text);
$$;
reset role;

-- These entry points have the same narrow postgres owner exception as the
-- released official structural RPCs. Identity is always the authenticated actor.
create function public.m122_require_library(p_library uuid,p_write boolean default false) returns void
 language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_socrates_role()
 or (p_write and not public.is_editor_or_admin())
 or not exists(select 1 from public.libraries where id=p_library)
 or not (public.is_editor_or_admin() or exists(select 1 from public.user_libraries where user_id=auth.uid() and library_id=p_library)) then
  raise exception 'Authorized Library required' using errcode='42501';
 end if;
end $$;

create function public.get_official_topic_graph(p_library_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.m122_require_library(p_library_id);
 select jsonb_build_object('version',122,'library_id',p_library_id,
  'revision',public.m122_graph_revision(p_library_id),
  'root_id',(select id from public.library_nodes where library_id=p_library_id and parent_id is null),
  'nodes',(select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]') from public.library_nodes n where library_id=p_library_id),
  'edges',(select coalesce(jsonb_agg(to_jsonb(e) order by e.parent_id,e.sort_order,e.edge_key),'[]') from public.m122_edges(p_library_id) e)) into result;
 return result;
end $$;

create function public.m122_check_graph(p_library uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.official_topic_placements p join public.library_nodes n on n.id=p.topic_id
  where p.library_id=p_library and n.parent_id is null) then
  raise exception 'Library root cannot be shared' using errcode='23514';
 end if;
 if exists(select 1 from public.m122_edges(p_library) group by parent_id,topic_id having count(*)>1) then
  raise exception 'Duplicate Topic placement' using errcode='23505';
 end if;
 if exists(select 1 from public.m122_edges(p_library) e
  join public.m122_closure(p_library) c on c.ancestor_id=e.topic_id and c.topic_id=e.parent_id) then
  raise exception 'Topic placement cycle' using errcode='23514';
 end if;
 if exists(select 1 from public.m122_edges(p_library) e join public.library_nodes n on n.id=e.topic_id
  group by e.parent_id,lower(btrim(n.name)) having count(*)>1) then
  raise exception 'Sibling Topic name already exists' using errcode='23505';
 end if;
end $$;

create function public.m122_graph_guard() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 -- A transaction pinned to an older snapshot cannot validate a graph another
 -- serialized writer just committed. The same requirement already applies to
 -- the placement RPCs; direct structural writes must also fail closed.
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Topic graph writes require READ COMMITTED' using errcode='40001';
 end if;
 if tg_op<>'INSERT' then perform public.m122_check_graph(old.library_id); end if;
 if tg_op<>'DELETE' and (tg_op='INSERT' or new.library_id is distinct from old.library_id) then
  perform public.m122_check_graph(new.library_id);
 end if;
 return null;
end $$;

set local role socrates_migrator;
create trigger m122_structure_lock before insert or update or delete on public.official_topic_placements
 for each statement execute function public.lock_topic_structure_before_write();
create constraint trigger m122_official_graph_integrity after insert or update or delete on public.official_topic_placements
 deferrable initially deferred for each row execute function public.m122_graph_guard();
reset role;
create constraint trigger m122_primary_graph_integrity after insert or update or delete on public.library_nodes
 deferrable initially deferred for each row execute function public.m122_graph_guard();

create function public.m122_normalize_siblings(p_library uuid,p_parent uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 with ranks as materialized (
  select e.edge_key,(row_number() over(order by e.sort_order asc nulls last,n.name collate "C",n.id,e.edge_key)-1)::integer rank
  from public.m122_edges(p_library) e join public.library_nodes n on n.id=e.topic_id where e.parent_id=p_parent
 ), primary_updates as (
  update public.library_nodes n set sort_order=r.rank from ranks r
  where r.edge_key='primary:'||n.id and n.sort_order is distinct from r.rank returning n.id
 )
 update public.official_topic_placements p set sort_order=r.rank,updated_at=now() from ranks r
 where r.edge_key='placement:'||p.id and p.sort_order is distinct from r.rank;
end $$;

create function public.m122_order_siblings(p_library uuid,p_parent uuid,p_edges text[]) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if cardinality(p_edges)<>(select count(*) from public.m122_edges(p_library) where parent_id=p_parent)
 or cardinality(p_edges)<>(select count(distinct x) from unnest(p_edges) x)
 or exists(select 1 from unnest(p_edges) x where not exists(select 1 from public.m122_edges(p_library) e where e.parent_id=p_parent and e.edge_key=x)) then
  raise exception 'Topic sibling order changed. Reload Topics.' using errcode='PT409';
 end if;
 with ranks as materialized(select edge_key,(idx-1)::integer rank from unnest(p_edges) with ordinality x(edge_key,idx)), primary_updates as (
  update public.library_nodes n set sort_order=r.rank from ranks r
  where r.edge_key='primary:'||n.id and n.sort_order is distinct from r.rank returning n.id
 )
 update public.official_topic_placements p set sort_order=r.rank,updated_at=now() from ranks r
 where r.edge_key='placement:'||p.id and p.sort_order is distinct from r.rank;
end $$;

create function public.m122_effective_nodes(p_deck uuid)
 returns table(node_id uuid,source_node_id uuid,source_state text,source_distance integer)
 language sql stable security invoker set search_path='' as $$
 with recursive deck as (select * from public.study_decks where id=p_deck),
 shared as materialized(select s.topic_id from deck d cross join lateral public.m122_shared_nodes(d.library_id) s),
 roots as (
  select s.node_id,s.node_id source_id,true included,0 distance from public.user_study_node_selections s join deck d on d.id=s.deck_id and d.user_id=s.user_id and d.library_id=s.library_id
  union all
  select s.node_id,s.node_id,false,0 from public.study_deck_node_exclusions s join deck d on d.id=s.deck_id and d.user_id=s.user_id and d.library_id=s.library_id
 ), canonical_walk as (
  select * from roots
  union all
  select n.id,w.source_id,w.included,w.distance+1 from canonical_walk w
  join public.library_nodes n on n.parent_id=w.node_id join deck d on d.library_id=n.library_id
 ), ordinary as materialized (
  select distinct on(w.node_id) w.* from canonical_walk w
  where not exists(select 1 from shared s where s.topic_id=w.node_id)
  order by w.node_id,w.distance,w.included,w.source_id
 ), shared_roots as (
  select r.node_id,r.source_id,r.distance from roots r join shared s on s.topic_id=r.node_id where r.included
  union
  select e.topic_id,o.source_id,o.distance+1 from ordinary o join deck d on true
  cross join lateral public.m122_edges(d.library_id) e join shared s on s.topic_id=e.topic_id
  where e.parent_id=o.node_id and o.included
 ), shared_walk as (
  select * from shared_roots
  union
  select e.topic_id,w.source_id,w.distance+1 from shared_walk w join deck d on true
  cross join lateral public.m122_edges(d.library_id) e where e.parent_id=w.node_id
 ), included as (
  select o.node_id,o.source_id,o.distance from ordinary o where o.included
  union all
  select distinct on(w.node_id) w.node_id,w.source_id,w.distance from shared_walk w order by node_id,distance,source_id
 ) select i.node_id,i.source_id,'included'::text,i.distance from included i;
$$;

create function public.m122_preference_projection(p_deck uuid,p_legacy jsonb) returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare d public.study_decks; result jsonb; official jsonb; values_map jsonb;
 -- Internal materialization also needs dormant rows. This helper has no client
 -- execute grant; the flag is never included in a returned settings contract.
 include_dormant boolean:=coalesce((p_legacy->>'m122_include_dormant')::boolean,false);
begin
 select * into d from public.study_decks where id=p_deck;
 if not include_dormant and not exists(select 1 from public.official_topic_placements where library_id=d.library_id)
 and not exists(select 1 from public.study_deck_node_preferences where deck_id=d.id and shared_compatibility_source is not null) then return p_legacy; end if;
 with effective as materialized(select * from public.m122_effective_nodes(d.id)),
 closure as materialized(select * from public.m122_closure(d.library_id)),
 ancestor_counts as (select topic_id,count(*) total from closure group by topic_id),
 raw as materialized (
  select n.id,
   case when (context.active and p.reset_source is not null) or context.preserved then p.new_mastery_balance
    else coalesce((inherited.value->>'balance')::integer,(p_legacy->'values'->>('official:topic:'||n.id))::integer,50) end balance,
   coalesce(case when context.preserved then p.shared_compatibility_source->>'source' end,reset_group.source,
    p_legacy#>>array['projection','official',n.id::text,'source'],inherited.value->>'source',
    case when p.reset_source is not null then 'reset:'||p.reset_source||':official:topic:'||n.id else 'official:topic:'||n.id end) source,
   coalesce(case when context.preserved then (p.shared_compatibility_source->>'origin')::uuid end,reset_group.origin,
    (p_legacy#>>array['projection','official',n.id::text,'origin'])::uuid,(inherited.value->>'origin')::uuid,n.id) origin,
   case when context.preserved then p.shared_compatibility_source->'ancestors' else inherited.ancestors end ancestors,
   context.active or context.preserved or inherited.value is not null covered,
   exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=n.id) selected
  from public.library_nodes n join public.m117_topic_graph(d.library_id,d.user_id) g on g.source='official' and g.topic_id=n.id
  left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=n.id
  cross join lateral (
   select include_dormant or exists(select 1 from effective e where e.node_id=n.id) active,
    p.shared_compatibility_source is not null and (include_dormant or exists(select 1 from effective e where e.node_id=n.id)
     or exists(select 1 from public.user_study_node_selections selected where selected.deck_id=d.id
      and selected.node_id::text=p.shared_compatibility_source->>'origin')) preserved
  ) context
  left join lateral (
   select entry.value->>'source' source,(entry.value->>'origin')::uuid origin
   from closure reach
   join public.study_deck_node_preferences anchor on anchor.deck_id=d.id and anchor.library_node_id=reach.ancestor_id and anchor.reset_source=p.reset_source
   join jsonb_each(p_legacy#>'{projection,official}') entry on entry.key=anchor.library_node_id::text
   where reach.topic_id=n.id and p.reset_source is not null
   order by coalesce((entry.value->>'selected')::boolean,false) desc,
    case when coalesce((entry.value->>'selected')::boolean,false) then -1 else 1 end *
     (select total from ancestor_counts ancestors where ancestors.topic_id=anchor.library_node_id),anchor.library_node_id
   limit 1
  ) reset_group on context.active
  left join lateral (
   select x.value,
    case when original.shared_compatibility_source->>'source'=x.value->>'source' then original.shared_compatibility_source->'ancestors' end ancestors
   from jsonb_each(p_legacy#>'{projection,official}') x
   left join public.study_deck_node_preferences original on original.deck_id=d.id and original.library_node_id=(x.value->>'origin')::uuid
   where coalesce((x.value->>'selected')::boolean,false) and (
    (p.shared_compatibility_source is null and ('official:topic:'||x.key)=any(g.ancestry))
    or exists(select 1 from jsonb_array_elements(p.shared_compatibility_source->'ancestors') ancestor where ancestor->>'source'=x.value->>'source'))
   order by array_position(g.ancestry,'official:topic:'||x.key) desc nulls last,x.key limit 1
  ) inherited on not context.active or p.reset_source is null
  where n.library_id=d.library_id
 ), entries as (
  select r.*,coalesce(r.ancestors,(select coalesce(jsonb_agg(jsonb_build_object('source',a.source,'origin',a.origin) order by a.source,a.origin),'[]')
   from (select distinct parent.source,parent.origin from raw parent join closure c on c.ancestor_id=parent.origin and c.topic_id=r.origin
    where parent.origin<>r.origin and parent.source<>r.source) a)) original_ancestors from raw r
 ) select coalesce(jsonb_object_agg(id,jsonb_build_object('balance',balance,'source',source,'selected',selected,'origin',origin,'ancestors',original_ancestors)),'{}')
 into official from entries where covered;
 -- Preference coverage is deliberately broader than Topic eligibility: an
 -- explicitly included Concept may use a selected ancestor on an excluded Topic.
 select coalesce(jsonb_object_agg('official:topic:'||p.library_node_id,p.new_mastery_balance),'{}') into values_map
 from public.study_deck_node_preferences p where p.deck_id=d.id and (p.reset_source is not null or p.shared_compatibility_source is not null);
 result:=(p_legacy-'m122_include_dormant')||jsonb_build_object('version',122,'values',(p_legacy->'values')||values_map,
  'projection',jsonb_build_object('version',122,'official',official,'personal',p_legacy#>'{projection,personal}'));
 return result||jsonb_build_object('revision',md5(jsonb_build_object('legacy_revision',p_legacy->>'revision',
  'graph',public.m122_graph_revision(d.library_id),'projection',result->'projection',
  'preferences',(select coalesce(jsonb_agg(to_jsonb(p) order by p.library_node_id),'[]') from public.study_deck_node_preferences p where p.deck_id=d.id))::text));
end $$;

create function public.m122_preserve_preferences(p_library uuid,p_topic uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare d record; prior jsonb;
begin
 -- Lock order and all-deck coverage are unchanged. The row binds the preserved
 -- source to one canonical Topic; a newly added parent cannot gain a vote.
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 for d in select id from public.study_decks where library_id=p_library order by id for update loop
  prior:=public.m122_preference_projection(d.id,public.m122_legacy_preference_state(d.id)||jsonb_build_object('m122_include_dormant',true));
  insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,shared_compatibility_source)
  select deck.id,deck.user_id,deck.library_id,c.topic_id,(entry.value->>'balance')::integer,
   jsonb_build_object('version',1,'source',entry.value->>'source','origin',entry.value->>'origin','ancestors',entry.value->'ancestors')
  from public.study_decks deck cross join lateral public.m122_closure(p_library) c
  join jsonb_each(prior#>'{projection,official}') entry on entry.key=c.topic_id::text
  left join public.study_deck_node_preferences p on p.deck_id=deck.id and p.library_node_id=c.topic_id
  where deck.id=d.id and c.ancestor_id=p_topic and p.shared_compatibility_source is null
  on conflict(deck_id,library_node_id) do update set new_mastery_balance=excluded.new_mastery_balance,shared_compatibility_source=excluded.shared_compatibility_source;
 end loop;
end $$;

create function public.m122_require_revision(p_library uuid,p_revision text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 perform public.m122_require_library(p_library,true);
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Topic placement changes require READ COMMITTED' using errcode='40001';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 if p_revision is null or p_revision is distinct from public.m122_graph_revision(p_library) then
  raise exception 'Topics changed. Reload before changing this placement.' using errcode='PT409';
 end if;
end $$;

create function public.add_official_topic_placement(p_library_id uuid,p_topic_id uuid,p_parent_id uuid,p_before_edge_key text,p_expected_graph_revision text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare placement_id uuid:=gen_random_uuid(); sibling_keys text[]; anchor integer;
begin
 perform public.m122_require_revision(p_library_id,p_expected_graph_revision);
 if not exists(select 1 from public.library_nodes where id=p_topic_id and library_id=p_library_id and parent_id is not null)
 or not exists(select 1 from public.library_nodes where id=p_parent_id and library_id=p_library_id) then
  raise exception 'Existing official Topic and parent in the same Library required' using errcode='22023';
 end if;
 if exists(select 1 from public.m122_closure(p_library_id) where ancestor_id=p_topic_id and topic_id=p_parent_id) then
  raise exception 'Topic placement cycle' using errcode='23514';
 end if;
 if exists(select 1 from public.m122_edges(p_library_id) where parent_id=p_parent_id and topic_id=p_topic_id) then
  raise exception 'Topic already appears beneath this parent' using errcode='23505';
 end if;
 select coalesce(array_agg(edge_key order by sort_order,edge_key),'{}'::text[]) into sibling_keys from public.m122_edges(p_library_id) where parent_id=p_parent_id;
 anchor:=case when p_before_edge_key is null then cardinality(sibling_keys)+1 else array_position(sibling_keys,p_before_edge_key) end;
 if anchor is null then raise exception 'Invalid sibling position' using errcode='22023'; end if;
 perform public.m122_preserve_preferences(p_library_id,p_topic_id);
 insert into public.official_topic_placements(id,library_id,parent_node_id,topic_id,sort_order)
 values(placement_id,p_library_id,p_parent_id,p_topic_id,cardinality(sibling_keys));
 sibling_keys:=coalesce(sibling_keys[1:anchor-1],'{}')||array['placement:'||placement_id]||coalesce(sibling_keys[anchor:cardinality(sibling_keys)],'{}');
 perform public.m122_order_siblings(p_library_id,p_parent_id,sibling_keys);
 perform public.m122_check_graph(p_library_id);
 return public.get_official_topic_graph(p_library_id);
end $$;

create function public.position_official_topic_placement(p_library_id uuid,p_edge_key text,p_expected_parent_id uuid,p_destination_parent_id uuid,p_before_edge_key text,p_expected_source_edge_keys text[],p_expected_destination_edge_keys text[],p_expected_graph_revision text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare moving record; source_keys text[]; destination_keys text[]; anchor integer;
begin
 perform public.m122_require_revision(p_library_id,p_expected_graph_revision);
 select * into moving from public.m122_edges(p_library_id) where edge_key=p_edge_key;
 if not found or moving.parent_id is distinct from p_expected_parent_id then raise exception 'Stale Topic placement' using errcode='PT409'; end if;
 if not exists(select 1 from public.library_nodes where id=p_destination_parent_id and library_id=p_library_id) then
  raise exception 'Destination must be an official Topic in this Library' using errcode='22023';
 end if;
 if exists(select 1 from public.m122_closure(p_library_id) where ancestor_id=moving.topic_id and topic_id=p_destination_parent_id) then
  raise exception 'Topic placement cycle' using errcode='23514';
 end if;
 select coalesce(array_agg(edge_key order by sort_order,edge_key),'{}'::text[]) into source_keys from public.m122_edges(p_library_id) where parent_id=moving.parent_id;
 select coalesce(array_agg(edge_key order by sort_order,edge_key),'{}'::text[]) into destination_keys from public.m122_edges(p_library_id) where parent_id=p_destination_parent_id;
 if source_keys is distinct from p_expected_source_edge_keys or destination_keys is distinct from p_expected_destination_edge_keys then
  raise exception 'Topic sibling order changed. Reload Topics.' using errcode='PT409';
 end if;
 destination_keys:=array_remove(destination_keys,p_edge_key);
 anchor:=case when p_before_edge_key is null then cardinality(destination_keys)+1 else array_position(destination_keys,p_before_edge_key) end;
 if anchor is null then raise exception 'Invalid sibling position' using errcode='22023';end if;
 if moving.kind='primary' and moving.parent_id<>p_destination_parent_id then
  perform public.m122_preserve_preferences(p_library_id,moving.topic_id);
  update public.library_nodes set parent_id=p_destination_parent_id,sort_order=cardinality(destination_keys) where id=moving.topic_id;
 elsif moving.kind='placement' and moving.parent_id<>p_destination_parent_id then
  perform public.m122_preserve_preferences(p_library_id,moving.topic_id);
  update public.official_topic_placements set parent_node_id=p_destination_parent_id,sort_order=cardinality(destination_keys),updated_at=now() where 'placement:'||id=p_edge_key and library_id=p_library_id;
 end if;
 destination_keys:=coalesce(destination_keys[1:anchor-1],'{}')||array[p_edge_key]||coalesce(destination_keys[anchor:cardinality(destination_keys)],'{}');
 perform public.m122_order_siblings(p_library_id,p_destination_parent_id,destination_keys);
 if moving.parent_id<>p_destination_parent_id then perform public.m122_normalize_siblings(p_library_id,moving.parent_id);end if;
 perform public.m122_check_graph(p_library_id);
 return public.get_official_topic_graph(p_library_id);
end $$;

create function public.remove_official_topic_placement(p_library_id uuid,p_edge_key text,p_replacement_primary_edge_key text,p_expected_graph_revision text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare removing record; replacement record; promoted_order text[];
begin
 perform public.m122_require_revision(p_library_id,p_expected_graph_revision);
 select * into removing from public.m122_edges(p_library_id) where edge_key=p_edge_key;
 if not found then raise exception 'Topic placement no longer exists' using errcode='PT409';end if;
 if (select count(*) from public.m122_edges(p_library_id) where topic_id=removing.topic_id)<2 then
  raise exception 'The final Topic placement cannot be removed. Move it or use permanent deletion.' using errcode='23514';
 end if;
 if removing.kind='primary' then
  select * into replacement from public.m122_edges(p_library_id) where edge_key=p_replacement_primary_edge_key and topic_id=removing.topic_id and kind='placement';
  if not found then raise exception 'Choose a surviving placement to become the original location' using errcode='22023';end if;
  select array_agg(case when edge_key=replacement.edge_key then 'primary:'||removing.topic_id else edge_key end order by sort_order,edge_key) into promoted_order from public.m122_edges(p_library_id) where parent_id=replacement.parent_id;
  perform public.m122_preserve_preferences(p_library_id,removing.topic_id);
  -- Deferred union-graph checking allows promotion, but the final graph must be
  -- valid. No caller-settable integrity bypass is introduced.
  delete from public.official_topic_placements where 'placement:'||id=replacement.edge_key and library_id=p_library_id;
  update public.library_nodes set parent_id=replacement.parent_id,sort_order=replacement.sort_order where id=removing.topic_id and library_id=p_library_id;
  perform public.m122_order_siblings(p_library_id,replacement.parent_id,promoted_order);
 else
  if p_replacement_primary_edge_key is not null then raise exception 'Additional placement removal does not promote a location' using errcode='22023';end if;
  perform public.m122_preserve_preferences(p_library_id,removing.topic_id);
  delete from public.official_topic_placements where 'placement:'||id=p_edge_key and library_id=p_library_id;
 end if;
 perform public.m122_normalize_siblings(p_library_id,removing.parent_id);
 perform public.m122_check_graph(p_library_id);
 return public.get_official_topic_graph(p_library_id);
end $$;

create function public.m122_delete_impact(p_library uuid,p_topic uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; impact jsonb;
begin
 if not exists(select 1 from public.library_nodes where id=p_topic and library_id=p_library and parent_id is not null) then
  raise exception 'Non-root Topic in this Library required' using errcode='22023';end if;
 select array_agg(topic_id order by topic_id) into ids from public.m122_closure(p_library,false) where ancestor_id=p_topic;
 select jsonb_build_object('library_id',p_library,'topic_id',p_topic,'canonical_topic_ids',to_jsonb(ids),
  'incoming_locations',(select coalesce(jsonb_agg(to_jsonb(e) order by e.edge_key),'[]') from public.m122_edges(p_library) e where e.topic_id=p_topic),
  'removed_extra_locations',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.official_topic_placements p where p.library_id=p_library and (p.topic_id=any(ids) or p.parent_node_id=any(ids))),
  'concept_placements',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.concept_placements p where p.library_node_id=any(ids)),
  'article_placements',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.article_category_placements p where p.library_node_id=any(ids)),
  'affected_concept_ids',(select coalesce(jsonb_agg(distinct p.concept_id),'[]') from public.concept_placements p where p.library_node_id=any(ids)),
  'affected_question_ids',(select coalesce(jsonb_agg(q.id order by q.id),'[]') from public.questions q where exists(select 1 from public.concept_placements p where p.concept_id=q.concept_id and p.library_node_id=any(ids))),
  'content_records_deleted',false,
  'blockers',jsonb_build_object(
   'shared_descendants',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.official_topic_placements p where p.topic_id=any(ids) and p.topic_id<>p_topic and not p.parent_node_id=any(ids)),
   'personal_roots',(select coalesce(jsonb_agg(p.personal_topic_id order by p.personal_topic_id),'[]') from public.personal_topic_official_placements p where p.library_node_id=any(ids)),
   'standalone_cards',(select coalesce(jsonb_agg(c.id order by c.id),'[]') from public.personal_cards c where c.library_node_id=any(ids)),
   'prerequisites',(select coalesce(jsonb_agg(p.id order by p.id),'[]') from public.concept_prerequisites p where p.prerequisite_library_node_id=any(ids)))) into impact;
 return impact||jsonb_build_object('revision',md5(jsonb_build_object('graph',public.m122_graph_revision(p_library),'impact',impact)::text));
end $$;

create function public.get_official_topic_delete_impact(p_library_id uuid,p_topic_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 perform public.m122_require_library(p_library_id,true);
 return public.m122_delete_impact(p_library_id,p_topic_id);
end $$;

create function public.m122_require_deletable(p_library uuid,p_topic uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare impact jsonb;
begin
 impact:=public.m122_delete_impact(p_library,p_topic);
 if exists(select 1 from jsonb_each(impact->'blockers') b where jsonb_array_length(b.value)>0) then
  raise exception 'Topic has shared descendants or protected personal/content dependencies. Resolve them before permanent deletion.' using errcode='23503';
 end if;
end $$;

create function public.delete_official_topic_with_impact(p_library_id uuid,p_topic_id uuid,p_expected_impact_revision text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare impact jsonb;
begin
 perform public.m122_require_library(p_library_id,true);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Deletion requires READ COMMITTED' using errcode='40001';end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 -- Content writers do not all participate in the structural advisory lock.
 -- Freeze the impact inputs for this short destructive transaction so a new
 -- attachment cannot arrive after confirmation and disappear without review.
 lock table public.concept_placements,public.article_category_placements,
  public.questions,public.concept_prerequisites,public.personal_cards,
  public.personal_topic_official_placements in share row exclusive mode;
 impact:=public.m122_delete_impact(p_library_id,p_topic_id);
 if p_expected_impact_revision is null or impact->>'revision' is distinct from p_expected_impact_revision then
  raise exception 'Topic deletion impact changed. Review it again.' using errcode='PT409';end if;
 perform public.m122_require_deletable(p_library_id,p_topic_id);
 perform set_config('socrates.development_delete_actor',auth.uid()::text,true);
 perform public._development_delete_library_node(p_topic_id);
 return p_topic_id;
end $$;

create function public.m122_card_official_sources(p_card uuid,p_settings jsonb)
 returns table(source_key text,balance double precision)
 language sql stable security invoker set search_path='' as $$
 -- A standalone Card uses its canonical Topic's preserved contribution. Personal
 -- Topic and collection sources remain in the released m111 caller unchanged.
 select entry.value->>'source',coalesce((entry.value->>'balance')::double precision,50)
 from public.personal_cards card
 join jsonb_each(coalesce(p_settings#>'{topic_preference_state,projection,official}','{}')) entry on entry.key=card.library_node_id::text
 where card.id=p_card and card.owner_id=auth.uid() and card.concept_id is null;
$$;

-- Generated exact released-function adaptations.
CREATE OR REPLACE FUNCTION public.m122_legacy_preference_state(p_deck uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare d public.study_decks; u uuid; result jsonb;
begin
 select * into d from public.study_decks where id=p_deck;
 u:=d.user_id;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 with recursive graph as materialized(select * from public.m117_topic_graph(d.library_id,u)),
 official_directives as (
  select 'official:topic:'||node_id key,true included from public.user_study_node_selections where deck_id=d.id and user_id=u
  union all select 'official:topic:'||node_id,false from public.study_deck_node_exclusions where deck_id=d.id and user_id=u
 ), official_state as (
  select g.*,coalesce(nearest.included,false) included from graph g
  left join lateral(select x.included from official_directives x where x.key=any(g.ancestry)
   order by array_position(g.ancestry,x.key) desc,x.included limit 1) nearest on true where g.source='official'
 ), official_seeds as (
  select g.*,p.reset_source,coalesce(p.new_mastery_balance,50) balance,
   exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=g.topic_id and s.user_id=u) selected
  from official_state g left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=g.topic_id and p.user_id=u
  where (g.included and p.reset_source is not null)
   or exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=g.topic_id and s.user_id=u)
 ), official_sources as (
  select g.topic_id,g.balance,g.selected,
   right(origin.key,36)::uuid origin_id,
   case when g.reset_source is null then g.group_key else 'reset:'||g.reset_source||':'||origin.key end source_key
  from official_seeds g
  cross join lateral(select coalesce(max(array_position(g.ancestry,'official:topic:'||s.node_id)),1) idx
   from public.user_study_node_selections s where s.deck_id=d.id and ('official:topic:'||s.node_id)=any(g.ancestry)) anchor
  cross join lateral(select coalesce(max(a.idx)+1,anchor.idx) idx
   from unnest(g.ancestry) with ordinality a(key,idx)
   left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=right(a.key,36)::uuid
   where a.idx>=anchor.idx and p.reset_source is distinct from g.reset_source) boundary
  cross join lateral(select case when g.reset_source is null then g.group_key else g.ancestry[boundary.idx] end key) origin
 ), personal_roots as (
  select s.personal_topic_id id,s.personal_topic_id origin,true included from public.study_deck_personal_topic_selections s where s.deck_id=d.id and s.user_id=u
  union all select s.personal_topic_id,s.personal_topic_id,false from public.study_deck_personal_topic_exclusions s where s.deck_id=d.id and s.user_id=u
 ), personal_walk as (
  select r.*,0 distance,array[r.id] visited from personal_roots r join public.personal_topics t on t.id=r.id and t.owner_id=u
  union all select t.id,w.origin,w.included,w.distance+1,w.visited||t.id from personal_walk w join public.personal_topics t on t.parent_id=w.id and t.owner_id=u where not t.id=any(w.visited)
 ), personal_effective as (
  select distinct on(id) id topic_id,origin source_topic_id,included is_included from personal_walk order by id,distance,included,origin
 ), personal_sources as (
  select g.topic_id,coalesce(p.new_mastery_balance,legacy.new_mastery_balance,50) balance,
   case when p.reset_source is not null then 'reset:'||p.reset_source else 'personal:topic:'||e.source_topic_id end source_key
  from graph g join personal_effective e on e.topic_id=g.topic_id and e.is_included
  left join public.study_deck_personal_topic_preferences p on p.deck_id=d.id and p.personal_topic_id=g.topic_id and p.reset_source is not null
  left join public.study_deck_personal_topic_preferences legacy on legacy.deck_id=d.id and legacy.personal_topic_id=e.source_topic_id
  where g.source='personal'
 ), values_by_topic as (
  select g.group_key,coalesce(own.balance,ancestor.balance,50) balance from official_state g
  left join official_sources own on own.topic_id=g.topic_id
  left join lateral(select s.balance from official_sources s where s.selected and ('official:topic:'||s.topic_id)=any(g.ancestry)
   order by array_position(g.ancestry,'official:topic:'||s.topic_id) desc limit 1) ancestor on true
  union all select g.group_key,coalesce(s.balance,p.new_mastery_balance,50) from graph g
  left join personal_sources s on s.topic_id=g.topic_id
  left join public.study_deck_personal_topic_preferences p on p.deck_id=d.id and p.personal_topic_id=g.topic_id
  where g.source='personal'
 ), revision_state as (
  select jsonb_build_object('deck',jsonb_build_array(d.id,d.user_id,d.library_id,d.is_active,d.cram_mode),
   'graph',(select coalesce(jsonb_agg(to_jsonb(g) order by group_key),'[]') from graph g),
   'official_preferences',(select coalesce(jsonb_agg(to_jsonb(p)-'shared_compatibility_source' order by library_node_id),'[]') from public.study_deck_node_preferences p where deck_id=d.id),
   'personal_preferences',(select coalesce(jsonb_agg(to_jsonb(p) order by personal_topic_id),'[]') from public.study_deck_personal_topic_preferences p where deck_id=d.id),
   'official_directives',(select coalesce(jsonb_agg(to_jsonb(x) order by key,included),'[]') from official_directives x),
   'overrides',(select coalesce(jsonb_agg(to_jsonb(x) order by concept_id),'[]') from public.user_study_concept_overrides x where deck_id=d.id),
   'personal_includes',(select coalesce(jsonb_agg(to_jsonb(x) order by personal_topic_id),'[]') from public.study_deck_personal_topic_selections x where deck_id=d.id),
   'personal_excludes',(select coalesce(jsonb_agg(to_jsonb(x) order by personal_topic_id),'[]') from public.study_deck_personal_topic_exclusions x where deck_id=d.id)) data
 ) select jsonb_build_object('version',117,'deck_id',d.id,'library_id',d.library_id,
  'revision',md5(revision_state.data::text),
  'values',(select coalesce(jsonb_object_agg(group_key,balance),'{}') from values_by_topic),
  'projection',jsonb_build_object('version',117,
   'official',(select coalesce(jsonb_object_agg(topic_id,jsonb_build_object('balance',balance,'source',source_key,'selected',selected,'origin',origin_id)),'{}') from official_sources),
   'personal',(select coalesce(jsonb_object_agg(topic_id,jsonb_build_object('balance',balance,'source',source_key)),'{}') from personal_sources)))
 into result from revision_state;
 return result;
end $function$
;

set local role socrates_migrator;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.m117_preference_state(p_deck uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare d public.study_decks; u uuid:=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid; result jsonb;
begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501'; end if;
 select * into d from public.study_decks where id=p_deck and user_id=u and is_active
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=study_decks.library_id));
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 with recursive graph as materialized(select * from public.m117_topic_graph(d.library_id,u)),
 official_directives as (
  select 'official:topic:'||node_id key,true included from public.user_study_node_selections where deck_id=d.id and user_id=u
  union all select 'official:topic:'||node_id,false from public.study_deck_node_exclusions where deck_id=d.id and user_id=u
 ), official_state as (
  select g.*,coalesce(nearest.included,false) included from graph g
  left join lateral(select x.included from official_directives x where x.key=any(g.ancestry)
   order by array_position(g.ancestry,x.key) desc,x.included limit 1) nearest on true where g.source='official'
 ), official_seeds as (
  select g.*,p.reset_source,coalesce(p.new_mastery_balance,50) balance,
   exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=g.topic_id and s.user_id=u) selected
  from official_state g left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=g.topic_id and p.user_id=u
  where (g.included and p.reset_source is not null)
   or exists(select 1 from public.user_study_node_selections s where s.deck_id=d.id and s.node_id=g.topic_id and s.user_id=u)
 ), official_sources as (
  select g.topic_id,g.balance,g.selected,
   right(origin.key,36)::uuid origin_id,
   case when g.reset_source is null then g.group_key else 'reset:'||g.reset_source||':'||origin.key end source_key
  from official_seeds g
  cross join lateral(select coalesce(max(array_position(g.ancestry,'official:topic:'||s.node_id)),1) idx
   from public.user_study_node_selections s where s.deck_id=d.id and ('official:topic:'||s.node_id)=any(g.ancestry)) anchor
  cross join lateral(select coalesce(max(a.idx)+1,anchor.idx) idx
   from unnest(g.ancestry) with ordinality a(key,idx)
   left join public.study_deck_node_preferences p on p.deck_id=d.id and p.library_node_id=right(a.key,36)::uuid
   where a.idx>=anchor.idx and p.reset_source is distinct from g.reset_source) boundary
  cross join lateral(select case when g.reset_source is null then g.group_key else g.ancestry[boundary.idx] end key) origin
 ), personal_roots as (
  select s.personal_topic_id id,s.personal_topic_id origin,true included from public.study_deck_personal_topic_selections s where s.deck_id=d.id and s.user_id=u
  union all select s.personal_topic_id,s.personal_topic_id,false from public.study_deck_personal_topic_exclusions s where s.deck_id=d.id and s.user_id=u
 ), personal_walk as (
  select r.*,0 distance,array[r.id] visited from personal_roots r join public.personal_topics t on t.id=r.id and t.owner_id=u
  union all select t.id,w.origin,w.included,w.distance+1,w.visited||t.id from personal_walk w join public.personal_topics t on t.parent_id=w.id and t.owner_id=u where not t.id=any(w.visited)
 ), personal_effective as (
  select distinct on(id) id topic_id,origin source_topic_id,included is_included from personal_walk order by id,distance,included,origin
 ), personal_sources as (
  select g.topic_id,coalesce(p.new_mastery_balance,legacy.new_mastery_balance,50) balance,
   case when p.reset_source is not null then 'reset:'||p.reset_source else 'personal:topic:'||e.source_topic_id end source_key
  from graph g join personal_effective e on e.topic_id=g.topic_id and e.is_included
  left join public.study_deck_personal_topic_preferences p on p.deck_id=d.id and p.personal_topic_id=g.topic_id and p.reset_source is not null
  left join public.study_deck_personal_topic_preferences legacy on legacy.deck_id=d.id and legacy.personal_topic_id=e.source_topic_id
  where g.source='personal'
 ), values_by_topic as (
  select g.group_key,coalesce(own.balance,ancestor.balance,50) balance from official_state g
  left join official_sources own on own.topic_id=g.topic_id
  left join lateral(select s.balance from official_sources s where s.selected and ('official:topic:'||s.topic_id)=any(g.ancestry)
   order by array_position(g.ancestry,'official:topic:'||s.topic_id) desc limit 1) ancestor on true
  union all select g.group_key,coalesce(s.balance,p.new_mastery_balance,50) from graph g
  left join personal_sources s on s.topic_id=g.topic_id
  left join public.study_deck_personal_topic_preferences p on p.deck_id=d.id and p.personal_topic_id=g.topic_id
  where g.source='personal'
 ), revision_state as (
  select jsonb_build_object('deck',jsonb_build_array(d.id,d.user_id,d.library_id,d.is_active,d.cram_mode),
   'graph',(select coalesce(jsonb_agg(to_jsonb(g) order by group_key),'[]') from graph g),
   'official_preferences',(select coalesce(jsonb_agg(to_jsonb(p)-'shared_compatibility_source' order by library_node_id),'[]') from public.study_deck_node_preferences p where deck_id=d.id),
   'personal_preferences',(select coalesce(jsonb_agg(to_jsonb(p) order by personal_topic_id),'[]') from public.study_deck_personal_topic_preferences p where deck_id=d.id),
   'official_directives',(select coalesce(jsonb_agg(to_jsonb(x) order by key,included),'[]') from official_directives x),
   'overrides',(select coalesce(jsonb_agg(to_jsonb(x) order by concept_id),'[]') from public.user_study_concept_overrides x where deck_id=d.id),
   'personal_includes',(select coalesce(jsonb_agg(to_jsonb(x) order by personal_topic_id),'[]') from public.study_deck_personal_topic_selections x where deck_id=d.id),
   'personal_excludes',(select coalesce(jsonb_agg(to_jsonb(x) order by personal_topic_id),'[]') from public.study_deck_personal_topic_exclusions x where deck_id=d.id)) data
 ) select jsonb_build_object('version',117,'deck_id',d.id,'library_id',d.library_id,
  'revision',md5(revision_state.data::text),
  'values',(select coalesce(jsonb_object_agg(group_key,balance),'{}') from values_by_topic),
  'projection',jsonb_build_object('version',117,
   'official',(select coalesce(jsonb_object_agg(topic_id,jsonb_build_object('balance',balance,'source',source_key,'selected',selected,'origin',origin_id)),'{}') from official_sources),
   'personal',(select coalesce(jsonb_object_agg(topic_id,jsonb_build_object('balance',balance,'source',source_key)),'{}') from personal_sources)))
 into result from revision_state;
 return public.m122_preference_projection(d.id,result);
end $function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.m117_preference_state(uuid)'::regprocedure))<>'0d2b7b0f5b26385f173299a312ad2849' then raise exception '122 unexpected function baseline: m117_preference_state(uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.m117_preference_state(uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.m117_preference_state(uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.resolve_effective_study_nodes(p_deck_id uuid)
 RETURNS TABLE(node_id uuid, source_node_id uuid, source_state text, source_distance integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive deck as (
    select study_deck.id, study_deck.user_id, study_deck.library_id
    from public.study_decks study_deck
    where study_deck.id = p_deck_id
      and study_deck.user_id = (select auth.uid())
      and public.has_socrates_role()
      and (
        public.is_editor_or_admin()
        or exists (
          select 1
          from public.user_libraries membership
          where membership.user_id = (select auth.uid())
            and membership.library_id = study_deck.library_id
        )
      )
  ),
  resolved as (
    select e.* from deck d cross join lateral public.m122_effective_nodes(d.id) e
  ) select * from resolved;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.resolve_effective_study_nodes(uuid)'::regprocedure))<>'dd458aa2a36975cae173603ce0ac91da' then raise exception '122 unexpected function baseline: resolve_effective_study_nodes(uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.resolve_effective_study_nodes(uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.resolve_effective_study_nodes(uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.set_study_deck_node_selection(p_deck_id uuid, p_node_id uuid, p_should_include boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  selected_ids jsonb;
  excluded_ids jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to update this Study deck.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_deck_id
    and deck.user_id = current_user_id
    and deck.is_active
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.user_libraries membership
        where membership.user_id = current_user_id
          and membership.library_id = deck.library_id
      )
    )
  for update;

  if target_deck.id is null then
    raise exception 'Active Study deck not found.';
  end if;

  if p_should_include is null then
    raise exception 'Topic selection state is required.';
  end if;

  perform 1
  from public.library_nodes node
  where node.id = p_node_id
    and node.library_id = target_deck.library_id
  for share;

  if not found then
    raise exception 'Topic does not belong to this Study deck Library.';
  end if;

  -- A branch click is a complete instruction for that branch. Remove older
  -- nested directives first so hidden exceptions cannot surprise the learner.
  with recursive subtree(id, visited) as (
    select node.id, array[node.id]::uuid[]
    from public.library_nodes node
    where node.id = p_node_id
      and node.library_id = target_deck.library_id

    union all

    select child.id, parent.visited || child.id
    from subtree parent
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = target_deck.library_id
     and not child.id = any(parent.visited)
  )
  delete from public.user_study_node_selections selection
  using subtree
  where selection.deck_id = target_deck.id
    and selection.node_id = subtree.id
    and (selection.node_id=p_node_id or not exists(select 1 from public.m122_shared_nodes(target_deck.library_id) z where z.topic_id=selection.node_id));

  with recursive subtree(id, visited) as (
    select node.id, array[node.id]::uuid[]
    from public.library_nodes node
    where node.id = p_node_id
      and node.library_id = target_deck.library_id

    union all

    select child.id, parent.visited || child.id
    from subtree parent
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = target_deck.library_id
     and not child.id = any(parent.visited)
  )
  delete from public.study_deck_node_exclusions exclusion
  using subtree
  where exclusion.deck_id = target_deck.id
    and exclusion.node_id = subtree.id
    and not exists(select 1 from public.m122_shared_nodes(target_deck.library_id) z where z.topic_id=exclusion.node_id);

  if p_should_include then
    if exists(select 1 from public.m122_shared_nodes(target_deck.library_id) z where z.topic_id=p_node_id) or not exists (
      select 1
      from public.resolve_effective_study_nodes(target_deck.id) effective
      where effective.node_id = p_node_id
    ) then
      insert into public.user_study_node_selections (
        deck_id,
        user_id,
        library_id,
        node_id
      )
      values (
        target_deck.id,
        current_user_id,
        target_deck.library_id,
        p_node_id
      );
    end if;
  elsif not exists(select 1 from public.m122_shared_nodes(target_deck.library_id) z where z.topic_id=p_node_id) and exists (
    select 1
    from public.resolve_effective_study_nodes(target_deck.id) effective
    where effective.node_id = p_node_id
  ) then
    insert into public.study_deck_node_exclusions (
      deck_id,
      user_id,
      library_id,
      node_id
    )
    values (
      target_deck.id,
      current_user_id,
      target_deck.library_id,
      p_node_id
    );
  end if;

  select coalesce(
    jsonb_agg(selection.node_id order by selection.node_id::text),
    '[]'::jsonb
  )
  into selected_ids
  from public.user_study_node_selections selection
  where selection.deck_id = target_deck.id;

  select coalesce(
    jsonb_agg(exclusion.node_id order by exclusion.node_id::text),
    '[]'::jsonb
  )
  into excluded_ids
  from public.study_deck_node_exclusions exclusion
  where exclusion.deck_id = target_deck.id;

  return jsonb_build_object(
    'selected_node_ids', selected_ids,
    'excluded_node_ids', excluded_ids
  );
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.set_study_deck_node_selection(uuid,uuid,boolean)'::regprocedure))<>'fbdb2915cc4406045cea9457797f2183' then raise exception '122 unexpected function baseline: set_study_deck_node_selection(uuid,uuid,boolean)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.set_study_deck_node_selection(uuid,uuid,boolean)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.set_study_deck_node_selection(uuid,uuid,boolean)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role socrates_migrator;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.set_study_deck_topic_subtree_preference(p_deck_id uuid, p_library_id uuid, p_group_key text, p_balance integer, p_expected_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.study_decks; u uuid:=(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid; before_state jsonb; root record; reset_id uuid:=gen_random_uuid();
begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501'; end if;
 if p_balance is null or p_balance not between 0 and 100 or p_expected_revision is null then raise exception 'Balance and confirmed revision required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and library_id=p_library_id and is_active
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=p_library_id)) for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501'; end if;
 before_state:=public.m117_preference_state(d.id);
 if before_state->>'revision' is distinct from p_expected_revision then raise exception 'Deck settings or Topics changed. Reload Home before saving.' using errcode='40001'; end if;
 select * into root from public.m117_topic_graph(p_library_id,u) where group_key=p_group_key;
 if not found then raise exception 'Authorized Topic required' using errcode='42501'; end if;
 -- Only selected sources/descendants can initiate a reset. An ancestor reset
 -- also overwrites dormant preferences without altering their eligibility.
 if root.source='official' then
  if not exists(select 1 from public.m122_effective_nodes(d.id) e where e.node_id=root.topic_id) then
   raise exception 'Selected Topic required' using errcode='42501';
  end if;
 elsif not (before_state->'projection'->'personal' ? root.topic_id::text) then raise exception 'Selected Topic required' using errcode='42501'; end if;
 insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,reset_source)
 select d.id,u,d.library_id,g.topic_id,p_balance,reset_id from public.m122_closure(p_library_id) g where root.source='official' and g.ancestor_id=root.topic_id
 on conflict(deck_id,library_node_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source,shared_compatibility_source=null;
 insert into public.study_deck_personal_topic_preferences(deck_id,user_id,library_id,personal_topic_id,new_mastery_balance,reset_source)
 select d.id,u,d.library_id,g.topic_id,p_balance,reset_id from public.m117_topic_graph(p_library_id,u) g where g.source='personal' and p_group_key=any(g.ancestry)
 on conflict(deck_id,personal_topic_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source;
 -- An explicit reset deliberately establishes fresh source relationships. The
 -- canonical balance/reset rows were written atomically above; no second value
 -- is stored in provenance, and dormant descendants receive the same reset.
 if root.source='official' and before_state->>'version'='122' then
  update public.study_deck_node_preferences p set shared_compatibility_source=
   jsonb_build_object('version',1,'source',entry.value->>'source','origin',entry.value->>'origin','ancestors',entry.value->'ancestors')
  from jsonb_each(public.m122_preference_projection(d.id,public.m122_legacy_preference_state(d.id)||jsonb_build_object('m122_include_dormant',true))#>'{projection,official}') entry
  where p.deck_id=d.id and p.reset_source=reset_id and p.library_node_id::text=entry.key;
 end if;
 return public.m117_preference_state(d.id);
end $function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)'::regprocedure))<>'245f4bb29eff6b1a76405f880ac85109' then raise exception '122 unexpected function baseline: set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.get_home_study_bootstrap(p_library_id uuid, p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  result jsonb;
  home_topic_ids uuid[];
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to load Home study data.';
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_deck_id
    and deck.library_id = p_library_id
    and deck.user_id = current_user_id
    and deck.is_active;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized for this Library.';
  end if;

  -- Exclude only branches with a proven canonical root in another Library.
  -- Unplaced roots, missing parents and cycles stay visible to Home's existing
  -- fail-closed composer. This is projection, never a Study eligibility change.
  with recursive other_library_topics(id) as (
    select topic.id
    from public.personal_topics topic
    join public.personal_topic_official_placements placement
      on placement.personal_topic_id = topic.id
     and placement.owner_id = current_user_id
    join public.library_nodes node on node.id = placement.library_node_id
    where topic.owner_id = current_user_id and topic.parent_id is null
      and node.library_id <> p_library_id
    union
    select child.id from public.personal_topics child
    join other_library_topics parent on parent.id = child.parent_id
    where child.owner_id = current_user_id
  )
  select coalesce(array_agg(topic.id order by topic.id), '{}'::uuid[])
  into home_topic_ids
  from public.personal_topics topic
  where topic.owner_id = current_user_id
    and not exists(select 1 from other_library_topics other where other.id = topic.id);

  select jsonb_build_object(
    'available_libraries',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', library.id,
              'name', library.name,
              'slug', library.slug,
              'description', library.description,
              'status', library.status
            )
            order by library.name, library.id
          )
          from public.libraries library
          where library.status = 'active'
            and (
              public.is_editor_or_admin()
              or library.id = p_library_id
            )
        ),
        '[]'::jsonb
      ),
    'nodes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', node.id,
              'name', node.name,
              'node_type', node.node_type,
              'parent_id', node.parent_id
            )
            order by node.name, node.id
          )
          from public.library_nodes node
          where node.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'placements',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'concept_id', placement.concept_id,
              'library_node_id', placement.library_node_id,
              'concepts', jsonb_build_object(
                'id', concept.id,
                'name', concept.name,
                'concept_type', concept.concept_type,
                'summary', concept.summary
              )
            )
            order by placement.library_node_id, placement.concept_id
          )
          from public.concept_placements placement
          join public.library_nodes node
            on node.id = placement.library_node_id
           and node.library_id = p_library_id
          join public.concepts concept
            on concept.id = placement.concept_id
           and concept.status = 'published'
        ),
        '[]'::jsonb
      ),
    'selected_node_ids',
      coalesce(
        (
          select jsonb_agg(selection.node_id order by selection.node_id)
          from public.user_study_node_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'excluded_node_ids',
      coalesce(
        (
          select jsonb_agg(exclusion.node_id order by exclusion.node_id)
          from public.study_deck_node_exclusions exclusion
          where exclusion.deck_id = target_deck.id
            and exclusion.user_id = current_user_id
            and exclusion.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'node_preferences',
      coalesce(
        (
          select jsonb_object_agg(
            preference.library_node_id::text,
            preference.new_mastery_balance
            order by preference.library_node_id::text
          )
          from public.study_deck_node_preferences preference
          where preference.deck_id = target_deck.id
            and preference.user_id = current_user_id
            and preference.library_id = p_library_id
        ),
        '{}'::jsonb
      ),
    'concept_overrides',
      coalesce(
        (
          select jsonb_object_agg(
            override.concept_id::text,
            override.selection_state
            order by override.concept_id::text
          )
          from public.user_study_concept_overrides override
          where override.deck_id = target_deck.id
            and override.user_id = current_user_id
            and override.library_id = p_library_id
        ),
        '{}'::jsonb
      ),
    'resolved_concepts',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(resolved)
            order by lower(resolved.concept_name), resolved.concept_id
          )
          from public.resolve_study_deck(target_deck.id) resolved
        ),
        '[]'::jsonb
      ),
    'library_availability_question_counts',
      public.get_library_official_availability_counts(p_library_id),
    -- Retained wire field: selected-deck candidates, never Library availability.
    'official_question_counts',
      coalesce(
        (
          select jsonb_object_agg(
            count_row.concept_id::text,
            count_row.question_count
            order by count_row.concept_id::text
          )
          from (
            select
              candidate.official_concept_id as concept_id,
              count(distinct candidate.official_question_id)::integer
                as question_count
            from public.resolve_study_candidates(target_deck.id) candidate
            where candidate.candidate_type = 'official'
              and candidate.official_concept_id is not null
              and candidate.official_question_id is not null
            group by candidate.official_concept_id
          ) count_row
        ),
        '{}'::jsonb
      ),
    'learner_progress',
      public.get_library_learner_progress(p_library_id),
    'personal_topics',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', topic.id,
              'parent_id', topic.parent_id,
              'name', topic.name,
              'sort_order', topic.sort_order
            )
            order by topic.sort_order, topic.name, topic.id
          )
          from public.personal_topics topic
          where topic.owner_id = current_user_id
            and topic.id = any(home_topic_ids)
        ),
        '[]'::jsonb
      ),
    'personal_topic_placements',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'personal_topic_id', placement.personal_topic_id,
          'library_node_id', placement.library_node_id
        ) order by placement.personal_topic_id)
        from public.personal_topic_official_placements placement
        where placement.owner_id = current_user_id
          and placement.personal_topic_id = any(home_topic_ids)
      ), '[]'::jsonb),
    'personal_concepts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', concept.id,
              'topic_id', concept.topic_id,
              'name', concept.name
            )
            order by concept.name, concept.id
          )
          from public.personal_concepts concept
          where concept.owner_id = current_user_id
            and concept.topic_id = any(home_topic_ids)
        ),
        '[]'::jsonb
      ),
    'personal_cards',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', card.id,
              'concept_id', card.concept_id,
              'library_node_id', card.library_node_id,
              'library_id', card.library_id,
              'personal_topic_id', card.personal_topic_id
            )
            order by card.created_at, card.id
          )
          from public.personal_cards card
          where card.owner_id = current_user_id
            and (
              card.personal_topic_id = any(home_topic_ids)
              or (card.library_id = p_library_id and exists(
                select 1 from public.library_nodes node
                where node.id = card.library_node_id and node.library_id = p_library_id
              ))
              or exists(select 1 from public.personal_concepts concept
                where concept.id = card.concept_id and concept.owner_id = current_user_id
                  and concept.topic_id = any(home_topic_ids))
            )
        ),
        '[]'::jsonb
      ),
    'selected_personal_topic_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_topic_id
            order by selection.personal_topic_id
          )
          from public.study_deck_personal_topic_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'personal_collections',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', collection.id,
              'name', collection.name,
              'card_count', (
                select count(*)::integer
                from public.personal_collection_cards membership
                where membership.collection_id = collection.id
                  and membership.owner_id = current_user_id
              )
            )
            order by collection.name, collection.id
          )
          from public.personal_collections collection
          where collection.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'selected_personal_collection_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_collection_id
            order by selection.personal_collection_id
          )
          from public.study_deck_personal_collection_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      )
  )
  into result;

  result := result || jsonb_build_object('unified_deck_settings',public.m109_settings_snapshot(target_deck.id),
    'personal_topic_preferences',(select coalesce(jsonb_object_agg(personal_topic_id,new_mastery_balance),'{}') from public.study_deck_personal_topic_preferences where deck_id=target_deck.id),
    'personal_collection_preferences',(select coalesce(jsonb_object_agg(personal_collection_id,new_mastery_balance),'{}') from public.study_deck_personal_collection_preferences where deck_id=target_deck.id),
    'personal_collection_groups',(select coalesce(jsonb_agg(jsonb_build_object('group_key','personal:collection:'||c.id::text,'collection_id',c.id,'selected',exists(select 1 from public.study_deck_personal_collection_selections cs where cs.deck_id=target_deck.id and cs.personal_collection_id=c.id)) order by c.id),'[]') from public.personal_collections c where c.owner_id=current_user_id),
    'unified_deck_capabilities',jsonb_build_object('branch_selection',true,'group_balance',true,'calibration_version',1));
  if exists(select 1 from public.official_topic_placements where library_id=p_library_id) then
    result:=result||jsonb_build_object('official_topic_graph',public.get_official_topic_graph(p_library_id));
  end if;
  return result;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.get_home_study_bootstrap(uuid,uuid)'::regprocedure))<>'7bbc5b4b4259856c7ad1ccd3cad4322e' then raise exception '122 unexpected function baseline: get_home_study_bootstrap(uuid,uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.get_home_study_bootstrap(uuid,uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.get_home_study_bootstrap(uuid,uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.get_library_learner_progress(p_library_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to read learner progress.';
  end if;

  if not exists (
    select 1
    from public.libraries library_record
    where library_record.id = p_library_id
      and library_record.status = 'active'
  ) then
    raise exception 'Active Library not found.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized to read progress for this Library.';
  end if;

  with recursive node_closure as (
    select ancestor_id branch_id,topic_id descendant_id from public.m122_closure(p_library_id)
  ),
  branch_concepts as (
    select distinct
      closure.branch_id,
      placement.concept_id
    from node_closure closure
    join public.concept_placements placement
      on placement.library_node_id = closure.descendant_id
    join public.concepts concept
      on concept.id = placement.concept_id
     and concept.status = 'published'
  ),
  library_concepts as (
    select distinct branch_concept.concept_id
    from branch_concepts branch_concept
  ),
  user_attempt_counts as (
    select
      attempt.concept_id,
      count(*)::integer as question_attempts
    from public.review_attempts attempt
    join library_concepts library_concept
      on library_concept.concept_id = attempt.concept_id
    where attempt.user_id = current_user_id
    group by attempt.concept_id
  ),
  node_metrics as (
    select
      node.id as library_node_id,
      node.name,
      node.parent_id,
      node.sort_order,
      count(branch_concept.concept_id)::integer as total_concepts,
      count(mastery.concept_id)::integer as assessed_concepts,
      (count(branch_concept.concept_id) - count(mastery.concept_id))::integer
        as unseen_concepts,
      case
        when count(mastery.concept_id) = 0 then null
        else round(avg(mastery.mastery_estimate) * 100, 1)
      end as assessed_mastery_percent,
      case
        when count(branch_concept.concept_id) = 0 then 0::numeric
        else round(
          sum(coalesce(mastery.mastery_estimate, 0::numeric))
            * 100
            / count(branch_concept.concept_id),
          1
        )
      end as coverage_adjusted_progress_percent,
      coalesce(sum(mastery.evidence_count), 0)::integer as evidence_count,
      coalesce(sum(attempt_count.question_attempts), 0)::integer
        as questions_answered
    from public.library_nodes node
    left join branch_concepts branch_concept
      on branch_concept.branch_id = node.id
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = branch_concept.concept_id
    left join user_attempt_counts attempt_count
      on attempt_count.concept_id = branch_concept.concept_id
    where node.library_id = p_library_id
    group by node.id, node.name, node.parent_id, node.sort_order
  ),
  library_metrics as (
    select
      count(library_concept.concept_id)::integer as total_concepts,
      count(mastery.concept_id)::integer as assessed_concepts,
      (count(library_concept.concept_id) - count(mastery.concept_id))::integer
        as unseen_concepts,
      case
        when count(mastery.concept_id) = 0 then null
        else round(avg(mastery.mastery_estimate) * 100, 1)
      end as assessed_mastery_percent,
      case
        when count(library_concept.concept_id) = 0 then 0::numeric
        else round(
          sum(coalesce(mastery.mastery_estimate, 0::numeric))
            * 100
            / count(library_concept.concept_id),
          1
        )
      end as coverage_adjusted_progress_percent,
      coalesce(sum(mastery.evidence_count), 0)::integer as evidence_count,
      coalesce(sum(attempt_count.question_attempts), 0)::integer
        as questions_answered
    from library_concepts library_concept
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = library_concept.concept_id
    left join user_attempt_counts attempt_count
      on attempt_count.concept_id = library_concept.concept_id
  ),
  recent_session_rows as (
    select
      session.id,
      session.study_deck_id,
      deck.name as deck_name,
      session.started_at,
      session.ended_at,
      session.answered_count
    from public.study_sessions session
    left join public.study_decks deck on deck.id = session.study_deck_id
    where session.user_id = current_user_id
      and session.library_id = p_library_id
    order by session.started_at desc, session.id
    limit 5
  )
  select jsonb_build_object(
    'library_id', p_library_id,
    'summary', jsonb_build_object(
      'total_concepts', metrics.total_concepts,
      'assessed_concepts', metrics.assessed_concepts,
      'unseen_concepts', metrics.unseen_concepts,
      'assessed_mastery_percent', metrics.assessed_mastery_percent,
      'coverage_adjusted_progress_percent',
        metrics.coverage_adjusted_progress_percent,
      'evidence_count', metrics.evidence_count,
      'questions_answered', metrics.questions_answered,
      'recent_session_count', (
        select count(*)::integer
        from public.study_sessions session
        where session.user_id = current_user_id
          and session.library_id = p_library_id
          and session.started_at >= now() - interval '30 days'
      )
    ),
    'nodes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'library_node_id', node_metric.library_node_id,
            'name', node_metric.name,
            'parent_id', node_metric.parent_id,
            'sort_order', node_metric.sort_order,
            'total_concepts', node_metric.total_concepts,
            'assessed_concepts', node_metric.assessed_concepts,
            'unseen_concepts', node_metric.unseen_concepts,
            'assessed_mastery_percent',
              node_metric.assessed_mastery_percent,
            'coverage_adjusted_progress_percent',
              node_metric.coverage_adjusted_progress_percent,
            'evidence_count', node_metric.evidence_count,
            'questions_answered', node_metric.questions_answered
          )
          order by node_metric.sort_order, lower(node_metric.name),
            node_metric.library_node_id
        )
        from node_metrics node_metric
      ),
      '[]'::jsonb
    ),
    'recent_sessions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', recent_session.id,
            'study_deck_id', recent_session.study_deck_id,
            'deck_name', recent_session.deck_name,
            'started_at', recent_session.started_at,
            'ended_at', recent_session.ended_at,
            'answered_count', recent_session.answered_count
          )
          order by recent_session.started_at desc, recent_session.id
        )
        from recent_session_rows recent_session
      ),
      '[]'::jsonb
    )
  )
  into result
  from library_metrics metrics;

  return result;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.get_library_learner_progress(uuid)'::regprocedure))<>'39b3b17a2e29d3dd41fc20ba24a0c70b' then raise exception '122 unexpected function baseline: get_library_learner_progress(uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.get_library_learner_progress(uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.get_library_learner_progress(uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role socrates_migrator;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.m109_settings_snapshot(p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();r jsonb;topic_state jsonb;begin
 if not exists(select 1 from public.study_decks d where d.id=p_deck_id and d.user_id=u) then raise exception 'Owned Deck required' using errcode='42501';end if;
 select jsonb_build_object('version',109,'calibration_version',1,
 'included_topic_ids',(select coalesce(jsonb_agg(s.personal_topic_id order by s.personal_topic_id),'[]') from public.study_deck_personal_topic_selections s where s.deck_id=p_deck_id and s.user_id=u),
 'excluded_topic_ids',(select coalesce(jsonb_agg(s.personal_topic_id order by s.personal_topic_id),'[]') from public.study_deck_personal_topic_exclusions s where s.deck_id=p_deck_id and s.user_id=u),
 'topic_states',public.m109_topic_states(p_deck_id),
 'effective_topic_sources',(select coalesce(jsonb_object_agg(e.topic_id,e.source_topic_id),'{}') from public.m109_effective_topics(p_deck_id) e where e.is_included),
 'effective_topics',(select coalesce(jsonb_agg(to_jsonb(e) order by e.topic_id),'[]') from public.m109_effective_topics(p_deck_id) e),
 'selected_collection_ids',(select coalesce(jsonb_agg(s.personal_collection_id order by s.personal_collection_id),'[]') from public.study_deck_personal_collection_selections s where s.deck_id=p_deck_id and s.user_id=u),
 'topic_preferences',(select coalesce(jsonb_object_agg(s.personal_topic_id,coalesce(p.new_mastery_balance,50)),'{}') from public.study_deck_personal_topic_selections s left join public.study_deck_personal_topic_preferences p using(deck_id,personal_topic_id) where s.deck_id=p_deck_id and s.user_id=u),
 'collection_preferences',(select coalesce(jsonb_object_agg(s.personal_collection_id,coalesce(p.new_mastery_balance,50)),'{}') from public.study_deck_personal_collection_selections s left join public.study_deck_personal_collection_preferences p using(deck_id,personal_collection_id) where s.deck_id=p_deck_id and s.user_id=u)) into r;
 topic_state:=public.m117_preference_state(p_deck_id);
 if topic_state#>>'{projection,version}' not in ('117','122') then raise exception 'Unsupported Topic preference projection' using errcode='22023';end if;
 return r || jsonb_build_object('topic_preference_state',topic_state);
end
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.m109_settings_snapshot(uuid)'::regprocedure))<>'c548b86a1ea9aa520f43618c8f882acf' then raise exception '122 unexpected function baseline: m109_settings_snapshot(uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.m109_settings_snapshot(uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.m109_settings_snapshot(uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.create_library_node_in_library(p_library_id uuid, p_parent_id uuid, p_name text, p_node_type text DEFAULT 'topic'::text, p_sort_order integer DEFAULT 0)
 RETURNS library_nodes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  parent_node public.library_nodes%rowtype;
  existing_node public.library_nodes%rowtype;
  created_node public.library_nodes%rowtype;
  cleaned_name text := btrim(coalesce(p_name, ''));
  normalized_node_type text := coalesce(nullif(btrim(p_node_type), ''), 'topic');
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create library categories';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if cleaned_name = '' then
    raise exception 'Category name is required';
  end if;

  if normalized_node_type not in ('section', 'chapter', 'topic', 'module') then
    raise exception 'Invalid library node type: %', normalized_node_type;
  end if;

  select *
  into parent_node
  from public.library_nodes ln
  where ln.id = p_parent_id;

  if parent_node.id is null then
    raise exception 'Parent category was not found';
  end if;

  if parent_node.library_id is distinct from p_library_id then
    raise exception 'Parent category does not belong to the active library';
  end if;

  select *
  into existing_node
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and exists(select 1 from public.m122_edges(p_library_id) e where e.topic_id=ln.id and e.parent_id=p_parent_id)
    and lower(btrim(ln.name)) = lower(cleaned_name)
  order by ln.created_at, ln.id
  limit 1;

  if existing_node.id is not null then
    return existing_node;
  end if;

  insert into public.library_nodes (
    library_id,
    parent_id,
    name,
    node_type,
    sort_order
  )
  values (
    p_library_id,
    p_parent_id,
    cleaned_name,
    normalized_node_type,
    p_sort_order
  )
  returning * into created_node;

  select n.* into created_node from public.library_nodes n where n.id=created_node.id;
  return created_node;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.create_library_node_in_library(uuid,uuid,text,text,integer)'::regprocedure))<>'880e515cb5b9dcc02c7ae63b4957b0b7' then raise exception '122 unexpected function baseline: create_library_node_in_library(uuid,uuid,text,text,integer)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.create_library_node_in_library(uuid,uuid,text,text,integer)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.create_library_node_in_library(uuid,uuid,text,text,integer)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.rename_library_node_in_library(p_library_id uuid, p_node_id uuid, p_name text)
 RETURNS library_nodes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_node public.library_nodes%rowtype;
  duplicate_node public.library_nodes%rowtype;
  renamed_node public.library_nodes%rowtype;
  cleaned_name text := btrim(coalesce(p_name, ''));
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may rename library topics';
  end if;

  if p_library_id is null
     or not exists (
       select 1
       from public.libraries l
       where l.id = p_library_id
     ) then
    raise exception 'Library was not found';
  end if;

  if p_node_id is null then
    raise exception 'Topic is required';
  end if;

  if cleaned_name = '' then
    raise exception 'Topic name is required';
  end if;

  select *
  into target_node
  from public.library_nodes ln
  where ln.id = p_node_id;

  if target_node.id is null then
    raise exception 'Topic was not found';
  end if;

  if target_node.library_id is distinct from p_library_id then
    raise exception 'Topic does not belong to the active library';
  end if;

  if target_node.parent_id is null then
    raise exception 'The library root cannot be renamed';
  end if;

  select *
  into duplicate_node
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and exists(select 1 from public.m122_edges(p_library_id) location join public.m122_edges(p_library_id) sibling on sibling.parent_id=location.parent_id
      where location.topic_id=target_node.id and sibling.topic_id=ln.id)
    and ln.id <> target_node.id
    and lower(btrim(ln.name)) = lower(cleaned_name)
  limit 1;

  if duplicate_node.id is not null then
    raise exception
      'A topic named "%" already exists beneath the same parent',
      cleaned_name;
  end if;

  update public.library_nodes
  set name = cleaned_name
  where id = target_node.id
  returning * into renamed_node;

  select n.* into renamed_node from public.library_nodes n where n.id=renamed_node.id;
  return renamed_node;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.rename_library_node_in_library(uuid,uuid,text)'::regprocedure))<>'e6fa23551623cf7ec79fecf3e4757b81' then raise exception '122 unexpected function baseline: rename_library_node_in_library(uuid,uuid,text)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.rename_library_node_in_library(uuid,uuid,text)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.rename_library_node_in_library(uuid,uuid,text)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.move_library_node_in_library(p_library_id uuid, p_node_id uuid, p_new_parent_id uuid)
 RETURNS library_nodes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  moving_node public.library_nodes%rowtype;
  new_parent public.library_nodes%rowtype;
  moved_node public.library_nodes%rowtype;
  duplicate_node public.library_nodes%rowtype;
  would_create_cycle boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 if exists(select 1 from public.official_topic_placements where library_id=p_library_id) then raise exception 'Shared Topics require placement-aware movement. Reload Creator.' using errcode='PT409';end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may move library topics';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if p_node_id is null then
    raise exception 'Topic is required';
  end if;

  if p_new_parent_id is null then
    raise exception 'New parent topic is required';
  end if;

  select *
  into moving_node
  from public.library_nodes ln
  where ln.id = p_node_id;

  if moving_node.id is null then
    raise exception 'Topic was not found';
  end if;

  if moving_node.library_id is distinct from p_library_id then
    raise exception 'Topic does not belong to the active library';
  end if;

  -- Keep the library root fixed.
  if moving_node.parent_id is null then
    raise exception 'The library root cannot be moved';
  end if;

  if p_node_id = p_new_parent_id then
    raise exception 'A topic cannot be moved beneath itself';
  end if;

  select *
  into new_parent
  from public.library_nodes ln
  where ln.id = p_new_parent_id;

  if new_parent.id is null then
    raise exception 'New parent topic was not found';
  end if;

  if new_parent.library_id is distinct from p_library_id then
    raise exception 'New parent topic does not belong to the active library';
  end if;

  -- Prevent moving a topic underneath one of its own descendants.
  with recursive descendants as (
    select ln.id
    from public.library_nodes ln
    where ln.parent_id = p_node_id

    union all

    select child.id
    from public.library_nodes child
    join descendants d on child.parent_id = d.id
  )
  select exists (
    select 1
    from descendants
    where id = p_new_parent_id
  )
  into would_create_cycle;

  if would_create_cycle then
    raise exception 'A topic cannot be moved beneath one of its own subtopics';
  end if;

  -- Do not create two same-named topics beneath the same parent.
  select *
  into duplicate_node
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and ln.parent_id = p_new_parent_id
    and ln.id <> p_node_id
    and lower(btrim(ln.name)) = lower(btrim(moving_node.name))
  limit 1;

  if duplicate_node.id is not null then
    raise exception
      'A topic named "%" already exists beneath the selected topic',
      moving_node.name;
  end if;

  update public.library_nodes
  set parent_id = p_new_parent_id
  where id = p_node_id
  returning * into moved_node;

  select n.* into moved_node from public.library_nodes n where n.id=moved_node.id;
  return moved_node;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.move_library_node_in_library(uuid,uuid,uuid)'::regprocedure))<>'5f268250b6e8296b6641c7f5784277bd' then raise exception '122 unexpected function baseline: move_library_node_in_library(uuid,uuid,uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.move_library_node_in_library(uuid,uuid,uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.move_library_node_in_library(uuid,uuid,uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.position_library_node_in_library(p_library_id uuid, p_topic_id uuid, p_expected_parent_id uuid, p_destination_parent_id uuid, p_before_sibling_id uuid, p_expected_source_ids uuid[], p_expected_destination_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare moving public.library_nodes%rowtype; source_ids uuid[]; destination_ids uuid[]; ordered_ids uuid[]; anchor integer; changed integer;
begin
 if auth.uid() is null or not public.is_editor_or_admin() then raise exception 'Official positioning requires editor or admin' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Positioning requires READ COMMITTED' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 if exists(select 1 from public.official_topic_placements where library_id=p_library_id) then raise exception 'Shared Topics require placement-aware movement. Reload Creator.' using errcode='PT409';end if;
 select * into moving from public.library_nodes where id=p_topic_id for update;
 if moving.id is null or moving.library_id is distinct from p_library_id then raise exception 'Topic not found in requested Library' using errcode='22023'; end if;
 if moving.parent_id is null then raise exception 'Library root cannot be positioned' using errcode='22023'; end if;
 if moving.parent_id is distinct from p_expected_parent_id then raise exception 'Stale Topic parent' using errcode='PT409'; end if;
 if not exists(select 1 from public.library_nodes where id=p_destination_parent_id and library_id=p_library_id) then raise exception 'Destination not in requested Library' using errcode='22023'; end if;
 if p_destination_parent_id=p_topic_id or exists(with recursive descendants as (
 select id from public.library_nodes where parent_id=p_topic_id
 union all select n.id from public.library_nodes n join descendants d on n.parent_id=d.id
 ) select 1 from descendants where id=p_destination_parent_id) then raise exception 'Topic cycle rejected' using errcode='22023'; end if;
 if exists(select 1 from public.library_nodes where library_id=p_library_id and parent_id=p_destination_parent_id and id<>p_topic_id and lower(btrim(name))=lower(btrim(moving.name))) then raise exception 'Duplicate sibling name' using errcode='23505'; end if;
 select coalesce(array_agg(id order by sort_order asc nulls last,name collate "C",id),'{}'::uuid[]) into source_ids from public.library_nodes where library_id=p_library_id and parent_id=p_expected_parent_id;
 select coalesce(array_agg(id order by sort_order asc nulls last,name collate "C",id),'{}'::uuid[]) into destination_ids from public.library_nodes where library_id=p_library_id and parent_id=p_destination_parent_id;
 if source_ids is distinct from p_expected_source_ids then raise exception 'Stale source sibling sequence' using errcode='PT409'; end if;
 if destination_ids is distinct from p_expected_destination_ids then raise exception 'Stale destination sibling sequence' using errcode='PT409'; end if;
 ordered_ids:=array_remove(destination_ids,p_topic_id);
 if p_before_sibling_id is null then anchor:=cardinality(ordered_ids)+1;
 else anchor:=array_position(ordered_ids,p_before_sibling_id); if anchor is null then raise exception 'Invalid before-sibling anchor' using errcode='22023'; end if; end if;
 ordered_ids:=coalesce(ordered_ids[1:anchor-1],'{}'::uuid[])||array[p_topic_id]||coalesce(ordered_ids[anchor:cardinality(ordered_ids)],'{}'::uuid[]);
 -- One UPDATE assigns the entire destination sequence, including reparenting.
 update public.library_nodes n set parent_id=p_destination_parent_id,sort_order=(o.ordinality-1)::integer
 from unnest(ordered_ids) with ordinality o(id,ordinality)
 where n.id=o.id and (n.parent_id is distinct from p_destination_parent_id or n.sort_order is distinct from (o.ordinality-1)::integer);
 get diagnostics changed=row_count;
 -- Statement trigger compacts the old group and preserves the explicit destination order.
 select coalesce(array_agg(id order by sort_order,name collate "C",id),'{}'::uuid[]) into source_ids from public.library_nodes where library_id=p_library_id and parent_id=p_expected_parent_id;
 return jsonb_build_object('topic_id',p_topic_id,'source_ids',source_ids,'destination_ids',ordered_ids,'destination_rows_updated',changed);
end $function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'::regprocedure))<>'0db5be4c83bcbc14c799057e3b302409' then raise exception '122 unexpected function baseline: position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role socrates_migrator;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.normalize_topic_siblings_after_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare changes text; g record;
begin
 -- Transition relations are supplied by the fixed triggers, never browser SQL.
 -- Idempotent UPDATE ... IS DISTINCT FROM terminates recursion without a
 -- caller-settable bypass or skipping legitimate FK-cascade triggers.
 if tg_table_name='library_nodes' then
  changes:=case tg_op when 'INSERT' then 'select library_id,parent_id from new_rows' when 'DELETE' then 'select library_id,parent_id from old_rows' else 'select library_id,parent_id from new_rows union select library_id,parent_id from old_rows' end;
  for g in execute 'select distinct library_id,parent_id from ('||changes||') groups' loop
   if exists(select 1 from public.official_topic_placements where library_id=g.library_id and parent_node_id=g.parent_id) then
    perform public.m122_normalize_siblings(g.library_id,g.parent_id);
   else
   with ranks as (select id,(row_number() over(order by sort_order asc nulls last,name collate "C",id)-1)::integer rank from public.library_nodes where library_id=g.library_id and parent_id is not distinct from g.parent_id)
   update public.library_nodes n set sort_order=r.rank from ranks r where n.id=r.id and n.sort_order is distinct from r.rank;
   end if;
  end loop;
 elsif tg_table_name='official_topic_placements' then
  changes:=case tg_op when 'INSERT' then 'select library_id,parent_node_id from new_rows' when 'DELETE' then 'select library_id,parent_node_id from old_rows' else 'select library_id,parent_node_id from new_rows union select library_id,parent_node_id from old_rows' end;
  for g in execute 'select distinct library_id,parent_node_id from ('||changes||') groups' loop
   perform public.m122_normalize_siblings(g.library_id,g.parent_node_id);
  end loop;
 elsif tg_table_name='personal_topics' then
  changes:=case tg_op when 'INSERT' then 'select owner_id,parent_id,id from new_rows' when 'DELETE' then 'select owner_id,parent_id,id from old_rows' else 'select owner_id,parent_id,id from new_rows union select owner_id,parent_id,id from old_rows' end;
  for g in execute 'select distinct c.owner_id,c.parent_id,p.library_node_id from ('||changes||') c left join public.personal_topic_official_placements p on c.parent_id is null and p.personal_topic_id=c.id and p.owner_id=c.owner_id' loop
   with ranks as (select t.id,(row_number() over(order by t.sort_order asc nulls last,t.name collate "C",t.id)-1)::integer rank from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id where t.owner_id=g.owner_id and t.parent_id is not distinct from g.parent_id and (t.parent_id is not null or p.library_node_id is not distinct from g.library_node_id))
   update public.personal_topics t set sort_order=r.rank from ranks r where t.id=r.id and t.sort_order is distinct from r.rank;
  end loop;
 elsif tg_table_name='personal_topic_official_placements' then
  changes:=case tg_op when 'INSERT' then 'select owner_id,library_node_id from new_rows' when 'DELETE' then 'select owner_id,library_node_id from old_rows' else 'select owner_id,library_node_id from new_rows union select owner_id,library_node_id from old_rows' end;
  for g in execute 'select distinct owner_id,library_node_id from ('||changes||') c union select distinct owner_id,null::uuid from ('||changes||') c' loop
   with ranks as (select t.id,(row_number() over(order by t.sort_order asc nulls last,t.name collate "C",t.id)-1)::integer rank from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id where t.owner_id=g.owner_id and t.parent_id is null and p.library_node_id is not distinct from g.library_node_id)
   update public.personal_topics t set sort_order=r.rank from ranks r where t.id=r.id and t.sort_order is distinct from r.rank;
  end loop;
 else raise exception 'Unexpected normalization relation';
 end if;
 return null;
end $function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.normalize_topic_siblings_after_write()'::regprocedure))<>'5e4ed73996c5629b46bf0194c527d66c' then raise exception '122 unexpected function baseline: normalize_topic_siblings_after_write()';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.normalize_topic_siblings_after_write()'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.normalize_topic_siblings_after_write()'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role socrates_migrator;
create trigger m122_normalize_insert after insert on public.official_topic_placements referencing new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m122_normalize_update after update on public.official_topic_placements referencing old table as old_rows new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m122_normalize_delete after delete on public.official_topic_placements referencing old table as old_rows for each statement execute function public.normalize_topic_siblings_after_write();
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.delete_empty_library_node_in_library(p_library_id uuid, p_node_id uuid)
 RETURNS library_nodes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_node public.library_nodes%rowtype;
  deleted_node public.library_nodes%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may remove library topics';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if p_node_id is null then
    raise exception 'Topic is required';
  end if;

  select *
  into target_node
  from public.library_nodes ln
  where ln.id = p_node_id
  for update;

  if target_node.id is null then
    raise exception 'Topic was not found';
  end if;

  if target_node.library_id is distinct from p_library_id then
    raise exception 'Topic does not belong to the active library';
  end if;

  if target_node.parent_id is null then
    raise exception 'The library root cannot be removed';
  end if;

  if exists (
    select 1
    from public.library_nodes child
    where child.parent_id = p_node_id
  ) then
    raise exception
      'This topic contains subtopics. Move or remove those subtopics first';
  end if;

  if exists (
    select 1
    from public.concept_placements cp
    where cp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic is linked to one or more concepts. Remove those topic assignments first';
  end if;

  if exists (
    select 1
    from public.article_category_placements acp
    where acp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic is linked to one or more articles. Remove those article locations first';
  end if;

  if exists (
    select 1
    from public.user_study_node_selections usns
    where usns.node_id = p_node_id
  ) then
    raise exception
      'This topic is currently used in a study deck. Remove the study selection first';
  end if;

  if exists (
    select 1
    from public.study_deck_node_preferences sdnp
    where sdnp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic has retained study preferences. Remove those preferences first';
  end if;

  if exists(select 1 from public.official_topic_placements where library_id=p_library_id and (topic_id=p_node_id or parent_node_id=p_node_id)) then
    raise exception 'Use placement-aware removal or reviewed permanent deletion' using errcode='PT409';
  end if;
  delete from public.library_nodes
  where id = p_node_id
  returning * into deleted_node;

  return deleted_node;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.delete_empty_library_node_in_library(uuid,uuid)'::regprocedure))<>'0cbbccf70b364bf2fb6f250377d41c36' then raise exception '122 unexpected function baseline: delete_empty_library_node_in_library(uuid,uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.delete_empty_library_node_in_library(uuid,uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.delete_empty_library_node_in_library(uuid,uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.delete_development_content(p_record_type text, p_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  if v_actor is null then raise exception 'Authentication required.'; end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may permanently delete development content.';
  end if;

  if p_record_type='library_node' and exists(
    select 1 from public.library_nodes n join public.official_topic_placements p on p.library_id=n.library_id
    where n.id=p_record_id) then
    raise exception 'Shared Topic deletion requires a fresh placement-aware impact review' using errcode='PT409';
  end if;
  -- Lock/validate the requested identity before enabling the narrowly scoped
  -- immutable/root trigger bypass for this transaction.
  perform public.get_development_delete_summary(p_record_type, p_record_id);
  perform set_config('socrates.development_delete_actor', v_actor::text, true);

  case p_record_type
    when 'group' then perform public._development_delete_group(p_record_id);
    when 'library' then perform public._development_delete_library(p_record_id);
    when 'library_node' then perform public._development_delete_library_node(p_record_id);
    when 'concept' then perform public._development_delete_concept(p_record_id);
    when 'question' then perform public._development_delete_question(p_record_id);
    when 'tag' then perform public._development_delete_tag(p_record_id);
    else raise exception 'Unsupported deletion type: %', p_record_type;
  end case;

  return p_record_id;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.delete_development_content(text,uuid)'::regprocedure))<>'ada3bc310e4335cfa84560b126c7e262' then raise exception '122 unexpected function baseline: delete_development_content(text,uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.delete_development_content(text,uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.delete_development_content(text,uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public._development_delete_library_node(p_node_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent_id uuid;
  v_node_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  select ln.parent_id into v_parent_id
  from public.library_nodes ln where ln.id = p_node_id for update;
  if not found then raise exception 'Topic Tree node was not found.'; end if;
  if v_parent_id is null then
    raise exception 'Delete the Library from Library Organizer to remove its root.';
  end if;

  perform public.m122_require_deletable((select library_id from public.library_nodes where id=p_node_id),p_node_id);
  delete from public.official_topic_placements p where p.topic_id in (
    select topic_id from public.m122_closure(p.library_id,false) where ancestor_id=p_node_id
  ) or p.parent_node_id in (
    select topic_id from public.m122_closure(p.library_id,false) where ancestor_id=p_node_id
  );
  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.study_deck_node_preferences p
  where p.library_node_id in (select id from node_tree);

  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.user_study_node_selections s
  where s.node_id in (select id from node_tree);

  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.concept_placements p
  where p.library_node_id in (select id from node_tree);

  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.article_category_placements p
  where p.library_node_id in (select id from node_tree);

  for v_node_id in
    with recursive node_tree as (
      select ln.id, 0 as depth from public.library_nodes ln where ln.id = p_node_id
      union all
      select child.id, parent.depth + 1
      from public.library_nodes child
      join node_tree parent on child.parent_id = parent.id
    )
    select id from node_tree order by depth desc
  loop
    delete from public.library_nodes where id = v_node_id;
  end loop;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public._development_delete_library_node(uuid)'::regprocedure))<>'a4830881f65def490ce9abf7611fc764' then raise exception '122 unexpected function baseline: _development_delete_library_node(uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public._development_delete_library_node(uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public._development_delete_library_node(uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public._development_delete_library(p_library_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_concept_id uuid;
  v_article_id uuid;
  v_node_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  perform 1 from public.libraries l where l.id = p_library_id for update;
  if not found then raise exception 'Library was not found.'; end if;
  delete from public.official_topic_placements where library_id=p_library_id;

  delete from public.review_attempts ra
  where ra.study_session_id in (
    select ss.id from public.study_sessions ss where ss.library_id = p_library_id
  );
  delete from public.study_sessions where library_id = p_library_id;
  delete from public.study_deck_node_preferences where library_id = p_library_id;
  delete from public.user_study_node_selections where library_id = p_library_id;
  delete from public.user_study_concept_overrides where library_id = p_library_id;
  delete from public.study_decks where library_id = p_library_id;
  delete from public.user_libraries where library_id = p_library_id;

  for v_article_id in
    select distinct ap.article_id
    from public.article_category_placements ap
    join public.library_nodes ln on ln.id = ap.library_node_id
    where ln.library_id = p_library_id
  loop
    perform public._development_delete_article(v_article_id);
  end loop;

  for v_concept_id in
    select distinct cp.concept_id
    from public.concept_placements cp
    join public.library_nodes ln on ln.id = cp.library_node_id
    where ln.library_id = p_library_id
  loop
    perform public._development_delete_concept(v_concept_id);
  end loop;

  delete from public.library_group_libraries where library_id = p_library_id;
  delete from public.study_deck_node_preferences where library_id = p_library_id;
  delete from public.user_study_node_selections where library_id = p_library_id;
  delete from public.concept_placements
  where library_node_id in (select id from public.library_nodes where library_id = p_library_id);
  delete from public.article_category_placements
  where library_node_id in (select id from public.library_nodes where library_id = p_library_id);

  for v_node_id in
    with recursive node_tree as (
      select ln.id, 0 as depth
      from public.library_nodes ln
      where ln.library_id = p_library_id and ln.parent_id is null
      union all
      select child.id, parent.depth + 1
      from public.library_nodes child
      join node_tree parent on child.parent_id = parent.id
    )
    select id from node_tree order by depth desc
  loop
    delete from public.library_nodes where id = v_node_id;
  end loop;

  delete from public.libraries where id = p_library_id;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public._development_delete_library(uuid)'::regprocedure))<>'fb58caf520cd1e0b1276a913a26425fc' then raise exception '122 unexpected function baseline: _development_delete_library(uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public._development_delete_library(uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public._development_delete_library(uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.select_next_study_question_hardened(p_study_session_id uuid, p_include_debug boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  selection_result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to select a study question.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for share;

  if target_session.id is null then
    raise exception 'Active study session not found.';
  end if;

  if target_session.selection_snapshot#>>'{unified_deck_settings,topic_preference_state,projection,version}' is not null and target_session.selection_snapshot#>>'{unified_deck_settings,topic_preference_state,projection,version}' not in ('117','122') then raise exception 'Unsupported Topic preference projection' using errcode='22023';end if;
  if target_session.cram_mode then
    with
    cram_eligible_questions as (
      select
        question.id as question_id,
        question.concept_id,
        question.prompt, question.prompt_format, question.current_version_id,
        question.difficulty,
        question.testing_angle,
        lower(btrim(question.testing_angle)) as normalized_angle,
        question.sort_order,
        question.created_at,
        accepted.answer_text as accepted_answer, accepted.answer_format as accepted_answer_format
      from public.resolve_study_deck(target_session.study_deck_id) resolved
      join public.questions question
        on question.concept_id = resolved.concept_id
      join lateral (
        select answer.answer_text, answer.answer_format
        from public.question_accepted_answers answer
        where answer.question_id = question.id
        order by answer.sort_order, answer.id
        limit 1
      ) accepted on true
      where question.status = 'published'
        and question.question_type = 'short_answer'
    ),
    cram_eligible_angles as (
      select distinct
        question.concept_id,
        question.normalized_angle
      from cram_eligible_questions question
    ),
    cram_angle_state_rollup as (
      select
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)) as normalized_angle,
        sum(angle_state.evidence_count) as evidence_count,
        max(angle_state.last_exposure_at) as last_exposure_at
      from public.user_concept_testing_angle_state angle_state
      where angle_state.user_id = current_user_id
      group by
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle))
    ),
    cram_angle_state_latest as (
      select distinct on (
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle))
      )
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)) as normalized_angle,
        angle_state.last_result
      from public.user_concept_testing_angle_state angle_state
      where angle_state.user_id = current_user_id
      order by
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)),
        angle_state.last_exposure_at desc,
        angle_state.updated_at desc,
        angle_state.testing_angle
    ),
    cram_angle_needs as (
      select
        angle.concept_id,
        angle.normalized_angle,
        case
          when rollup.evidence_count is null then 1::double precision
          else
            0.70::double precision / (1 + rollup.evidence_count)
            + 0.20::double precision * (
                1 - exp(
                  -greatest(
                    0::double precision,
                    extract(epoch from (now() - rollup.last_exposure_at))
                      / 86400::double precision
                  ) / 14::double precision
                )
              )
            + 0.10::double precision * case latest.last_result
                when 'easy' then 0::double precision
                when 'average' then 0.25::double precision
                when 'hard' then 0.50::double precision
                when 'didnt_know' then 1::double precision
                when 'forgot' then 0.90::double precision
                when 'too_hard' then 0.60::double precision
                else 0::double precision
              end
        end as angle_need
      from cram_eligible_angles angle
      left join cram_angle_state_rollup rollup
        on rollup.concept_id = angle.concept_id
       and rollup.normalized_angle = angle.normalized_angle
      left join cram_angle_state_latest latest
        on latest.concept_id = angle.concept_id
       and latest.normalized_angle = angle.normalized_angle
    ),
    cram_concepts as (
      select distinct question.concept_id
      from cram_eligible_questions question
    ),
    cram_concept_inputs as (
      select
        concept.concept_id,
        mastery.mastery_estimate::double precision as mastery_estimate,
        mastery.retrievability::double precision as stored_retrievability,
        mastery.stability::double precision as stability,
        mastery.uncertainty::double precision as uncertainty,
        mastery.last_exposure_at,
        (mastery.concept_id is null) as is_unseen
      from cram_concepts concept
      left join public.user_concept_mastery mastery
        on mastery.user_id = current_user_id
       and mastery.concept_id = concept.concept_id
    ),
    cram_concept_metrics as (
      select
        input.*,
        case
          when input.is_unseen then null::double precision
          else input.stored_retrievability * exp(
            -greatest(
              0::double precision,
              extract(epoch from (now() - input.last_exposure_at))
                / 86400::double precision
            ) / (1::double precision + 29::double precision * input.stability)
          )
        end as live_retrievability
      from cram_concept_inputs input
    ),
    cram_concept_scores as (
      select
        metric.*,
        case
          when metric.is_unseen then 0.85::double precision
          else
            0.55::double precision
              * (1::double precision - metric.mastery_estimate)
            + 0.30::double precision
              * (1::double precision - metric.live_retrievability)
            + 0.15::double precision * metric.uncertainty
        end as cram_need
      from cram_concept_metrics metric
    ),
    cram_question_history as (
      select
        question.question_id,
        count(attempt.id) filter (
          where attempt.study_session_id = target_session.id
        )::integer as session_attempt_count,
        max(attempt.created_at) as last_attempt_at
      from cram_eligible_questions question
      left join public.review_attempts attempt
        on attempt.question_id = question.question_id
       and attempt.user_id = current_user_id
       and attempt.created_at > coalesce(
         public.get_concept_study_reset_at(
           current_user_id,
           question.concept_id
         ),
         '-infinity'::timestamptz
       )
      group by question.question_id
    ),
    cram_traversal as (
      select min(history.session_attempt_count) as minimum_attempt_count
      from cram_question_history history
    ),
    cram_ranked_questions as (
      select
        question.*,
        concept.is_unseen,
        concept.mastery_estimate,
        concept.cram_need,
        angle.angle_need,
        history.session_attempt_count,
        history.last_attempt_at,
        traversal.minimum_attempt_count,
        abs(
          case question.difficulty
            when 'easy' then 0
            when 'medium' then 1
            when 'hard' then 2
          end
          -
          case
            when concept.is_unseen then 1
            when concept.mastery_estimate < 0.40::double precision then 0
            when concept.mastery_estimate <= 0.75::double precision then 1
            else 2
          end
        ) as difficulty_distance
      from cram_eligible_questions question
      join cram_concept_scores concept
        on concept.concept_id = question.concept_id
      join cram_angle_needs angle
        on angle.concept_id = question.concept_id
       and angle.normalized_angle = question.normalized_angle
      join cram_question_history history
        on history.question_id = question.question_id
      cross join cram_traversal traversal
      where history.session_attempt_count = traversal.minimum_attempt_count
    ),
    cram_selected_question as (
      select ranked.*
      from cram_ranked_questions ranked
      order by
        ranked.cram_need desc,
        ranked.angle_need desc,
        ranked.difficulty_distance,
        ranked.last_attempt_at asc nulls first,
        ranked.sort_order,
        ranked.created_at,
        ranked.question_id
      limit 1
    )
    select
      jsonb_build_object(
        'question_id', selected.question_id,
        'concept_id', selected.concept_id,
        'testing_angle', selected.testing_angle,
        'prompt', selected.prompt,
        'prompt_format', selected.prompt_format, 'answer_format', selected.accepted_answer_format, 'question_version_id', selected.current_version_id,
        'accepted_answer', selected.accepted_answer,
        'difficulty', selected.difficulty
      )
      || case
        when coalesce(p_include_debug, false) then jsonb_build_object(
          'cram_mode', true,
          'cram_traversal_minimum_count', selected.minimum_attempt_count,
          'selected_question_session_count', selected.session_attempt_count,
          'selected_concept_cram_need', selected.cram_need,
          'selected_angle_need', selected.angle_need,
          'selection_reason', 'cram_mastery_need'
        )
        else '{}'::jsonb
      end
    into selection_result
    from cram_selected_question selected;

    return selection_result;
  end if;

  with recursive
  effective_deck_concepts as (
    select resolved.*
    from public.resolve_study_deck(target_session.study_deck_id) resolved
  ),
  eligible_concepts as (
    select
      resolved.concept_id,
      resolved.selection_source
    from effective_deck_concepts resolved
    where exists (
      select 1
      from public.questions eligible_question
      where eligible_question.concept_id = resolved.concept_id
        and eligible_question.status = 'published'
        and eligible_question.question_type = 'short_answer'
        and exists (
          select 1
          from public.question_accepted_answers eligible_answer
          where eligible_answer.question_id = eligible_question.id
        )
    )
  ),
  direct_prerequisite_concepts as (
    select distinct
      downstream.concept_id as downstream_concept_id,
      edge.prerequisite_concept_id as prerequisite_concept_id,
      edge.strength
    from eligible_concepts downstream
    join public.concept_prerequisites edge
      on edge.concept_id = downstream.concept_id
     and edge.prerequisite_concept_id is not null
    join effective_deck_concepts effective
      on effective.concept_id = edge.prerequisite_concept_id
    join public.concepts prerequisite
      on prerequisite.id = edge.prerequisite_concept_id
     and prerequisite.status = 'published'
    where edge.prerequisite_concept_id <> downstream.concept_id
      and exists (
        select 1
        from public.concept_placements placement
        join public.library_nodes node
          on node.id = placement.library_node_id
        where placement.concept_id = edge.prerequisite_concept_id
          and node.library_id = target_session.library_id
      )
  ),
  prerequisite_topic_nodes as (
    select
      downstream.concept_id as downstream_concept_id,
      edge.prerequisite_library_node_id as prerequisite_root_node_id,
      edge.prerequisite_library_node_id as node_id,
      edge.strength
    from eligible_concepts downstream
    join public.concept_prerequisites edge
      on edge.concept_id = downstream.concept_id
     and edge.prerequisite_library_node_id is not null
    join public.library_nodes prerequisite_root
      on prerequisite_root.id = edge.prerequisite_library_node_id
     and prerequisite_root.library_id = target_session.library_id

    union

    select
      topic.downstream_concept_id,
      topic.prerequisite_root_node_id,
      child.id,
      topic.strength
    from prerequisite_topic_nodes topic
    join public.m122_edges(target_session.library_id) child_edge on child_edge.parent_id=topic.node_id
      and (child_edge.kind='primary' or target_session.selection_snapshot#>>'{unified_deck_settings,topic_preference_state,projection,version}'='122')
    join public.library_nodes child on child.id=child_edge.topic_id
  ),
  topic_prerequisite_concepts as (
    select distinct
      topic.downstream_concept_id,
      placement.concept_id as prerequisite_concept_id,
      topic.strength
    from prerequisite_topic_nodes topic
    join public.concept_placements placement
      on placement.library_node_id = topic.node_id
    join public.concepts prerequisite
      on prerequisite.id = placement.concept_id
     and prerequisite.status = 'published'
    join effective_deck_concepts effective
      on effective.concept_id = placement.concept_id
    where placement.concept_id <> topic.downstream_concept_id
  ),
  qualifying_prerequisite_concepts as (
    select
      direct.downstream_concept_id,
      direct.prerequisite_concept_id,
      direct.strength
    from direct_prerequisite_concepts direct

    union

    select
      topic.downstream_concept_id,
      topic.prerequisite_concept_id,
      topic.strength
    from topic_prerequisite_concepts topic
  ),
  prerequisite_priority_components as (
    select
      qualifying.downstream_concept_id as concept_id,
      least(
        0.12::double precision,
        max(
          case qualifying.strength
            when 'required' then 0.12::double precision
            when 'recommended' then 0.06::double precision
          end
          * greatest(
              0::double precision,
              (
                0.75::double precision
                  - coalesce(mastery.mastery_estimate, 0)::double precision
              ) / 0.75::double precision
            )
        )
      ) as prerequisite_priority_component
    from qualifying_prerequisite_concepts qualifying
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = qualifying.prerequisite_concept_id
    group by qualifying.downstream_concept_id
  ),
  selected_node_ids as (
    select distinct (entry.value->>'origin')::uuid as selected_node_id
    from jsonb_each(coalesce((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official','{}'::jsonb)) entry
    where (target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->>'version' = '117'
    union all
    select selected_node.value::uuid
    from jsonb_array_elements_text(coalesce(target_session.selection_snapshot->'selected_node_ids','[]'::jsonb)) selected_node(value)
    where coalesce((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->>'version','') not in ('117','122')
  ),
  selected_subtrees as (
    select
      selected.selected_node_id,
      selected.selected_node_id as node_id
    from selected_node_ids selected

    union all

    select
      subtree.selected_node_id,
      child.id
    from selected_subtrees subtree
    join public.library_nodes child
      on child.parent_id = subtree.node_id
     and child.library_id = target_session.library_id
  ),
  selected_node_descendants as (
    select distinct
      ancestry.selected_node_id as ancestor_selected_node_id,
      selected.selected_node_id as descendant_selected_node_id
    from selected_subtrees ancestry
    join selected_node_ids selected
      on selected.selected_node_id = ancestry.node_id
    where selected.selected_node_id <> ancestry.selected_node_id
  ),
  covering_selected_nodes as (
    select distinct
      eligible.concept_id,
      subtree.selected_node_id,
      coalesce(
        ((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->subtree.selected_node_id::text->>'balance')::numeric,
        nullif(
          target_session.selection_snapshot
            -> 'node_preferences'
            ->> subtree.selected_node_id::text,
          ''
        )::numeric,
        50::numeric
      ) as branch_balance
    from eligible_concepts eligible
    join public.concept_placements placement
      on placement.concept_id = eligible.concept_id
    join selected_subtrees subtree
      on subtree.node_id = placement.library_node_id
    where coalesce((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->>'version','') not in ('117','122')
       or ((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->>'version'='117' and coalesce(((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->subtree.selected_node_id::text->>'selected')::boolean,false)
       or (target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->placement.library_node_id::text->>'origin' = subtree.selected_node_id::text)
  ),
  suppressed_selected_nodes as materialized (
    select distinct more_specific.concept_id,
      descendant.ancestor_selected_node_id as selected_node_id
    from selected_node_descendants descendant
    join covering_selected_nodes more_specific
      on more_specific.selected_node_id = descendant.descendant_selected_node_id
  ),
  most_specific_selected_nodes as (
    select covering.*
    from covering_selected_nodes covering
    left join suppressed_selected_nodes suppressed
      on suppressed.concept_id = covering.concept_id
     and suppressed.selected_node_id = covering.selected_node_id
    where suppressed.concept_id is null
  ),
  provenance_covering as materialized (
    select distinct eligible.concept_id,entry.value->>'source' source_key,
      (entry.value->>'origin')::uuid source_topic,
      entry.value->'ancestors' ancestor_sources,
      (entry.value->>'balance')::numeric branch_balance
    from eligible_concepts eligible
    join public.concept_placements placement on placement.concept_id=eligible.concept_id
    join jsonb_each(coalesce(target_session.selection_snapshot#>'{unified_deck_settings,topic_preference_state,projection,official}','{}')) entry
      on entry.key=placement.library_node_id::text
    where target_session.selection_snapshot#>>'{unified_deck_settings,topic_preference_state,projection,version}'='122'
  ),
  provenance_specific as (
    select covering.* from provenance_covering covering
    where not exists(select 1 from provenance_covering more_specific
      cross join lateral jsonb_array_elements(more_specific.ancestor_sources) ancestor
      where more_specific.concept_id=covering.concept_id
        and ancestor->>'source'=covering.source_key)
  ),
  most_specific_sources as (
    select distinct concept_id,branch_balance,
      coalesce((target_session.selection_snapshot #> '{unified_deck_settings,topic_preference_state,projection}')->'official'->selected_node_id::text->>'source',selected_node_id::text) source_key
    from most_specific_selected_nodes
    union
    select distinct concept_id,branch_balance,source_key from provenance_specific
  ),
  concept_balances as (
    select eligible.concept_id,eligible.selection_source,
      coalesce(avg(specific.branch_balance),50::numeric) as branch_balance
    from eligible_concepts eligible
    left join most_specific_sources specific on specific.concept_id=eligible.concept_id
    group by eligible.concept_id,eligible.selection_source
  ),
  -- Keep the Library-wide Question pass narrow. The prior implementation
  -- materialized prompt/answer/difficulty payloads for every eligible Question
  -- before the winning Concept was known. These axes are the only Question
  -- fields needed to rank Concepts and Testing Angles.
  eligible_question_axes as (
    select
      question.id as question_id,
      question.concept_id,
      lower(btrim(question.testing_angle)) as normalized_angle,
      question.sort_order,
      question.created_at
    from public.questions question
    join concept_balances balance
      on balance.concept_id = question.concept_id
    where question.status = 'published'
      and question.question_type = 'short_answer'
      and exists (
        select 1
        from public.question_accepted_answers answer
        where answer.question_id = question.id
      )
  ),
  eligible_angles as (
    select distinct
      question.concept_id,
      question.normalized_angle
    from eligible_question_axes question
  ),
  angle_state_rollup as (
    select
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)) as normalized_angle,
      sum(angle_state.evidence_count)::integer as evidence_count,
      max(angle_state.last_exposure_at) as last_exposure_at
    from public.user_concept_testing_angle_state angle_state
    where angle_state.user_id = current_user_id
    group by
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle))
  ),
  angle_state_latest as (
    select distinct on (
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle))
    )
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)) as normalized_angle,
      angle_state.last_result
    from public.user_concept_testing_angle_state angle_state
    where angle_state.user_id = current_user_id
    order by
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)),
      angle_state.last_exposure_at desc,
      angle_state.updated_at desc,
      angle_state.testing_angle
  ),
  angle_needs as (
    select
      angle.concept_id,
      angle.normalized_angle,
      case
        when rollup.evidence_count is null then 1::double precision
        else
          0.70::double precision / (1 + rollup.evidence_count)
          + 0.20::double precision * (
              1 - exp(
                -greatest(
                  0::double precision,
                  extract(epoch from (now() - rollup.last_exposure_at))
                    / 86400::double precision
                ) / 14::double precision
              )
            )
          + 0.10::double precision * case latest.last_result
              when 'easy' then 0::double precision
              when 'average' then 0.25::double precision
              when 'hard' then 0.50::double precision
              when 'didnt_know' then 1::double precision
              when 'forgot' then 0.90::double precision
              when 'too_hard' then 0.60::double precision
              else 0::double precision
            end
      end as angle_need
    from eligible_angles angle
    left join angle_state_rollup rollup
      on rollup.concept_id = angle.concept_id
     and rollup.normalized_angle = angle.normalized_angle
    left join angle_state_latest latest
      on latest.concept_id = angle.concept_id
     and latest.normalized_angle = angle.normalized_angle
  ),
  preferred_angles as (
    select distinct on (angle.concept_id)
      angle.concept_id,
      angle.normalized_angle,
      angle.angle_need
    from angle_needs angle
    order by
      angle.concept_id,
      angle.angle_need desc,
      angle.normalized_angle
  ),
  session_position as (
    select coalesce(max(attempt.sequence_position), 0) as latest_position
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
  ),
  recent_concepts as (
    select
      attempt.concept_id,
      max(attempt.sequence_position) as latest_position
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
      and attempt.concept_id is not null
    group by attempt.concept_id
  ),
  recent_history_attempts as (
    select
      balance.concept_id,
      history.id as attempt_id,
      history.result,
      history.created_at,
      row_number() over (
        partition by balance.concept_id
        order by history.created_at, history.id
      )::integer as history_position,
      greatest(
        0::double precision,
        1::double precision
          - greatest(
              0::double precision,
              extract(epoch from (now() - history.created_at))
            ) / 3888000::double precision
      ) as age_weight
    from concept_balances balance
    join lateral (
      select
        attempt.id,
        attempt.result,
        attempt.created_at
      from public.review_attempts attempt
      where attempt.user_id = current_user_id
        and attempt.concept_id = balance.concept_id
        and attempt.created_at > coalesce(
          public.get_concept_study_reset_at(
            current_user_id,
            balance.concept_id
          ),
          '-infinity'::timestamptz
        )
        and attempt.created_at >= now() - interval '45 days'
      order by attempt.created_at desc, attempt.id desc
      limit 12
    ) history on true
  ),
  repeated_lapse_walk as (
    select
      attempt.concept_id,
      attempt.history_position,
      least(
        3::double precision,
        greatest(
          0::double precision,
          case attempt.result
            when 'forgot' then attempt.age_weight
            when 'easy' then -1.00::double precision * attempt.age_weight
            when 'average' then -0.75::double precision * attempt.age_weight
            when 'hard' then -0.50::double precision * attempt.age_weight
            else 0::double precision
          end
        )
      ) as repeated_lapse_concern
    from recent_history_attempts attempt
    where attempt.history_position = 1

    union all

    select
      attempt.concept_id,
      attempt.history_position,
      least(
        3::double precision,
        greatest(
          0::double precision,
          walk.repeated_lapse_concern
            + case attempt.result
                when 'forgot' then attempt.age_weight
                when 'easy' then -1.00::double precision * attempt.age_weight
                when 'average' then -0.75::double precision * attempt.age_weight
                when 'hard' then -0.50::double precision * attempt.age_weight
                else 0::double precision
              end
        )
      ) as repeated_lapse_concern
    from repeated_lapse_walk walk
    join recent_history_attempts attempt
      on attempt.concept_id = walk.concept_id
     and attempt.history_position = walk.history_position + 1
  ),
  repeated_lapse_state as (
    select distinct on (walk.concept_id)
      walk.concept_id,
      walk.repeated_lapse_concern
    from repeated_lapse_walk walk
    order by walk.concept_id, walk.history_position desc
  ),
  eligible_concept_count as (
    select count(*)::integer as concept_count
    from concept_balances
  ),
  concept_inputs as (
    select
      balance.concept_id,
      balance.selection_source,
      balance.branch_balance::double precision as branch_balance,
      mastery.mastery_estimate::double precision as mastery_estimate,
      mastery.retrievability::double precision as stored_retrievability,
      mastery.stability::double precision as stability,
      mastery.uncertainty::double precision as uncertainty,
      mastery.last_exposure_at,
      mastery.last_result,
      coalesce(
        prerequisite.prerequisite_priority_component,
        0::double precision
      ) as prerequisite_priority_component,
      coalesce(history.repeated_lapse_concern, 0::double precision)
        as repeated_lapse_concern,
      (mastery.concept_id is null) as is_unseen,
      preferred.normalized_angle,
      preferred.angle_need,
      concept_count.concept_count,
      session.latest_position as session_latest_position,
      recent.latest_position as concept_latest_position
    from concept_balances balance
    join preferred_angles preferred
      on preferred.concept_id = balance.concept_id
    cross join eligible_concept_count concept_count
    cross join session_position session
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = balance.concept_id
    left join recent_concepts recent
      on recent.concept_id = balance.concept_id
    left join repeated_lapse_state history
      on history.concept_id = balance.concept_id
    left join prerequisite_priority_components prerequisite
      on prerequisite.concept_id = balance.concept_id
  ),
  concept_metrics as (
    select
      input.*,
      case
        when input.is_unseen then null::double precision
        else input.stored_retrievability * exp(
          -greatest(
            0::double precision,
            extract(epoch from (now() - input.last_exposure_at))
              / 86400::double precision
          ) / (1::double precision + 29::double precision * input.stability)
        )
      end as live_retrievability,
      case
        when not input.is_unseen and input.last_result = 'forgot' then
          greatest(
            0::double precision,
            1::double precision
              - greatest(
                  0::double precision,
                  extract(epoch from (now() - input.last_exposure_at))
                ) / 604800::double precision
          )
        else 0::double precision
      end as lapse_signal,
      least(
        1::double precision,
        greatest(
          0::double precision,
          (input.repeated_lapse_concern - 1::double precision)
            / 2::double precision
        )
      ) as repeated_lapse_signal,
      0.30::double precision
        + 0.20::double precision
          * (1::double precision - input.branch_balance / 100::double precision)
        as new_weight,
      0.30::double precision
        + 0.20::double precision
          * (input.branch_balance / 100::double precision)
        as review_weight,
      case
        when input.concept_count <= 1 then 0::double precision
        when input.concept_count = 2 then
          case
            when input.concept_latest_position = input.session_latest_position
              and input.session_latest_position > 0
              then 0.12::double precision
            else 0::double precision
          end
        else
          case
            when input.concept_latest_position = input.session_latest_position
              and input.session_latest_position > 0
              then 0.25::double precision
            when input.concept_latest_position >= input.session_latest_position - 2
              and input.session_latest_position > 0
              then 0.12::double precision
            when input.concept_latest_position >= input.session_latest_position - 5
              and input.session_latest_position > 0
              then 0.05::double precision
            else 0::double precision
          end
      end as recent_concept_penalty
    from concept_inputs input
  ),
  concept_needs as (
    select
      metric.*,
      case
        when metric.is_unseen then null::double precision
        else
          0.45::double precision * (1::double precision - metric.mastery_estimate)
          + 0.30::double precision * (
              1::double precision - metric.live_retrievability
            )
          + 0.15::double precision * metric.uncertainty
          + 0.10::double precision * (1::double precision - metric.stability)
      end as review_need
    from concept_metrics metric
  ),
  concept_scores as (
    select
      need.*,
      case
        when need.review_need is null then 0::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            (need.review_need - 0.75::double precision) / 0.25::double precision
          )
        )
      end as urgent_review,
      need.new_weight * case when need.is_unseen then 1 else 0 end
        as new_component,
      need.review_weight * coalesce(need.review_need, 0::double precision)
        as review_component,
      0.15::double precision * need.angle_need as angle_component
    from concept_needs need
  ),
  ranked_concepts as (
    select
      score.*,
      0.30::double precision * score.urgent_review as urgent_review_component,
      0.65::double precision * score.lapse_signal as lapse_priority_component,
      0.20::double precision * score.repeated_lapse_signal
        as repeated_lapse_priority_component,
      least(
        0.85::double precision,
        0.65::double precision * score.lapse_signal
          + 0.20::double precision * score.repeated_lapse_signal
      ) as combined_lapse_priority_component,
      score.new_component
        + score.review_component
        + score.angle_component
        + score.prerequisite_priority_component
        + 0.30::double precision * score.urgent_review
        + least(
            0.85::double precision,
            0.65::double precision * score.lapse_signal
              + 0.20::double precision * score.repeated_lapse_signal
          )
        - score.recent_concept_penalty
        as concept_priority
    from concept_scores score
  ),
  selected_concept as (
    select ranked.*
    from ranked_concepts ranked
    order by
      ranked.concept_priority desc,
      ranked.urgent_review desc,
      ranked.angle_need desc,
      ranked.concept_id
    limit 1
  ),
  selected_angle_history_attempts as (
    select
      angle.concept_id,
      angle.normalized_angle,
      history.response_value
    from eligible_angles angle
    join selected_concept selected
      on selected.concept_id = angle.concept_id
    join lateral (
      select
        case attempt.result
          when 'easy' then 1.00::double precision
          when 'average' then 0.75::double precision
          when 'hard' then 0.60::double precision
          when 'didnt_know' then 0.00::double precision
          when 'forgot' then 0.10::double precision
          when 'too_hard' then 0.25::double precision
        end as response_value
      from public.review_attempts attempt
      where attempt.user_id = current_user_id
        and attempt.concept_id = selected.concept_id
        and attempt.created_at > coalesce(
          public.get_concept_study_reset_at(
            current_user_id,
            selected.concept_id
          ),
          '-infinity'::timestamptz
        )
        and lower(btrim(attempt.testing_angle)) = angle.normalized_angle
        and attempt.result in (
          'easy',
          'average',
          'hard',
          'didnt_know',
          'forgot',
          'too_hard'
        )
        and attempt.created_at >= now() - interval '45 days'
      order by attempt.created_at desc, attempt.id desc
      limit 6
    ) history on true
  ),
  selected_angle_history_metrics as (
    select
      history.concept_id,
      history.normalized_angle,
      count(*)::integer as history_count,
      avg(history.response_value) as mean_response,
      avg(history.response_value * history.response_value) as mean_square_response
    from selected_angle_history_attempts history
    group by history.concept_id, history.normalized_angle
  ),
  selected_angle_components as (
    select
      angle.concept_id,
      angle.normalized_angle,
      rollup.evidence_count,
      rollup.last_exposure_at,
      latest.last_result,
      coalesce(history.history_count, 0) as history_count,
      case
        when rollup.evidence_count is null then 1::double precision
        else
          0.45::double precision
            / sqrt(greatest(1, rollup.evidence_count)::double precision)
      end as evidence_need_component,
      case
        when rollup.evidence_count is null then 0::double precision
        else
          0.20::double precision * (
            1::double precision
              - exp(
                  -greatest(
                    0::double precision,
                    extract(epoch from (now() - rollup.last_exposure_at))
                      / 86400::double precision
                  ) / 30::double precision
                )
          )
      end as time_need_component,
      case
        when rollup.evidence_count is null then 0::double precision
        else
          0.25::double precision * case latest.last_result
            when 'easy' then 0.00::double precision
            when 'average' then 0.30::double precision
            when 'hard' then 0.50::double precision
            when 'didnt_know' then 1.00::double precision
            when 'forgot' then 0.90::double precision
            when 'too_hard' then 0.60::double precision
            else 0::double precision
          end
      end as response_need_component,
      case
        when coalesce(history.history_count, 0) < 2 then 0::double precision
        else
          0.10::double precision * least(
            1::double precision,
            greatest(
              0::double precision,
              4::double precision * (
                history.mean_square_response
                  - history.mean_response * history.mean_response
              )
            )
          )
      end as contradiction_need_component
    from eligible_angles angle
    join selected_concept selected
      on selected.concept_id = angle.concept_id
    left join angle_state_rollup rollup
      on rollup.concept_id = angle.concept_id
     and rollup.normalized_angle = angle.normalized_angle
    left join angle_state_latest latest
      on latest.concept_id = angle.concept_id
     and latest.normalized_angle = angle.normalized_angle
    left join selected_angle_history_metrics history
      on history.concept_id = angle.concept_id
     and history.normalized_angle = angle.normalized_angle
  ),
  selected_angle_needs as (
    select
      component.*,
      case
        when component.evidence_count is null then 1::double precision
        else least(
          0.95::double precision,
          greatest(
            0::double precision,
            component.evidence_need_component
              + component.time_need_component
              + component.response_need_component
              + component.contradiction_need_component
          )
        )
      end as angle_need
    from selected_angle_components component
  ),
  selected_preferred_angle as (
    select angle.*
    from selected_angle_needs angle
    order by angle.angle_need desc, angle.normalized_angle
    limit 1
  ),
  -- Only the winning Concept now pays the full Question payload and ordered
  -- accepted-answer lookup cost. Eligibility and ordering are byte-for-byte
  -- equivalent to the former Library-wide eligible_questions CTE.
  selected_concept_questions as (
    select
      question.id as question_id,
      question.concept_id,
      question.prompt, question.prompt_format, question.current_version_id,
      question.explanation,
      question.difficulty,
      question.testing_angle,
      lower(btrim(question.testing_angle)) as normalized_angle,
      question.sort_order,
      question.created_at,
      accepted.answer_text as accepted_answer, accepted.answer_format as accepted_answer_format
    from public.questions question
    join selected_concept selected
      on selected.concept_id = question.concept_id
    join lateral (
      select answer.answer_text, answer.answer_format
      from public.question_accepted_answers answer
      where answer.question_id = question.id
      order by answer.sort_order, answer.id
      limit 1
    ) accepted on true
    where question.status = 'published'
      and question.question_type = 'short_answer'
  ),
  question_history as (
    select
      question.question_id,
      count(attempt.id) filter (
        where attempt.study_session_id = target_session.id
      )::integer as session_attempt_count,
      max(attempt.sequence_position) filter (
        where attempt.study_session_id = target_session.id
      ) as session_latest_position,
      max(attempt.created_at) as last_attempt_at
    from selected_concept_questions question
    left join public.review_attempts attempt
      on attempt.question_id = question.question_id
     and attempt.user_id = current_user_id
     and attempt.created_at > coalesce(
       public.get_concept_study_reset_at(
         current_user_id,
         question.concept_id
       ),
       '-infinity'::timestamptz
     )
    group by question.question_id
  ),
  selected_question_pool as (
    select
      question.*,
      selected.branch_balance,
      selected.is_unseen,
      selected.mastery_estimate,
      selected.live_retrievability,
      selected.last_result,
      selected.lapse_signal,
      selected.lapse_priority_component,
      selected.repeated_lapse_concern,
      selected.repeated_lapse_signal,
      selected.repeated_lapse_priority_component,
      selected.combined_lapse_priority_component,
      preferred.normalized_angle as preferred_angle,
      preferred.angle_need,
      preferred.evidence_count as angle_evidence_count,
      preferred.history_count as angle_history_count,
      preferred.evidence_need_component,
      preferred.time_need_component,
      preferred.response_need_component,
      preferred.contradiction_need_component,
      selected.angle_need as concept_angle_need,
      selected.new_component,
      selected.review_component,
      selected.angle_component,
      selected.prerequisite_priority_component,
      selected.urgent_review_component,
      selected.recent_concept_penalty,
      selected.concept_priority,
      history.session_attempt_count,
      history.session_latest_position,
      history.last_attempt_at,
      count(*) over () as question_pool_count,
      selected.session_latest_position as overall_session_latest_position,
      case question.difficulty
        when 'easy' then 0
        when 'medium' then 1
        when 'hard' then 2
      end as difficulty_number,
      case
        when selected.is_unseen then 1
        when selected.last_result = 'too_hard' then 0
        when selected.last_result = 'forgot' then
          case
            when selected.live_retrievability < 0.45::double precision then 0
            else 1
          end
        when selected.last_result = 'didnt_know' then 0
        when (
          0.65::double precision * selected.mastery_estimate
          + 0.35::double precision * selected.live_retrievability
        ) < 0.40::double precision then 0
        when (
          0.65::double precision * selected.mastery_estimate
          + 0.35::double precision * selected.live_retrievability
        ) <= 0.72::double precision then 1
        else 2
      end as target_difficulty_number
    from selected_concept_questions question
    join selected_concept selected on true
    join selected_preferred_angle preferred
      on preferred.concept_id = selected.concept_id
    join question_history history
      on history.question_id = question.question_id
  ),
  selected_question as (
    select pool.*
    from selected_question_pool pool
    order by
      case
        when pool.question_pool_count > 1
          and pool.session_latest_position = pool.overall_session_latest_position
          and pool.overall_session_latest_position > 0
          then 1
        else 0
      end,
      case when pool.normalized_angle = pool.preferred_angle then 0 else 1 end,
      case
        when pool.session_latest_position is null
          or pool.overall_session_latest_position = 0
          or pool.session_latest_position < pool.overall_session_latest_position - 4
          then 0
        else 1
      end,
      abs(pool.difficulty_number - pool.target_difficulty_number),
      case
        when pool.difficulty_number <= pool.target_difficulty_number then 0
        else 1
      end,
      pool.session_attempt_count,
      pool.last_attempt_at asc nulls first,
      pool.sort_order,
      pool.created_at,
      pool.question_id
    limit 1
  ),
  selected_question_with_position as (
    select
      selected.*,
      1 + (
        select count(*)::bigint
        from public.questions candidate
        join concept_balances candidate_balance
          on candidate_balance.concept_id = candidate.concept_id
        join effective_deck_concepts candidate_concept
          on candidate_concept.concept_id = candidate.concept_id
        join effective_deck_concepts selected_concept_row
          on selected_concept_row.concept_id = selected.concept_id
        where candidate.status = 'published'
          and candidate.question_type = 'short_answer'
          and exists (
            select 1
            from public.question_accepted_answers candidate_answer
            where candidate_answer.question_id = candidate.id
          )
          and row(
          lower(candidate_concept.concept_name),
          candidate.concept_id,
          candidate.sort_order,
          candidate.created_at,
          candidate.id
        ) < row(
          lower(selected_concept_row.concept_name),
          selected.concept_id,
          selected.sort_order,
          selected.created_at,
          selected.question_id
        )
      ) as candidate_position
    from selected_question selected
  )
  select
    jsonb_build_object(
      'question_id', selected.question_id,
      'concept_id', selected.concept_id,
      'testing_angle', selected.testing_angle,
      'prompt', selected.prompt,
        'prompt_format', selected.prompt_format, 'answer_format', selected.accepted_answer_format, 'question_version_id', selected.current_version_id,
      'accepted_answer', selected.accepted_answer,
      'difficulty', selected.difficulty,
      'explanation', selected.explanation,
      'candidate_position', selected.candidate_position,
      'created_at', selected.created_at
    )
    || case
      when coalesce(p_include_debug, false) then jsonb_build_object(
        'selected_branch_balance', selected.branch_balance,
        'new_component', selected.new_component,
        'review_component', selected.review_component,
        'angle_component', selected.angle_component,
        'prerequisite_priority_component',
          selected.prerequisite_priority_component,
        'urgent_review_component', selected.urgent_review_component,
        'lapse_signal', selected.lapse_signal,
        'lapse_priority_component', selected.lapse_priority_component,
        'repeated_lapse_concern', selected.repeated_lapse_concern,
        'repeated_lapse_signal', selected.repeated_lapse_signal,
        'repeated_lapse_priority_component',
          selected.repeated_lapse_priority_component,
        'combined_lapse_priority_component',
          selected.combined_lapse_priority_component,
        'latest_result', selected.last_result,
        'live_retrievability', selected.live_retrievability,
        'target_difficulty_number', selected.target_difficulty_number,
        'recent_penalty', selected.recent_concept_penalty,
        'concept_priority', selected.concept_priority,
        'selected_angle_need', selected.angle_need,
        'concept_angle_need', selected.concept_angle_need,
        'angle_evidence_count', selected.angle_evidence_count,
        'angle_history_count', selected.angle_history_count,
        'angle_evidence_component', selected.evidence_need_component,
        'angle_time_component', selected.time_need_component,
        'angle_response_component', selected.response_need_component,
        'angle_contradiction_component',
          selected.contradiction_need_component,
        'selection_reason', case
          when selected.is_unseen then 'unseen_concept'
          when selected.lapse_priority_component > 0 then 'fresh_forgot_lapse'
          when selected.repeated_lapse_priority_component > 0
            then 'repeated_lapse_history'
          when selected.urgent_review_component > 0 then 'urgent_review'
          else 'priority_score'
        end
      )
      else '{}'::jsonb
    end
  into selection_result
  from selected_question_with_position selected;

  return selection_result;
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure))<>'61c182ea10d0c417767dc2adcddf851a' then raise exception '122 unexpected function baseline: select_next_study_question_hardened(uuid,boolean)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.select_next_study_question_hardened(uuid,boolean)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.select_next_study_question_hardened(uuid,boolean)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role socrates_migrator;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.m111_card_balance(p_card_id uuid, p_snapshot jsonb, p_settings jsonb)
 RETURNS double precision
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare b double precision;
begin
 if p_settings->>'version' is distinct from '109' then return 50::double precision;end if;
 with recursive card as (
  select c.* from public.personal_cards c where c.id=p_card_id and c.owner_id=auth.uid() and c.concept_id is null
 ), ancestors as (
  select n.id,n.parent_id,n.library_id,0 distance,array[n.id] visited from card c join public.library_nodes n on n.id=c.library_node_id and n.library_id=c.library_id
  union all select n.id,n.parent_id,n.library_id,a.distance+1,a.visited||n.id
  from ancestors a join public.library_nodes n on n.id=a.parent_id and n.library_id=a.library_id where not n.id=any(a.visited)
 ), canonical_source as (
  select a.id from ancestors a where p_snapshot->'selected_node_ids' ? a.id::text or (a.distance=0 and p_settings#>'{topic_preference_state,projection,official}' ? a.id::text) order by a.distance limit 1
 ), contributions as (
  select 'official:topic:'||s.id::text key,coalesce((p_settings#>>array['topic_preference_state','projection','official',s.id::text,'balance'])::double precision,(p_snapshot->'node_preferences'->>s.id::text)::double precision,50) balance from canonical_source s
  where p_settings#>>'{topic_preference_state,projection,version}' is distinct from '122'
  union
  select x.source_key,x.balance from public.m122_card_official_sources(p_card_id,p_settings) x
  where p_settings#>>'{topic_preference_state,projection,version}'='122'
  union
  select 'personal:topic:'||(p_settings->'effective_topic_sources'->>c.personal_topic_id::text),
   coalesce((p_settings#>>array['topic_preference_state','projection','personal',c.personal_topic_id::text,'balance'])::double precision,(p_settings->'topic_preferences'->>(p_settings->'effective_topic_sources'->>c.personal_topic_id::text))::double precision,50)
  from card c where p_settings->'effective_topic_sources' ? c.personal_topic_id::text
  union
  select 'personal:collection:'||m.collection_id::text,coalesce((p_settings->'collection_preferences'->>m.collection_id::text)::double precision,50)
  from card c join public.personal_collection_cards m on m.personal_card_id=c.id and m.owner_id=c.owner_id
  where p_settings->'selected_collection_ids' ? m.collection_id::text
 ) select coalesce(avg(balance),50) into b from contributions;
 return b;
end $function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.m111_card_balance(uuid,jsonb,jsonb)'::regprocedure))<>'9c637e9d4d16b34287346d44d99a756b' then raise exception '122 unexpected function baseline: m111_card_balance(uuid,jsonb,jsonb)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.m111_card_balance(uuid,jsonb,jsonb)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.m111_card_balance(uuid,jsonb,jsonb)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

set local role postgres;
do $adapt$
declare before_metadata jsonb; replacement text:=$replacement$CREATE OR REPLACE FUNCTION public.get_development_delete_summary(p_record_type text, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name text;
  v_child_groups bigint := 0;
  v_libraries bigint := 0;
  v_nodes bigint := 0;
  v_concepts bigint := 0;
  v_questions bigint := 0;
  v_articles bigint := 0;
  v_attempts bigint := 0;
  v_versions bigint := 0;
  v_concept_assignments bigint := 0;
  v_question_assignments bigint := 0;
  v_article_assignments bigint := 0;
  v_warning text;
begin
  perform pg_catalog.pg_advisory_xact_lock(104,20260927);
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may inspect deletion impact.';
  end if;

  case p_record_type
    when 'group' then
      select lg.name into v_name
      from public.library_groups lg where lg.id = p_record_id;
      if v_name is null then raise exception 'Library Group was not found.'; end if;

      with recursive group_tree as (
        select lg.id from public.library_groups lg where lg.id = p_record_id
        union all
        select child.id
        from public.library_groups child
        join group_tree parent on child.parent_id = parent.id
      ), group_libraries as (
        select distinct lgl.library_id
        from public.library_group_libraries lgl
        where lgl.group_id in (select id from group_tree)
      ), group_nodes as (
        select ln.id
        from public.library_nodes ln
        where ln.library_id in (select library_id from group_libraries)
      ), group_concepts as (
        select distinct cp.concept_id
        from public.concept_placements cp
        where cp.library_node_id in (select id from group_nodes)
      ), group_articles as (
        select distinct ap.article_id
        from public.article_category_placements ap
        where ap.library_node_id in (select id from group_nodes)
      )
      select
        (select greatest(count(*) - 1, 0) from group_tree),
        (select count(*) from group_libraries),
        (select count(*) from group_nodes),
        (select count(*) from group_concepts),
        (
          select count(distinct q.id)
          from public.questions q
          where q.concept_id in (select concept_id from group_concepts)
             or exists (
               select 1
               from public.question_versions qv
               where qv.question_id = q.id
                 and qv.concept_id in (select concept_id from group_concepts)
             )
        ),
        (select count(*) from group_articles)
      into v_child_groups, v_libraries, v_nodes, v_concepts, v_questions, v_articles;

      v_warning := format(
        E'Delete this Group?\nThis Group contains %s child Groups, %s Libraries, %s Topic Tree nodes, %s Concepts, %s Questions, and %s Articles. Deleting it will permanently remove associated development content.',
        v_child_groups, v_libraries, v_nodes, v_concepts, v_questions, v_articles
      );

    when 'library' then
      select l.name into v_name from public.libraries l where l.id = p_record_id;
      if v_name is null then raise exception 'Library was not found.'; end if;

      select count(*) into v_nodes
      from public.library_nodes ln where ln.library_id = p_record_id;
      select count(distinct cp.concept_id) into v_concepts
      from public.concept_placements cp
      join public.library_nodes ln on ln.id = cp.library_node_id
      where ln.library_id = p_record_id;
      select count(distinct q.id) into v_questions
      from public.questions q
      where q.concept_id in (
              select distinct cp.concept_id
              from public.concept_placements cp
              join public.library_nodes ln on ln.id = cp.library_node_id
              where ln.library_id = p_record_id
            )
         or exists (
              select 1
              from public.question_versions qv
              where qv.question_id = q.id
                and qv.concept_id in (
                  select distinct cp.concept_id
                  from public.concept_placements cp
                  join public.library_nodes ln on ln.id = cp.library_node_id
                  where ln.library_id = p_record_id
                )
            );
      select count(distinct ap.article_id) into v_articles
      from public.article_category_placements ap
      join public.library_nodes ln on ln.id = ap.library_node_id
      where ln.library_id = p_record_id;

      v_warning := format(
        E'Delete this Library?\nThis Library contains %s Topic Tree nodes, %s Concepts, %s Questions, and %s Articles. Deleting it will permanently remove associated development content.',
        v_nodes, v_concepts, v_questions, v_articles
      );

    when 'library_node' then
      select ln.name into v_name
      from public.library_nodes ln where ln.id = p_record_id;
      if v_name is null then raise exception 'Topic Tree node was not found.'; end if;

      with recursive node_tree as (
        select ln.id from public.library_nodes ln where ln.id = p_record_id
        union all
        select child.id
        from public.library_nodes child
        join node_tree parent on child.parent_id = parent.id
      )
      select
        greatest((select count(*) from node_tree) - 1, 0),
        (select count(*) from public.concept_placements cp where cp.library_node_id in (select id from node_tree)),
        (select count(*) from public.article_category_placements ap where ap.library_node_id in (select id from node_tree))
      into v_nodes, v_concepts, v_articles;

      v_warning := format(
        E'Delete this branch?\nThis branch contains %s subtopics, %s Concept placements, and %s Article placements. Continuing will permanently remove this structure and its saved study preferences.',
        v_nodes, v_concepts, v_articles
      );

    when 'concept' then
      select c.name into v_name from public.concepts c where c.id = p_record_id;
      if v_name is null then raise exception 'Concept was not found.'; end if;
      select count(distinct q.id) into v_questions
      from public.questions q
      where q.concept_id = p_record_id
         or exists (
           select 1
           from public.question_versions qv
           where qv.question_id = q.id
             and qv.concept_id = p_record_id
         );
      select count(*) into v_attempts from public.review_attempts ra where ra.concept_id = p_record_id;
      select count(*) into v_versions from public.concept_versions cv where cv.concept_id = p_record_id;
      v_warning := format(
        E'Delete this Concept?\nThis Concept contains %s Questions, %s learner attempts, and %s immutable versions. Deleting it will permanently remove associated development and learner data.',
        v_questions, v_attempts, v_versions
      );

    when 'question' then
      select q.prompt into v_name from public.questions q where q.id = p_record_id;
      if v_name is null then raise exception 'Question was not found.'; end if;
      select count(*) into v_attempts from public.review_attempts ra where ra.question_id = p_record_id;
      select count(*) into v_versions from public.question_versions qv where qv.question_id = p_record_id;
      v_warning := format(
        E'Delete this Question?\nThis Question has %s learner attempts and %s immutable versions. Deleting it will permanently remove that development and learner history.',
        v_attempts, v_versions
      );

    when 'tag' then
      select t.name into v_name from public.tags t where t.id = p_record_id;
      if v_name is null then raise exception 'Tag was not found.'; end if;
      select count(*) into v_concept_assignments from public.concept_tags ct where ct.tag_id = p_record_id;
      select count(*) into v_question_assignments from public.question_tags qt where qt.tag_id = p_record_id;
      select count(*) into v_article_assignments from public.article_tags at where at.tag_id = p_record_id;
      v_warning := format(
        E'Delete this Tag?\nThis Tag is assigned to %s Concepts, %s Questions, and %s Articles. Deleting it will permanently remove those assignments; immutable snapshots retain their historical text.',
        v_concept_assignments, v_question_assignments, v_article_assignments
      );

    else
      raise exception 'Unsupported deletion type: %', p_record_type;
  end case;

  if p_record_type='library_node' and exists(select 1 from public.official_topic_placements p join public.library_nodes n on n.library_id=p.library_id where n.id=p_record_id) then
    v_warning:=v_warning||E'\nThis Library has shared Topic locations. Review all locations and protected dependencies using the current placement-aware deletion control. Concept and Question records are retained by Topic deletion.';
  end if;
  return jsonb_build_object(
    'record_type', p_record_type,
    'record_id', p_record_id,
    'name', v_name,
    'warning', v_warning,
    'child_groups', v_child_groups,
    'libraries', v_libraries,
    'nodes', v_nodes,
    'concepts', v_concepts,
    'questions', v_questions,
    'articles', v_articles,
    'attempts', v_attempts,
    'versions', v_versions,
    'concept_assignments', v_concept_assignments,
    'question_assignments', v_question_assignments,
    'article_assignments', v_article_assignments
  );
end;
$function$
$replacement$;
begin
 if md5(pg_get_functiondef('public.get_development_delete_summary(text,uuid)'::regprocedure))<>'6ddf3bff95a091336f88a91459b9a708' then raise exception '122 unexpected function baseline: get_development_delete_summary(text,uuid)';end if;
 select to_jsonb(p)-'prosrc' into before_metadata from pg_proc p where p.oid='public.get_development_delete_summary(text,uuid)'::regprocedure;
 execute replacement;
 if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.get_development_delete_summary(text,uuid)'::regprocedure) is distinct from before_metadata then raise exception '122 function authority changed';end if;
end $adapt$;
reset role;

-- Only these six guarded operations are browser APIs. Internal helpers have
-- no PUBLIC/anon/authenticated/service_role execute grants.
do $permissions$
declare f record;
begin
 for f in select p.oid::regprocedure signature,p.prosecdef,p.proname from pg_proc p where p.pronamespace='public'::regnamespace
 and (p.proname like 'm122_%' or p.proname in ('get_official_topic_graph','add_official_topic_placement','position_official_topic_placement','remove_official_topic_placement','get_official_topic_delete_impact','delete_official_topic_with_impact')) loop
  if not f.prosecdef then
   execute format('alter function %s owner to socrates_migrator',f.signature);
   execute 'set local role socrates_migrator';
  end if;
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to postgres,socrates_migrator',f.signature);
  if f.proname not like 'm122_%' then execute format('grant execute on function %s to authenticated',f.signature);end if;
  execute 'set local role postgres';
 end loop;
end $permissions$;
-- Atomic installation. Production application requires separate authorization.
commit;
