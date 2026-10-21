"""Local-only Migration 138 reproduction, preservation and concurrency checks.
Usage: python3 tests/role-management-db.py role_management138_run_NAME
Uses the existing network-isolated synthetic schema, never a hosted connection.
"""
import json
import os
import re
import select
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'socrates-admin-card135-recovery-20261020'
TEMPLATE = 'legacy_personal137_verified'
DATABASE = sys.argv[1] if len(sys.argv) == 2 else ''
assert re.fullmatch(r'role_management138_run_[a-z0-9]+', DATABASE)
info = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER]))[0]
assert info['HostConfig']['NetworkMode'] == 'none' and not info['NetworkSettings']['Ports']

def command(db):
    return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-h', '/tmp',
            '-U', 'supabase_admin', '-d', db, '-v', 'ON_ERROR_STOP=1']

def run(sql, db=DATABASE):
    result = subprocess.run(command(db), input=sql, text=True, capture_output=True)
    if result.returncode:
        print(result.stdout)
        print(result.stderr)
        raise AssertionError('Isolated SQL check failed')
    return result

assert run('select (select count(*) from auth.users)+(select count(*) from public.user_roles)', TEMPLATE).stdout.strip() == '0'
run(f'create database {DATABASE} template {TEMPLATE}', 'postgres')
fixture = (ROOT/'tests/learner-card-movement.sql').read_text().split('set local role authenticated;')[0]
fixture = fixture.replace("current_database() <> 'learner_card_movement_search'", f"current_database() <> '{DATABASE}'")
setup = r'''
select pg_temp.sign_in(null);
insert into fixtures(role_name,owner_id) values('admin2',gen_random_uuid()),('pending2',gen_random_uuid());
insert into auth.users(id,email,created_at) select owner_id,'role138-'||owner_id||'@example.invalid',now() from fixtures where role_name in('admin2','pending2');
insert into public.user_roles(user_id,role) select owner_id,'admin' from fixtures where role_name='admin2';
insert into public.approved_domains(domain,default_role) values('role138.example.invalid','editor'),('admin138.example.invalid','admin');
update public.account_deletion_state set state='pending',receipt_hash=repeat('8',64),requested_at=now() where user_id=(select owner_id from fixtures where role_name='inactive_admin');
create function pg_temp.email(id uuid) returns text language sql security definer set search_path='' as $$select email::text from auth.users where id=$1$$;
-- These are negative baseline proofs, not changes to the approved source.
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
set local role authenticated;
select pg_temp.reject(format('select public.set_user_role_by_email(%L,''learner'')',pg_temp.email((select owner_id from fixtures where role_name='learner'))),'42703','Baseline assignment reproduces missing updated_at column');
select pg_temp.sign_in((select owner_id from fixtures where role_name='inactive_admin'));
select pg_temp.ok((select count(*) from public.list_users_with_roles())>0,'Baseline inactive Admin read gap reproduced');
reset role;
select pg_temp.sign_in(null);
create function pg_temp.snapshot() returns jsonb language plpgsql as $$
declare t record;v jsonb;r jsonb:='{}';begin
 for t in select schemaname,tablename from pg_tables where schemaname in('public','private','auth','storage') order by 1,2 loop
  execute format('select jsonb_build_object(''count'',count(*),''hash'',md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]'')::text)) from %I.%I x',t.schemaname,t.tablename) into v;
  r:=r||jsonb_build_object(t.schemaname||'.'||t.tablename,v);
 end loop;return r;end$$;
create temp table before138 as select pg_temp.snapshot() data,
 (select jsonb_agg(to_jsonb(d)-'default_role' order by id) from public.approved_domains d) domains,
 (select jsonb_agg(jsonb_build_array(oid::regprocedure::text,pg_get_functiondef(oid),proacl::text,proowner) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in('list_users_with_roles','set_user_role_by_email','provision_invited_learner')) functions,
 (select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p where polrelid in(select oid from pg_class where relnamespace='public'::regnamespace)) policies;
commit;
'''
preservation = r'''
begin;
select pg_temp.ok(md5(replace(pg_get_functiondef('public.provision_invited_learner(text)'::regprocedure), E'  perform public.m138_require_active_admin();\n',''))='443044cee4682a698af717ba39d3b02c','Provisioning body is byte-identical except the single authorization gate');
select pg_temp.ok(data-'public.approved_domains'=pg_temp.snapshot()-'public.approved_domains','Every existing account, role, Library, educational, learning, media and private record is byte-identical after installation') from before138;
select pg_temp.ok(domains=(select jsonb_agg(to_jsonb(d)-'default_role' order by id) from public.approved_domains d),'Dormant domain identities and other fields unchanged') from before138;
select pg_temp.ok(not exists(select 1 from public.approved_domains where default_role<>'learner'),'Dormant domain defaults cannot grant staff roles');
select pg_temp.ok(functions=(select jsonb_agg(jsonb_build_array(oid::regprocedure::text,pg_get_functiondef(oid),proacl::text,proowner) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in('list_users_with_roles','set_user_role_by_email','provision_invited_learner','m138_reject_new_editor','m138_require_active_admin')),'Unrelated functions including Editor authoring and account recovery unchanged') from before138;
select pg_temp.ok(policies=(select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p where polrelid in(select oid from pg_class where relnamespace='public'::regnamespace)),'All existing RLS policies unchanged') from before138;
\o
select jsonb_build_object('installationPreservation',true,'tables',jsonb_object_length(data),'baselineChecks',(select jsonb_agg(label order by label) from checks)) from before138;
\o /dev/null
commit;
'''.replace('jsonb_object_length(data)', '(select count(*) from jsonb_object_keys(data))')
sql = fixture+setup+(ROOT/'supabase/138_role_management_safeguards.sql').read_text()+(ROOT/'supabase/verify_138_role_management_safeguards.sql').read_text()+preservation+(ROOT/'tests/role-management.sql').read_text()
result = run(sql)
print(result.stdout)
print(result.stderr)
print('Migration 138 baseline reproduction and isolated checks PASS')

