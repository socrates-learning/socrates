"""Isolated HOME117 transactions only; clone synthetic baseline, remove clone.
No hosted connection, credentials, sleep-based race assumption or shared DB writes.
"""
import json
import subprocess
import uuid

CONTAINER = 'socrates-format116-20261003-db'
TEMPLATE = 'home117'
DATABASE = 'home117_race_' + uuid.uuid4().hex[:12]
OWNER = '11700000-0000-4000-8000-000000000002'
DECK = '11700000-0000-4000-8000-000000000090'
LIBRARY = '11700000-0000-4000-8000-000000000010'


def node(n):
    return f'11700000-0000-4000-8000-{n:012}'


def command(database=DATABASE):
    return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres',
            '-d', database, '-v', 'ON_ERROR_STOP=1']


def sql(statement, database=DATABASE):
    result = subprocess.run(command(database), input=statement, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


actor = f"select set_config('request.jwt.claim.sub','{OWNER}',true);"
bootstrap = f"public.get_home_study_bootstrap('{LIBRARY}','{DECK}')"


def revision():
    return sql(f"begin;{actor}select {bootstrap}#>>'{{unified_deck_settings,topic_preference_state,revision}}';rollback;").splitlines()[-1]


def reset(n, value, expected):
    return f"set local role authenticated;select public.set_study_deck_topic_subtree_preference('{DECK}','{LIBRARY}','official:topic:{node(n)}',{value},'{expected}');reset role;"


def balances():
    return json.loads(sql(f"select jsonb_object_agg(library_node_id,new_mastery_balance) from public.study_deck_node_preferences where deck_id='{DECK}'"))


# Refuse to clone any unproven users/content.
assert sql("select count(*) from auth.users where email not like 'zz-home117-%@example.invalid'", TEMPLATE) == '0'
assert sql("select count(*) from libraries where slug not like 'zz-home117-%'", TEMPLATE) == '0'
assert sql("select count(*) from libraries", TEMPLATE) == '2'
subprocess.run(['docker', 'exec', CONTAINER, 'createdb', '-U', 'supabase_admin', '-T', TEMPLATE, DATABASE], check=True, capture_output=True)
try:
    def race(first, second, second_error=None):
        # First worker acknowledges acquired transaction locks. The second is
        # started only then; pipe input holds the first transaction open.
        prefix = "\\set VERBOSITY verbose\nbegin;set local statement_timeout='10s';" + actor
        worker = subprocess.Popen(command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        worker.stdin.write(prefix + first + "select 'HOME117_LOCK_HELD';\n")
        worker.stdin.flush()
        while True:
            line = worker.stdout.readline()
            if 'HOME117_LOCK_HELD' in line:
                break
            if not line:
                raise RuntimeError(worker.stderr.read())
        competitor = subprocess.Popen(command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        competitor.stdin.write(prefix + second + 'commit;\n')
        competitor.stdin.close()
        # Positively observe the competitor waiting on the first lock.
        import time
        for _ in range(100):
            waiting = sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'")
            if int(waiting) > 0:
                break
            time.sleep(0.02)
        else:
            worker.stdin.write('rollback;\n');worker.stdin.close()
            raise AssertionError('competing command did not wait on the established lock')
        worker.stdin.write('commit;\n');worker.stdin.close()
        worker.wait(timeout=15); competitor.wait(timeout=15)
        first_error = worker.stderr.read(); competing_error = competitor.stderr.read()
        assert worker.returncode == 0, first_error
        assert (competitor.returncode == 0) == (second_error is None), competing_error
        if second_error:
            assert second_error in competing_error, competing_error

    initial = revision()
    race(reset(20, 60, initial), reset(21, 20, initial), '40001')
    assert all(value == 60 for value in balances().values())
    print('PASS parent reset vs stale child: parent atomic, child conflicts')

    initial = revision()
    race(reset(21, 20, initial), reset(20, 80, initial), '40001')
    values = balances()
    assert values[node(20)] == 60 and values[node(21)] == values[node(22)] == values[node(23)] == 20
    assert values[node(24)] == 60
    print('PASS child reset vs stale parent: child subtree only, parent conflicts')

    initial = revision(); before = balances()
    move = f"update public.library_nodes set parent_id='{node(24)}',sort_order=1 where id='{node(23)}';"
    race(move, reset(21, 40, initial), '40001')
    assert balances() == before
    print('PASS structural move vs stale reset: hierarchy revision conflicts, no preference write')

    initial = revision()
    race(reset(24, 80, initial), f"update public.library_nodes set parent_id='{node(21)}',sort_order=1 where id='{node(23)}';")
    assert balances()[node(23)] == 80 and balances()[node(21)] == 20
    print('PASS reset vs structural move: move waits then retains Topic identity preference')

    initial = revision()
    create = f"insert into public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) values('{node(27)}','{LIBRARY}','{node(21)}','ZZ HOME117 Concurrent child','topic',2);"
    race(create, reset(21, 30, initial), '40001')
    assert node(27) not in balances()
    print('PASS concurrent create: no automatic preference copy and stale reset conflicts')

    initial = revision()
    race(reset(21, 30, initial), f"delete from public.library_nodes where id='{node(27)}';", '23503')
    assert balances()[node(27)] == 30
    print('PASS reset vs uncoordinated deletion: existing restrictive FK prevents dangling preference')
finally:
    subprocess.run(['docker', 'exec', CONTAINER, 'dropdb', '-U', 'supabase_admin', '--force', DATABASE], check=True, capture_output=True)
    print('Disposable race clone removed; base fixture and all other databases unchanged')
