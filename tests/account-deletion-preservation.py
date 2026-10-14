"""Verify older contracts with exact deletion-only additions projected away.

Original 122 fingerprints and 125 ownership assertions are never regenerated.
The 127 verifier first requires every new restrictive fence and private ACL.
No function, policy, or data is modified by this read-only runner.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess

root = Path(__file__).resolve().parents[1]
database = os.environ.get('ACCOUNT_DELETION_TEST_DATABASE', 'account127_final')
assert database.startswith('account127_'), 'Disposable database required'
command = ['docker', 'exec', '-i', 'socrates-creator-navy-uat-db', 'psql', '-U', 'postgres', '-d', database, '-XAt', '-v', 'ON_ERROR_STOP=1']


def run(source):
    return subprocess.check_output(command, input=source, text=True)


def literal(value):
    return "'" + value.replace("'", "''") + "'"


run((root / 'supabase/verify_127_account_deletion.sql').read_text())
migration = (root / 'supabase/127_account_deletion.sql').read_text()
blocks = re.findall(r'\$body\$(.*?)\$body\$', migration, re.S)
assert len(blocks) == 4, 'Review any new source changes before widening exceptions'
timestamp, attribution, asset_delete, empty_siblings = blocks
additions = {name: timestamp for name in ['set_wiki_updated_at', 'set_question_bank_updated_at', 'set_sources_updated_at']}
additions.update({name: attribution for name in ['prevent_content_version_mutation', 'prevent_article_version_mutation']})
additions['m112_asset_guard'] = attribution + asset_delete
additions['normalize_topic_siblings_after_write'] = empty_siblings
projections = {name: (text, '') for name, text in additions.items()}
projections.update({name: ('select public.account_is_active() and exists (', 'select exists (') for name in ['has_socrates_role', 'is_admin', 'is_editor_or_admin']})
original = (root / 'supabase/verify_122_shared_official_topic_placements.sql').read_text()
contracts = {row['signature']: row for row in json.loads(original.split('$contracts$')[1])}
definitions = json.loads(run("select jsonb_object_agg(proname,pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname in (" + ','.join(literal(n) for n in projections) + ');').strip())
cases = []
for name, (addition, replacement) in projections.items():
    current = definitions[name]
    assert current.count(addition) == 1, 'Unexpected deletion hunk: ' + name
    projected = current.replace(addition, replacement)
    assert hashlib.md5(projected.encode()).hexdigest() == contracts[name + '()']['md5'], 'Original function fingerprint mismatch: ' + name
    cases.append('when ' + literal(name) + ' then replace(pg_get_functiondef(p.oid),' + literal(addition) + ',' + literal(replacement) + ')')
expression = 'case p.proname ' + ' '.join(cases) + ' else pg_get_functiondef(p.oid) end'
assert original.count('md5(pg_get_functiondef(p.oid)) hash') == 1
projected_122 = original.replace('md5(pg_get_functiondef(p.oid)) hash', 'md5(' + expression + ') hash')
run(projected_122)
print('PASS: all 250 original function fingerprints/authority contracts, with ten exact deletion-only additions projected')
for number in [123, 124, 125, 126]:
    files = list((root / 'supabase').glob(f'verify_{number}_*.sql'))
    assert len(files) == 1
    source = files[0].read_text()
    if number == 125:
        exact = "(select count(*) from pg_policy where polrelid='public.personal_question_notes'::regclass)<>1"
        assert source.count(exact) == 1
        source = source.replace(exact, "(select count(*) from pg_policy where polrelid='public.personal_question_notes'::regclass and polname<>'account_deletion_fence')<>1")
    run(source)
    print(f'PASS: Migration {number} installed contracts' + ('; only the separately verified restrictive deletion policy excluded from original count' if number == 125 else ''))
print('PASS: Migration 127 installed ownership, receipt and lifecycle contracts')
