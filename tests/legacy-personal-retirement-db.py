"""Migration rehearsal on a new, network-isolated synthetic schema clone only.
Usage: python3 tests/legacy-personal-retirement-db.py legacy_personal137_run_N
Preserves the source database and keeps the new disposable recovery copy.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'socrates-admin-card135-recovery-20261020'
TEMPLATE = 'learner_card_media136_verified'
DATABASE = sys.argv[1] if len(sys.argv) == 2 else ''
assert re.fullmatch(r'legacy_personal137_run_[a-z0-9]+', DATABASE), 'Dedicated synthetic database name required'
info = json.loads(subprocess.check_output(['docker','inspect',CONTAINER]))[0]
assert info['HostConfig']['NetworkMode'] == 'none' and not info['NetworkSettings']['Ports']
def command(db):
 return ['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-h','/tmp','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1']
assert subprocess.check_output(command(TEMPLATE)+['-c','select (select count(*) from auth.users)+(select count(*) from public.personal_cards)'],text=True).strip() == '0'
subprocess.run(command('postgres')+['-c',f'create database {DATABASE} template {TEMPLATE}'],check=True)
fixture = (ROOT/'tests/learner-card-movement.sql').read_text().split('set local role authenticated;')[0]
fixture = fixture.replace("current_database() <> 'learner_card_movement_search'",f"current_database() <> '{DATABASE}'")
setup = r'''
set local search_path=public,pg_catalog;
insert into public.personal_collections(owner_id,name) select owner_id,'Historical Deck' from fixtures where role_name in ('admin','learner','editor');
insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) select c.id,c.owner_id,f.legacy_card from public.personal_collections c join fixtures f on f.owner_id=c.owner_id;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
select public.set_study_deck_personal_collection_selection((select deck from movement_fixture),(select id from public.personal_collections where owner_id=(select owner_id from fixtures where role_name='learner')),true);
select public.set_study_deck_personal_collection_preference((select deck from movement_fixture),(select id from public.personal_collections where owner_id=(select owner_id from fixtures where role_name='learner')),43);
create function pg_temp.snapshot() returns jsonb language plpgsql as $$
declare t record;data jsonb;result jsonb:='{}';begin
 for t in select schemaname,tablename from pg_tables where schemaname in('public','auth','storage') order by 1,2 loop
  execute format('select jsonb_build_object(''count'',count(*),''hash'',md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'')::text)) from %I.%I r',t.schemaname,t.tablename) into data;
  result:=result||jsonb_build_object(t.schemaname||'.'||t.tablename,data);
 end loop;return result;end$$;
create function pg_temp.learning_snapshot() returns jsonb language plpgsql as $$
declare t text;data jsonb;result jsonb:='{}';begin
 foreach t in array array['library_nodes','official_topic_locations','concepts','questions','concept_placements','question_sources','sources','article_sources','content_source_notes','personal_review_attempts','review_attempts','user_personal_concept_state','user_concept_mastery','user_concept_testing_angle_state','study_sessions','study_decks','study_deck_location_selections','user_study_node_selections','study_deck_personal_topic_selections','study_deck_node_preferences','study_deck_personal_collection_preferences','study_deck_personal_collection_selections','study_deck_personal_topic_preferences','media_assets','content_media_placements'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',t) into data;
  result:=result||jsonb_build_object(t,data);
 end loop;return result;end$$;
create temp table legacy_before as select pg_temp.snapshot() data,pg_temp.learning_snapshot() learning,
 (select jsonb_agg(jsonb_build_array(oid::regprocedure::text,pg_get_functiondef(oid),proacl::text,proconfig) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname<>'create_personal_concept_overlay') functions,
 (select jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid),polroles,polcmd,polpermissive) order by polrelid::regclass::text,polname) from pg_policy where polrelid in(select oid from pg_class where relnamespace='public'::regnamespace)) policies;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
set local role authenticated;
create temp table candidates_before as select coalesce(jsonb_agg(to_jsonb(c) order by candidate_id),'[]') data from public.resolve_study_candidates((select deck from movement_fixture)) c;
reset role;
commit;
'''
after = r'''
begin;
set local search_path=public,pg_catalog;
select pg_temp.ok(data=pg_temp.snapshot(),'Migration installation preserves every existing public/auth/Storage row') from legacy_before;
select pg_temp.ok(functions=(select jsonb_agg(jsonb_build_array(oid::regprocedure::text,pg_get_functiondef(oid),proacl::text,proconfig) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname<>'create_personal_concept_overlay'),'Every unrelated public function and its grants unchanged') from legacy_before;
select pg_temp.ok(policies=(select jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid),polroles,polcmd,polpermissive) order by polrelid::regclass::text,polname) from pg_policy where polrelid in(select oid from pg_class where relnamespace='public'::regnamespace) and polname not in('personal_concepts_legacy_insert_restriction','personal_collections_legacy_insert_restriction','personal_cards_legacy_insert_restriction')),'All pre-existing policies unchanged') from legacy_before;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
set local role authenticated;
select pg_temp.ok(data=(select coalesce(jsonb_agg(to_jsonb(c) order by candidate_id),'[]') from public.resolve_study_candidates((select deck from movement_fixture)) c),'Study/Cram candidate identities, content and ordering unchanged') from candidates_before;
reset role;
\o
select jsonb_build_object('database',current_database(),'preservation',data) from legacy_before;
\o /dev/null
commit;
'''
sql = fixture+setup+(ROOT/'supabase/137_retire_legacy_personal_creation.sql').read_text()+(ROOT/'supabase/verify_137_retire_legacy_personal_creation.sql').read_text()+after+(ROOT/'tests/legacy-personal-retirement.sql').read_text()
result = subprocess.run(command(DATABASE),input=sql,text=True,capture_output=True)
print(result.stdout);print(result.stderr)
assert result.returncode == 0, 'Migration or preservation/authorization check failed'
print('Migration 137 synthetic rehearsal PASS; source schema preserved; behavioral mutations rolled back.')

# Reuse existing media/account-deletion regression contracts unchanged. Only the
# disposable database guard and missing synthetic bucket setup are adapted.
media_fixture = (ROOT/'tests/learner-card-movement.sql').read_text().split('set local role authenticated;')[0]
media_fixture = media_fixture.replace("current_database() <> 'learner_card_movement_search'", f"current_database() <> '{DATABASE}'")
media_result = subprocess.run(command(DATABASE), input=media_fixture+(ROOT/'tests/personal-card-media-db.sql').read_text(), text=True, capture_output=True)
print(media_result.stdout);print(media_result.stderr)
assert media_result.returncode == 0, 'Existing private-image contract failed'
account = (ROOT/'tests/account-deletion.sql').read_text().replace("current_database() not like 'account127_%'",f"current_database() <> '{DATABASE}'")
account = account.replace('begin;', "begin;\ninsert into storage.buckets(id,name,public) values('socrates-profile-photos','socrates-profile-photos',false),('socrates-content-media','socrates-content-media',false) on conflict(id) do nothing;", 1)
account_result = subprocess.run(command(DATABASE), input=account, text=True, capture_output=True)
print(account_result.stdout);print(account_result.stderr)
assert account_result.returncode == 0, 'Existing account-deletion contract failed'
print('Existing private-image and account-deletion regressions PASS; all mutations rolled back.')
