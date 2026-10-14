"""Disposable-only concurrency proof; no credentials or Production connection."""
import json
import hashlib
import os
import subprocess
import time
import uuid

database = os.environ.get('ACCOUNT_DELETION_TEST_DATABASE', 'account127_install')
if not database.startswith('account127_'):
    raise SystemExit('Disposable account127 database required')
command = ['docker', 'exec', '-i', 'socrates-creator-navy-uat-db', 'psql', '-U', 'postgres', '-d', database, '-XAt', '-v', 'ON_ERROR_STOP=1']


def sql(statement):
    return subprocess.check_output(command, input=statement, text=True).strip()


class Session:
    def __init__(self, name):
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.send("set application_name='" + name + "';")
        self.name = name

    def send(self, statement):
        self.process.stdin.write(statement + '\n')
        self.process.stdin.flush()

    def ready(self, statement):
        self.send(statement + "; select 'READY';")
        while True:
            line = self.process.stdout.readline()
            if line.strip() == 'READY':
                return
            if not line:
                raise AssertionError('SQL session failed before checkpoint: ' + self.process.stderr.read())

    def finish(self, statement='', rejected=False):
        if statement:
            self.send(statement)
        self.process.stdin.close()
        self.process.wait(timeout=20)
        error = self.process.stderr.read()
        if rejected:
            assert self.process.returncode != 0 and ('Account is being deleted' in error or 'could not serialize access' in error), error
        else:
            assert self.process.returncode == 0, error


passed = 0


def check(ok, label):
    global passed
    assert ok, label
    passed += 1
    print('PASS:', label, flush=True)


def waiting(session):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql("select count(*) from pg_stat_activity where application_name='" + session.name + "' and wait_event_type='Lock'") == '1':
            return True
        time.sleep(.1)
    return False


question = sql("select id from public.questions order by id limit 1")
accounts = []


def actor():
    user = str(uuid.uuid4())
    accounts.append(user)
    sql(f"insert into auth.users(id,email) values('{user}','concurrency-{user}@example.invalid');")
    return user


def begin(user, hash_character='b'):
    digest = hashlib.sha256((user + hash_character).encode()).hexdigest()
    return f"select public.begin_account_deletion('{user}','{digest}')"


def write(user):
    return f"insert into public.personal_question_notes(user_id,question_id,note) values('{user}','{question}','In-flight personal note')"


try:
    owner = actor()
    writer = Session('account127-writer-first')
    writer.ready('begin; ' + write(owner))
    deletion = Session('account127-deletion-waiting')
    deletion.send(begin(owner) + ';')
    check(waiting(deletion), 'deletion waits for a prior personal write to commit')
    writer.finish('commit;')
    deletion.finish()
    check(sql(f"select state from public.account_deletion_state where user_id='{owner}'") == 'pending', 'deletion fences the committed writer')
    sql(f"delete from auth.users where id='{owner}';")
    check(sql(f"select count(*) from public.personal_question_notes where user_id='{owner}'") == '0', 'in-flight committed data is included in cleanup')

    owner = actor()
    deletion = Session('account127-deletion-first')
    deletion.ready('begin; ' + begin(owner))
    writer = Session('account127-writer-waiting')
    writer.send(write(owner) + ';')
    check(waiting(writer), 'a later write waits behind the deletion barrier')
    deletion.finish('commit;')
    writer.finish(rejected=True)
    check(sql(f"select count(*) from public.personal_question_notes where user_id='{owner}'") == '0', 'later write is rejected without a residual row')

    for destination in ['personal note', 'profile image']:
        owner = actor()
        writer = Session('account127-stale-snapshot')
        writer.ready(f"begin isolation level repeatable read; select state from public.account_deletion_state where user_id='{owner}'")
        sql(begin(owner) + ';')
        statement = write(owner) if destination == 'personal note' else f"insert into storage.objects(bucket_id,name) values('socrates-profile-photos','{owner}/avatar')"
        writer.finish(statement + '; commit;', rejected=True)
        check(True, f'a stale REPEATABLE READ snapshot cannot recreate a {destination}')

    owner = actor()
    first = Session('account127-confirmation-first')
    first.ready('begin; ' + begin(owner, 'c'))
    second = Session('account127-confirmation-second')
    second.send(begin(owner, 'd') + ';')
    check(waiting(second), 'duplicate confirmations serialize on the same account')
    first.finish('commit;')
    second.finish()
    digest = hashlib.sha256((owner + 'd').encode()).hexdigest()
    check(sql(f"select state='pending' and receipt_hash='{digest}' from public.account_deletion_state where user_id='{owner}'") == 't', 'latest verified retry replaces only the restricted receipt')
finally:
    for owner in accounts:
        if sql(f"select count(*) from auth.users where id='{owner}'") == '1':
            sql(begin(owner) + f"; delete from auth.users where id='{owner}';")
print(json.dumps({'passed': passed, 'failed': 0, 'disposableOnly': True}))
