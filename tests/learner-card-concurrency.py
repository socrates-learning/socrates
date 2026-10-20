"""Disposable, network-isolated PostgreSQL proof of the existing timestamp guard.

Run explicitly, after restoring the schema-only synthetic 135 template. No
credentials, hosted URL, migrations, or recovery data are used by this test.
"""
from pathlib import Path
import json
import subprocess

CONTAINER = 'socrates-admin-card135-recovery-20261020'
TEMPLATE = 'admin_card135_synthetic_current_schema'
DATABASE = 'learner_card_concurrency_disposable'


def command(database):
    return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-h', '/tmp',
            '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1']


def sql(text, database=DATABASE):
    return subprocess.run(command(database), input=text, text=True,
                          capture_output=True, check=True).stdout.strip()


info = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER]))[0]
assert info['HostConfig']['NetworkMode'] == 'none'
assert not info['NetworkSettings']['Ports']
assert sql('select (select count(*) from auth.users)+(select count(*) from public.personal_cards)', TEMPLATE) == '0'
assert sql("select count(*) from pg_database where datname='" + DATABASE + "'", 'postgres') == '0'
subprocess.run(['docker', 'exec', CONTAINER, 'createdb', '-h', '/tmp', '-U', 'supabase_admin', '-T', TEMPLATE, DATABASE], check=True)
try:
    setup = Path(__file__).with_name('learner-card-movement.sql').read_text().split('create temp table movement_fixture')[0]
    setup = setup.replace("current_database() <> 'learner_card_movement_search'", "current_database() <> '" + DATABASE + "'")
    fixture = json.loads(sql(setup + r"""
\o
select json_build_object('owner',owner_id,'card',topic_card,'destination',topic_id,
 'official',(select root_id from libraries where kind='allowed'),
 'library',(select id from libraries where kind='allowed'),
 'revision',(select updated_at from public.personal_cards where id=topic_card)) from fixtures where role_name='learner';
commit;
"""))
    owner, card = fixture['owner'], fixture['card']
    auth = f"set local role authenticated;select set_config('request.jwt.claim.sub','{owner}',true);"
    condition = f"id='{card}' and owner_id='{owner}' and concept_id is null and updated_at='{fixture['revision']}'"
    first_sql = fr"""begin; {auth}
update public.personal_cards set personal_topic_id=null,library_node_id='{fixture['official']}',library_id='{fixture['library']}' where {condition};
\echo ROW_LOCKED
select pg_sleep(0.8);
commit;
"""
    first = subprocess.Popen(command(DATABASE), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    first.stdin.write(first_sql)
    first.stdin.close()
    while True:
        line = first.stdout.readline()
        assert line, first.stderr.read()
        if 'ROW_LOCKED' in line:
            break
    # Starts while the other owner request holds the row lock. PostgreSQL must
    # recheck the timestamp against its committed version after waiting.
    second = sql(f"""begin; {auth}
with changed as (update public.personal_cards set personal_topic_id='{fixture['destination']}',library_node_id=null,library_id=null where {condition} returning id)
select 'second_changed='||count(*) from changed;commit;""")
    assert first.wait(timeout=10) == 0, first.stderr.read()
    assert 'second_changed=0' in second, second
    fresh = json.loads(sql(f"select to_jsonb(c) from public.personal_cards c where id='{card}'"))
    assert fresh['library_node_id'] == fixture['official'] and fresh['personal_topic_id'] is None
    assert fresh['updated_at'] != fixture['revision']
    stale_edit = sql(f"""begin; {auth}
with changed as (update public.personal_cards set question='Stale editor' where {condition} returning id)
select 'stale_edit_changed='||count(*) from changed;commit;""")
    assert 'stale_edit_changed=0' in stale_edit
    assert sql(f"select question from public.personal_cards where id='{card}'") == '**Historical Markdown front**'
    retry = sql(f"""begin; {auth}
with changed as (update public.personal_cards set personal_topic_id='{fixture['destination']}',library_node_id=null,library_id=null
where id='{card}' and owner_id='{owner}' and concept_id is null and updated_at='{fresh['updated_at']}' returning id)
select 'fresh_changed='||count(*) from changed;commit;""")
    assert 'fresh_changed=1' in retry
    assert sql(f"select personal_topic_id from public.personal_cards where id='{card}'") == fixture['destination']
    print('PASS: concurrent move waits then rejects stale revision; stale editor cannot overwrite; fresh reload and move succeed.')
finally:
    subprocess.run(['docker', 'exec', CONTAINER, 'dropdb', '-h', '/tmp', '-U', 'supabase_admin', DATABASE], check=True)
print('PASS: disposable concurrency database removed; template unchanged.')
