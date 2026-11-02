"""Local-only Migration 140 authorization and preservation verification.
Usage: python3 tests/legacy-editor-retirement-db.py editor140_run_NAME
Existing test templates and databases are never overwritten or removed.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'socrates-admin-card135-recovery-20261020'
DATABASE = sys.argv[1] if len(sys.argv) == 2 else ''
assert re.fullmatch(r'editor140_run_[a-z0-9]+', DATABASE), 'Disposable database name required'
info = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER]))[0]
assert info['HostConfig']['NetworkMode'] == 'none' and not info['NetworkSettings']['Ports']


def command(database):
    return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-h', '/tmp',
            '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1']


def run(sql, database=DATABASE):
    result = subprocess.run(command(database), input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        print(result.stdout)
        print(result.stderr)
        raise AssertionError('Isolated Editor authorization check failed')
    return result.stdout


assert run('select count(*) from auth.users', 'legacy_personal137_verified').strip() == '0'
run(f'create database {DATABASE} owner postgres template legacy_personal137_verified', 'postgres')
fixture = (ROOT/'tests/learner-card-movement.sql').read_text().split('set local role authenticated;')[0]
fixture = fixture.replace("current_database() <> 'learner_card_movement_search'", f"current_database() <> '{DATABASE}'")
setup = """
select pg_temp.sign_in(null);
insert into public.personal_collections(owner_id,name) select owner_id,'Historical Deck' from fixtures where role_name in('admin','learner','editor');
insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) select c.id,c.owner_id,f.legacy_card from public.personal_collections c join fixtures f on f.owner_id=c.owner_id;
commit;
set role postgres;
"""
snapshot = """
create function pg_temp.snapshot140() returns jsonb language plpgsql as $$
declare t record;v jsonb;r jsonb:='{}';begin
 for t in select schemaname,tablename from pg_tables where schemaname in('public','private','account_deletion_private','auth','storage') order by 1,2 loop
  execute format('select jsonb_build_object(''count'',count(*),''hash'',md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]'')::text)) from %I.%I x',t.schemaname,t.tablename) into v;
  r:=r||jsonb_build_object(t.schemaname||'.'||t.tablename,v);
 end loop;return r;end$$;
create temp table before140 as select pg_temp.snapshot140() data;
begin;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
set local role authenticated;
create temp table candidates140 as select coalesce(jsonb_agg(to_jsonb(c) order by candidate_id),'[]') data from public.resolve_study_candidates((select deck from movement_fixture)) c;
reset role;
select pg_temp.sign_in(null);
commit;
"""
verify = (ROOT/'supabase/verify_140_retire_editor_authority.sql').read_text()
preserve = """
begin;
select pg_temp.ok(data=pg_temp.snapshot140(),'All 121 existing tables preserved by Migration 140') from before140;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
set local role authenticated;
select pg_temp.ok(data=(select coalesce(jsonb_agg(to_jsonb(c) order by candidate_id),'[]') from public.resolve_study_candidates((select deck from movement_fixture)) c),'Existing Study and Cram candidate identities content and ordering unchanged') from candidates140;
reset role;
select pg_temp.sign_in(null);
commit;
"""
sql = fixture+setup
for migration in ['138_role_management_safeguards.sql', '139_final_admin_account_deletion.sql']:
    sql += (ROOT/'supabase'/migration).read_text()
sql += """
-- Reproduce the legacy unbound personal-media reservation permission before
-- retirement. The reservation is synthetic and rolls back before preservation.
begin;
select pg_temp.sign_in((select owner_id from fixtures where role_name='editor'));
set local role authenticated;
do $$begin
 perform public.reserve_media_upload((select id from libraries where kind='allowed'),'personal',gen_random_uuid());
end$$;
select 'Baseline reproduced: Editor personal-media reservation accepted';
rollback;
select pg_temp.sign_in(null);
"""
sql += snapshot+'set role postgres;'+(ROOT/'supabase/140_retire_editor_authority.sql').read_text()+verify+preserve
sql += (ROOT/'supabase/verify_138_role_management_safeguards.sql').read_text()
sql += (ROOT/'supabase/verify_139_final_admin_account_deletion.sql').read_text()
sql += (ROOT/'tests/legacy-editor-retirement.sql').read_text()
print(run(sql))
print('Migration 140 isolated authorization and preservation PASS')

# Negative controls prove the installed verifier detects a changed permission,
# an added execute grant, and a rewrite of a protected shared study dependency.
body = verify.replace('begin read only;', '').replace('commit;', '')
for label, change in [
    ('restored Editor policy', 'alter policy "Editors read all concepts" on public.concepts using (public.is_editor_or_admin());'),
    ('media helper grant', 'grant execute on function public.m114_author(uuid,uuid) to authenticated;'),
    ('shared helper rewrite', "create or replace function public.is_editor_or_admin() returns boolean language sql stable security definer set search_path='' as $$select public.is_admin()$$;"),
]:
    result = subprocess.run(command(DATABASE), input='begin;set local role postgres;'+change+body+'rollback;', text=True, capture_output=True)
    assert result.returncode and '140:' in result.stderr, (label, result.stderr)
    print('Verifier rejects:', label)
print(run(verify))
