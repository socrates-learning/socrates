"""Migration 139: local disposable SQL, real concurrency, preservation and restore.
Usage: python3 tests/final-admin-deletion-db.py account139_run_NAME
Only the existing network-isolated test container and synthetic templates.
"""
import hashlib
import json
import os
import re
import select
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'socrates-admin-card135-recovery-20261020'
DATABASE = sys.argv[1] if len(sys.argv) == 2 else ''
assert re.fullmatch(r'account139_run_[a-z0-9]+', DATABASE)
info = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER]))[0]
assert info['HostConfig']['NetworkMode'] == 'none' and not info['NetworkSettings']['Ports']
A, B, L = [f'b1390000-0000-4000-8000-{n:012d}' for n in range(1, 4)]
COUNT = "select count(*) from public.user_roles r join public.account_deletion_state s on s.user_id=r.user_id where r.role='admin' and s.state='active'"


def command(db=DATABASE):
    return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-h', '/tmp',
            '-U', 'supabase_admin', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']


def run(statement, db=DATABASE, error=None):
    p = subprocess.run(command(db), input=statement, text=True, capture_output=True, timeout=60)
    assert (p.returncode and error in p.stderr) if error else p.returncode == 0, p.stderr
    return p


def create(db, template):
    # No overwrite/drop path: an existing database name fails closed.
    run(f'create database {db} owner postgres template {template}', 'postgres')


SNAPSHOT = """create function pg_temp.snapshot139() returns jsonb language plpgsql as $$
declare t record;v jsonb;r jsonb:='{}';begin
 for t in select schemaname,tablename from pg_tables where schemaname in('public','auth','storage') order by 1,2 loop
 execute format('select jsonb_build_object(''count'',count(*),''sha'',md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]'')::text)) from %I.%I x',t.schemaname,t.tablename) into v;
 r:=r||jsonb_build_object(t.schemaname||'.'||t.tablename,v);end loop;return r;end$$;select pg_temp.snapshot139();"""


def snapshot(db):
    return json.loads(run(SNAPSHOT, db).stdout)


def begin(uid, salt='first'):
    return f"select public.begin_account_deletion('{uid}','{hashlib.sha256((uid+salt).encode()).hexdigest()}');"


def reset():
    # Reset only this runner's three disposable identities between race cases.
    # The Auth BEFORE INSERT trigger creates deletion state before uniqueness
    # checks, so never use INSERT ON CONFLICT against existing Auth identities.
    run(f"""delete from public.account_deletion_state where user_id in('{A}','{B}','{L}') and not exists(select 1 from auth.users where id=user_id);
    insert into auth.users(id,email) select id::uuid,email from (values('{A}','a139-race@example.invalid'),('{B}','b139-race@example.invalid'),('{L}','l139-race@example.invalid')) v(id,email) where not exists(select 1 from auth.users where auth.users.id=v.id::uuid);
    update public.account_deletion_state set state='active',receipt_hash=null,requested_at=null,completed_at=null,objects='[]',object_hashes='{{}}',purge_xid=null where user_id in('{A}','{B}','{L}');
    insert into public.user_roles(user_id,role) values('{A}','admin'),('{B}','admin'),('{L}','learner') on conflict(user_id) do update set role=excluded.role;""")


assert run('select count(*) from auth.users', 'role_management138_contract').stdout.strip() == '0'
create(DATABASE, 'role_management138_contract')
run(f"insert into auth.users(id,email) values('{A}','a139-race@example.invalid');insert into public.user_roles(user_id,role) values('{A}','admin');")
assert run('begin;'+begin(A)+COUNT+';rollback;').stdout.strip() == '0'
print('Baseline final-Administrator gap reproduced; rolled back', flush=True)
before = snapshot(DATABASE)
migration = (ROOT/'supabase/139_final_admin_account_deletion.sql').read_text()
verifier = (ROOT/'supabase/verify_139_final_admin_account_deletion.sql').read_text()
verify138 = (ROOT/'supabase/verify_138_role_management_safeguards.sql').read_text()
run('set role postgres;'+migration+verify138+verifier)
assert snapshot(DATABASE) == before
print('Migration 139 installed; every existing table unchanged; 138 and 139 contracts PASS', flush=True)
# Remove only the synthetic baseline fixture via a rolled-back setup transaction
# around the contract cases, so the sole-Admin cases have exactly one Admin.
sql = (ROOT/'tests/final-admin-deletion.sql').read_text()
sql = sql.replace('begin;', f"begin;update public.user_roles set role='learner' where user_id='{A}';", 1)
r = run(sql)
print('Focused SQL assertions:', r.stderr.count('NOTICE:'), 'PASS; rolled back', flush=True)