# Independent psql sessions exercise real transaction locks, not mocked calls.
identities = json.loads(run("""select jsonb_object_agg(kind,jsonb_build_object('id',id,'email',email)) from (
 select 'a' kind,u.id,u.email from auth.users u join public.user_roles r on r.user_id=u.id
 join public.account_deletion_state s on s.user_id=u.id
 where r.role='admin' and s.state='active' and email like 'zz-card135-%'
 union all select 'b',u.id,u.email from auth.users u join public.user_roles r on r.user_id=u.id where r.role='admin' and email like 'role138-%'
 union all (select 'c',u.id,u.email from auth.users u join public.user_roles r on r.user_id=u.id where r.role='learner' order by u.id limit 1)
) x;""").stdout)
assert set(identities) == {'a', 'b', 'c'}
quote = lambda s: "'"+s.replace("'", "''")+"'"

def session(name, isolation='read committed'):
    p = subprocess.Popen(command(DATABASE)+['-v', 'VERBOSITY=verbose'], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    p.stdin.write(f"begin isolation level {isolation}; set local application_name={quote(name)}; select count(*) from public.user_roles;\n\\echo SNAPSHOT\n")
    p.stdin.flush()
    ready(p, 'SNAPSHOT')
    return p

def ready(p, marker):
    deadline = time.monotonic()+10
    while time.monotonic()<deadline:
        if select.select([p.stdout], [], [], 1)[0]:
            p.ready_output = getattr(p, 'ready_output', '') + os.read(p.stdout.fileno(), 65536).decode()
            if marker in p.ready_output.splitlines():
                p.ready_output = ''
                return
        if p.poll() is not None:
            raise AssertionError(p.stderr.read())
    p.kill()
    raise AssertionError('Isolated session did not reach its synchronization point')

def assignment(actor, target, role):
    action = (f"select * from public.provision_invited_learner({quote(identities[target]['email'])});"
              if role == 'provision' else f"select public.set_user_role_by_email({quote(identities[target]['email'])},{quote(role)});")
    return (f"select set_config('request.jwt.claim.sub',{quote(identities[actor]['id'])},true);"
            f"set local role authenticated;{action}")

def reset_roles():
    run('update public.user_roles set role=case when user_id in('+','.join(quote(identities[k]['id']) for k in ['a','b'])+") then 'admin' else 'learner' end where user_id in("+','.join(quote(v['id']) for v in identities.values())+');')

def race(label, first, second, expected_error, expected_roles, isolation='read committed'):
    reset_roles()
    a = session('m138_first')
    b = session('m138_second', isolation)
    try:
        a.stdin.write(assignment(*first)+'\n\\echo LOCKED\n')
        a.stdin.flush()
        ready(a, 'LOCKED')
        b.stdin.write(assignment(*second)+'commit;\n')
        b.stdin.flush()
        waiting = False
        for _ in range(40):
            if run("select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='m138_second' and wait_event_type='Lock')").stdout.strip() == 't':
                waiting = True
                break
            time.sleep(.05)
        assert waiting, 'Second assignment must block behind the first transaction'
        a.stdin.write('commit;\n')
        a.stdin.flush()
        _, err_a = a.communicate(timeout=10)
        _, err_b = b.communicate(timeout=10)
        assert a.returncode == 0, err_a
        if expected_error:
            assert b.returncode != 0 and expected_error in err_b, err_b
        else:
            assert b.returncode == 0, err_b
        actual = json.loads(run('select jsonb_object_agg(user_id,role) from public.user_roles where user_id in('+','.join(quote(v['id']) for v in identities.values())+');').stdout)
        assert {k: actual[v['id']] for k,v in identities.items()} == expected_roles
        assert int(run("select count(*) from public.user_roles r join public.account_deletion_state s on s.user_id=r.user_id where r.role='admin' and s.state='active'").stdout) >= 1
        print('Concurrency PASS:', label)
    finally:
        for p in [a,b]:
            if p.poll() is None:
                p.kill()
                p.communicate()
        reset_roles()

race('reciprocal demotion preserves the remaining active Admin', ('a','b','learner'), ('b','a','learner'), '42501', {'a':'admin','b':'learner','c':'learner'})
race('demoted queued actor cannot promote a replacement', ('a','b','learner'), ('b','c','admin'), '42501', {'a':'admin','b':'learner','c':'learner'})
race('stale repeatable-read actor cannot retain old authority', ('a','b','learner'), ('b','a','learner'), '40001', {'a':'admin','b':'learner','c':'learner'}, 'repeatable read')
race('promotion followed by authorized demotion remains valid', ('a','c','admin'), ('b','a','learner'), None, {'a':'learner','b':'admin','c':'admin'})
race('simultaneous assignments retain the same account identity', ('a','c','admin'), ('b','c','learner'), None, {'a':'admin','b':'admin','c':'learner'})
race('demoted queued actor cannot approve a Learner through provisioning', ('a','b','learner'), ('b','c','provision'), '42501', {'a':'admin','b':'learner','c':'learner'})

# Reproduce the exact provisioning wait condition: the invited Auth row is
# busy. Once approval has checked its actor, demotion must wait for that entire
# transaction, not slip between the check and the role/membership insertion.
pending = json.loads(run("select jsonb_build_object('id',id,'email',email) from auth.users u where email like 'role138-%' and not exists(select 1 from public.user_roles r where r.user_id=u.id)").stdout)
run("insert into public.learner_account_defaults(singleton,default_library_id) select true,id from public.libraries where status='active' order by id limit 1")
holder = session('m138_invitee_blocker')
approver = session('m138_approval_inflight')
demoter = session('m138_demote_approver')

def wait_lock(name):
    for _ in range(40):
        if run(f"select exists(select 1 from pg_stat_activity where application_name={quote(name)} and datname=current_database() and wait_event_type='Lock')").stdout.strip() == 't':
            return
        time.sleep(.05)
    raise AssertionError('Expected transaction lock: '+name)

try:
    holder.stdin.write(f"select id from auth.users where id={quote(pending['id'])} for update;\n\\echo LOCKED\n")
    holder.stdin.flush()
    ready(holder, 'LOCKED')
    approver.stdin.write(f"select set_config('request.jwt.claim.sub',{quote(identities['b']['id'])},true);set local role authenticated;select * from public.provision_invited_learner({quote(pending['email'])});commit;\n")
    approver.stdin.flush()
    wait_lock('m138_approval_inflight')
    demoter.stdin.write(assignment('a','b','learner')+'commit;\n')
    demoter.stdin.flush()
    wait_lock('m138_demote_approver')
    assert run(f"select role from public.user_roles where user_id={quote(identities['b']['id'])}").stdout.strip() == 'admin'
    holder.communicate('rollback;\n', timeout=10)
    _, approval_error = approver.communicate(timeout=10)
    _, demotion_error = demoter.communicate(timeout=10)
    assert approver.returncode == 0, approval_error
    assert demoter.returncode == 0, demotion_error
    assert run(f"select count(*) from public.user_roles r join public.user_libraries l on l.user_id=r.user_id where r.user_id={quote(pending['id'])} and r.role='learner' and l.is_primary").stdout.strip() == '1'
    print('Concurrency PASS: in-flight Learner approval finishes under retained Admin authority before demotion')
finally:
    for p in [holder, approver, demoter]:
        if p.poll() is None:
            p.kill()
            p.communicate()
    run(f"delete from public.user_libraries where user_id={quote(pending['id'])};delete from public.user_roles where user_id={quote(pending['id'])};delete from public.learner_account_defaults;")
    reset_roles()

# Existing account deletion is not redesigned by role-management Phase 1.
account = (ROOT/'tests/account-deletion.sql').read_text().replace("current_database() not like 'account127_%'",f"current_database() <> '{DATABASE}'")
account = account.replace('begin;', "begin;\ninsert into storage.buckets(id,name,public) values('socrates-profile-photos','socrates-profile-photos',false),('socrates-content-media','socrates-content-media',false) on conflict(id) do nothing;", 1)
account_result = run(account)
print('Existing account-deletion checks:', account_result.stderr.count('NOTICE:  PASS:'), 'PASS; rolled back')

# A genuine dump/restore includes the legacy Editor row. PostgreSQL restores
# data before post-data triggers, preserving history without a runtime bypass.
snapshot_sql = """create function pg_temp.snapshot() returns jsonb language plpgsql as $$
declare t record;v text;r jsonb:='{}';begin
 for t in select schemaname,tablename from pg_tables where schemaname in('public','private','auth','storage') order by 1,2 loop
 execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]'')::text) from %I.%I x',t.schemaname,t.tablename) into v;
 r:=r||jsonb_build_object(t.schemaname||'.'||t.tablename,v);end loop;return r;end$$;select pg_temp.snapshot();"""
before = json.loads(run(snapshot_sql).stdout)
dump = subprocess.check_output(['docker','exec',CONTAINER,'pg_dump','-h','/tmp','-U','supabase_admin','-d',DATABASE,'-Fc','--no-publications','--no-subscriptions'])
restored = DATABASE+'_recovery'
run(f'create database {restored} owner postgres', 'postgres')
restore = subprocess.run(['docker','exec','-i',CONTAINER,'pg_restore','-h','/tmp','-U','supabase_admin','-d',restored,'--exit-on-error'],input=dump,capture_output=True)
assert restore.returncode == 0, restore.stderr.decode()
assert json.loads(run(snapshot_sql, restored).stdout) == before
run((ROOT/'supabase/verify_138_role_management_safeguards.sql').read_text(), restored)
assert run("select count(*) from public.user_roles where role='editor'", restored).stdout.strip() == '1'
print(f'Recovery PASS: {len(before)} complete table fingerprints and historical Editor role preserved; installed contract passes')
assert run('select (select count(*) from auth.users)+(select count(*) from public.user_roles)', TEMPLATE).stdout.strip() == '0'
print('Original synthetic template preserved; Production never accessed')

for label, tamper in [
    ('missing Editor guard', 'alter table public.user_roles disable trigger b138_no_new_editor;'),
    ('browser role writes', 'grant insert on public.user_roles to authenticated;'),
    ('exposed internal gate', 'grant execute on function public.m138_require_active_admin() to authenticated;'),
    ('privileged domain defaults', 'alter table public.approved_domains drop constraint approved_domains_learner_only;'),
    ('inactive Admin read bypass', "create or replace function public.list_users_with_roles() returns table(user_id uuid,email text,role text,created_at timestamptz) language plpgsql security definer set search_path='' as $$begin return query select u.id,u.email::text,r.role,r.created_at from auth.users u left join public.user_roles r on r.user_id=u.id;end$$;"),
]:
    rejected = subprocess.run(command(DATABASE), input='begin;'+tamper+(ROOT/'supabase/verify_138_role_management_safeguards.sql').read_text(), text=True, capture_output=True)
    assert rejected.returncode != 0 and '138:' in rejected.stderr, label
    run((ROOT/'supabase/verify_138_role_management_safeguards.sql').read_text())
    print('Verifier negative check PASS:', label, '(tamper rolled back)')