# Verify the strict installed verifier detects every boundary weakening.
body = verifier.replace('begin read only;', '').replace('commit;', '')
for label, alteration in [
    ('private execute grant', 'grant execute on function account_deletion_private.prepare_account_deletion(uuid,text) to service_role;'),
    ('schema exposure', 'grant usage on schema account_deletion_private to authenticated;'),
    ('public live grant', 'grant execute on function public.begin_account_deletion(uuid,text) to public;'),
    ('invoker boundary', 'alter function account_deletion_private.prepare_account_deletion(uuid,text) security definer;'),
    ('missing lock trigger', 'alter table auth.users disable trigger a139_account_delete_lock;'),
    ('missing existing cleanup', 'alter table auth.users disable trigger a127_delete_account;'),
]:
    # Any failed test transaction rolls back on connection close.
    result = subprocess.run(command(), input='begin;'+alteration+body+'rollback;', text=True, capture_output=True)
    assert result.returncode and '139:' in result.stderr, (label, result.stderr)
    print('Verifier negative control PASS:', label, flush=True)
run(verifier)
# SET SESSION AUTHORIZATION models a genuine ordinary login, not just a role
# assumed by an otherwise-superuser test connection.
for role in ['anon', 'authenticated', 'service_role']:
    run(f'set session authorization {role};set role postgres;', error='42501')
print('Ordinary credentials cannot assume recovery database owner PASS', flush=True)


class Session:
    def __init__(self, name, isolation='read committed'):
        self.p = subprocess.Popen(command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        self.buffer = b''
        self.ready(f"begin isolation level {isolation};set local application_name='{name}';set local statement_timeout='12s';select count(*) from public.user_roles;")

    def send(self, sql):
        self.p.stdin.write((sql+'\n').encode()); self.p.stdin.flush()

    def ready(self, sql):
        self.send(sql+'\n\\echo READY')
        deadline = time.monotonic()+15
        while time.monotonic() < deadline:
            if select.select([self.p.stdout], [], [], .2)[0]:
                chunk = os.read(self.p.stdout.fileno(), 65536)
                self.buffer += chunk
                if b'READY\n' in self.buffer:
                    self.buffer = b''
                    return
                if not chunk:
                    break
        raise AssertionError('Session failed: '+self.p.stderr.read().decode())

    def finish(self, sql='commit;', error=None):
        if sql:
            self.send(sql)
        _, err = self.p.communicate(timeout=15)
        assert (self.p.returncode and error in err.decode()) if error else self.p.returncode == 0, err.decode()


def assignment(actor, target_email, role):
    return f"select set_config('request.jwt.claim.sub','{actor}',true);set local role authenticated;select public.set_user_role_by_email('{target_email}','{role}');"


def race(label, first, second, error, expected, setup='', isolation='read committed'):
    reset()
    if setup:
        run(setup)
    a, b = Session('m139_first'), Session('m139_second', isolation)
    try:
        a.ready(first)
        b.send(second+'commit;')
        for _ in range(50):
            if run("select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='m139_second' and wait_event_type='Lock')").stdout.strip() == 't':
                break
            time.sleep(.05)
        else:
            raise AssertionError('Competing operation did not wait for serialization')
        a.finish()
        b.finish('', error)
        assert int(run(COUNT).stdout) == expected
        print('Concurrency PASS:', label, flush=True)
    finally:
        for s in [a, b]:
            if s.p.poll() is None:
                s.p.kill(); s.p.communicate()


race('simultaneous Administrator deletions leave one active Admin', begin(A), begin(B), 'P1391', 1)
race('stale snapshot cannot count an already pending Admin', begin(A), begin(B), '40001', 1, isolation='repeatable read')
race('demotion wins before last-Admin deletion, which is denied', assignment(A, 'b139-race@example.invalid', 'learner'), begin(A), 'P1391', 1)
race('deletion wins before demotion of the pending account, which is denied', begin(A), assignment(B, 'a139-race@example.invalid', 'learner'), '42501', 1)
race('pending actor cannot demote the remaining Admin', begin(A), assignment(A, 'b139-race@example.invalid', 'learner'), '42501', 1)
race('receipt retries serialize and preserve pending cleanup', begin(A, 'one'), begin(A, 'two'), None, 1)
race('Auth purge locks before concurrent role writer', f"delete from auth.users where id='{A}';", assignment(B, 'l139-race@example.invalid', 'learner'), None, 1, setup=begin(A))
race('role writer locks before Auth purge', assignment(B, 'l139-race@example.invalid', 'learner'), f"delete from auth.users where id='{A}';", None, 1, setup=begin(A))
race('receipt retry locks before final Auth purge', begin(A, 'retry'), f"delete from auth.users where id='{A}';", None, 1, setup=begin(A))
race('completed Auth purge prevents a new receipt', f"delete from auth.users where id='{A}';", begin(A, 'retry'), 'P0001', 1, setup=begin(A))
accepted = f"update public.account_deletion_state set state='pending',requested_at=now(),receipt_hash=md5(user_id::text)||md5(user_id::text) where user_id in('{A}','{B}');"
race('accepted historical deletions can both finish without deadlock or resurrection', f"delete from auth.users where id='{A}';", f"delete from auth.users where id='{B}';", None, 0, setup=accepted)

# Rich synthetic preservation fixture: no real Production rows are used.
rich = DATABASE+'_preservation'
create(rich, 'role_management138_run_verified')
before = snapshot(rich)
functions = "select jsonb_object_agg(oid::regprocedure::text,jsonb_build_array(pg_get_functiondef(oid),proacl::text,proowner)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname<>'begin_account_deletion'"
policies = "select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p"
prior_functions, prior_policies = run(functions, rich).stdout, run(policies, rich).stdout
run('set role postgres;'+migration+verify138+verifier, rich)
assert snapshot(rich) == before
assert run(functions, rich).stdout == prior_functions
assert run(policies, rich).stdout == prior_policies
print('Rich installation preservation PASS:', len(before), 'table fingerprints; all unrelated functions and RLS identical', flush=True)
account = (ROOT/'tests/account-deletion.sql').read_text().replace("current_database() not like 'account127_%'", f"current_database() <> '{rich}'")
account = account.replace('begin;', "begin;insert into storage.buckets(id,name,public) values('socrates-profile-photos','socrates-profile-photos',false),('socrates-content-media','socrates-content-media',false) on conflict(id) do nothing;", 1)
result = run(account, rich)
assert snapshot(rich) == before
print('Existing account-deletion preservation suite:', result.stderr.count('NOTICE:'), 'PASS; rolled back', flush=True)

# Genuine custom-format dump and restoration preserve all rows, including
# accepted pending receipts. Recovery replay runs separately against this copy.
source = DATABASE+'_recovery_source'
restored = DATABASE+'_restored'
create(source, 'role_management138_run_verified')
run(f"""update public.user_roles r set role='learner' where role='admin' and exists(select 1 from public.account_deletion_state s where s.user_id=r.user_id and s.state='active');
insert into auth.users(id,email) values('{A}','older139-admin@example.invalid'),('{L}','older139-learner@example.invalid');
insert into public.user_roles(user_id,role) values('{A}','admin'),('{L}','learner');
insert into public.user_libraries(user_id,library_id) select '{A}',id from public.libraries where status='active' order by id limit 1;
select set_config('request.jwt.claim.sub','{A}',false);
insert into public.concepts(id,name,created_by,status) values('b1390000-0000-4000-8000-000000000010','Preserved recovery Concept','{A}','published');
insert into public.concept_placements(concept_id,library_node_id,sort_order) select 'b1390000-0000-4000-8000-000000000010',id,9100 from public.library_nodes order by id limit 1;
insert into public.questions(id,concept_id,question_type,prompt,explanation,status,created_by) values('b1390000-0000-4000-8000-000000000020','b1390000-0000-4000-8000-000000000010','short_answer','Preserved recovery Question','Preserved answer','draft','{A}');
""", source)
old_before = snapshot(source)
captured_at = datetime.now(timezone.utc).isoformat()
dump = subprocess.check_output(['docker', 'exec', CONTAINER, 'pg_dump', '-h', '/tmp', '-U', 'supabase_admin', '-d', source, '-Fc', '--no-publications', '--no-subscriptions'])
run(f'create database {restored} owner postgres', 'postgres')
p = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'pg_restore', '-h', '/tmp', '-U', 'supabase_admin', '-d', restored, '--exit-on-error'], input=dump, capture_output=True)
assert p.returncode == 0, p.stderr.decode()
assert snapshot(restored) == old_before
run('set role postgres;'+migration+verify138+verifier, restored)
assert snapshot(restored) == old_before
print('Older synthetic backup restored and verified:', len(old_before), 'table fingerprints; SHA256', hashlib.sha256(dump).hexdigest(), flush=True)
post_restored = DATABASE+'_restored139'
captured139_at = datetime.now(timezone.utc).isoformat()
dump139 = subprocess.check_output(['docker', 'exec', CONTAINER, 'pg_dump', '-h', '/tmp', '-U', 'supabase_admin', '-d', restored, '-Fc', '--no-publications', '--no-subscriptions'])
run(f'create database {post_restored} owner postgres', 'postgres')
p = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'pg_restore', '-h', '/tmp', '-U', 'supabase_admin', '-d', post_restored, '--exit-on-error'], input=dump139, capture_output=True)
assert p.returncode == 0, p.stderr.decode()
assert snapshot(post_restored) == old_before
run(verify138+verifier, post_restored)
print('Post-139 dump/restore preserves private ACL, invoker boundary, triggers and all data; SHA256', hashlib.sha256(dump139).hexdigest(), flush=True)
archives = {}
for name, data, captured in [('before139', dump, captured_at), ('after139', dump139, captured139_at)]:
    path = ROOT.parent / (DATABASE+'-'+name+'.dump')
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as handle:
        handle.write(data)
    archives[name] = {'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'createdAt': captured}
proof = {'synthetic': True, 'database': DATABASE, 'archives': archives, 'restoredTableFingerprints': old_before}
with os.fdopen(os.open(ROOT.parent/(DATABASE+'-recovery-checkpoints.json'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
    json.dump(proof, handle, indent=2)
print(json.dumps({'database': DATABASE, 'restored': restored, 'postMigrationRestore': post_restored, 'legacyRecovery': source, 'concurrencyCases': 11, 'preservedTables': len(before), 'productionAccess': False}), flush=True)
