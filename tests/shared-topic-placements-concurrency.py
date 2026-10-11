"""Local-only concurrent transaction proof; requires the synthetic 122 fixture.

Uses psql in an explicitly named local container. No hosted connection strings,
credentials, Auth mutations, external Python packages or Production defaults.
"""
import argparse
import json
import re
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("--container", required=True)
parser.add_argument("--database", required=True)
args = parser.parse_args()
assert re.fullmatch(r"socrates-[a-z0-9-]+", args.container)
assert re.fullmatch(r"shared122_[a-z0-9_]+", args.database)
command = ["docker", "exec", "-i", args.container, "psql", "-XqAt", "-U", "postgres",
           "-d", args.database, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]


def run(sql):
    return subprocess.run(command, input=sql, text=True, capture_output=True, timeout=20)


def read(sql):
    result = run(sql)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def identity(number):
    return f"12200000-0000-4000-8000-{number:012d}"


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


library = literal(identity(10))
deck = literal(identity(90))
admin = identity(1)
learner = identity(2)


def actor(user):
    if user is None:
        return ""
    return "select set_config('request.jwt.claim.sub'," + literal(user) + ",true);set local role authenticated;"


def graph_revision():
    return read(f"begin;{actor(admin)}select public.get_official_topic_graph({library})->>'revision';rollback;").splitlines()[-1]


def setting_revision():
    return read(f"begin;{actor(learner)}select public.get_home_study_bootstrap({library},{deck})#>>'{{unified_deck_settings,topic_preference_state,revision}}';rollback;").splitlines()[-1]


def add(topic, parent, revision):
    return f"perform public.add_official_topic_placement({library},{literal(identity(topic))},{literal(identity(parent))},null,{literal(revision)});"


def reset(topic, balance, revision):
    return f"perform public.set_study_deck_topic_subtree_preference({deck},{library},{literal('official:topic:'+identity(topic))},{balance},{literal(revision)});"


results = []


def source_state():
    # Exercise the installed selector projection, not a Python scoring model.
    sql = f"""begin;{actor(learner)}reset role;
create function pg_temp.source_state() returns jsonb language plpgsql as $$
declare body text; snapshot jsonb; result jsonb;begin
 select jsonb_build_object('selected_node_ids',h->'selected_node_ids','node_preferences',h->'node_preferences','unified_deck_settings',h->'unified_deck_settings') into snapshot from (select public.get_home_study_bootstrap({library},{deck}) h) q;
 body:=pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure);
 body:=substring(body from strpos(body,'  selected_node_ids as ('));
 body:=left(body,strpos(body,'  -- Keep the Library-wide Question pass narrow.')-1);
 body:=regexp_replace(body,',\\s*$','');
 body:=replace(body,'target_session.selection_snapshot',format('%L::jsonb',snapshot));
 body:=replace(body,'target_session.library_id',format('%L::uuid',{library}));
 execute 'with recursive eligible_concepts as (select * from public.resolve_study_deck('||quote_literal({deck})||')), '||body||' select jsonb_build_object(''balances'',(select jsonb_object_agg(concept_id,branch_balance) from concept_balances),''sources'',(select jsonb_agg(to_jsonb(x) order by concept_id,source_key,branch_balance) from most_specific_sources x))' into result;
 return result;
end $$;
select pg_temp.source_state();rollback;"""
    return json.loads(read(sql).splitlines()[-1])


def assert_provenance_matches_values():
    assert read(f"""select bool_and(shared_compatibility_source->>'version'='1'
 and shared_compatibility_source->>'source' like 'reset:'||reset_source||':official:topic:%'
 and jsonb_typeof(shared_compatibility_source->'ancestors')='array')
 from public.study_deck_node_preferences where deck_id={deck};""") == "t"


def race(label, user_a, operation_a, user_b, operation_b, error):
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True)
    first.stdin.write(f"begin;{actor(user_a)}do $$begin {operation_a} end$$;select 'HELD';select pg_sleep(0.7);commit;\n")
    first.stdin.close()
    while True:
        line = first.stdout.readline()
        if line.strip() == "HELD":
            break
        if not line:
            raise AssertionError(first.stderr.read())
    started = time.monotonic()
    second = run(f"begin;{actor(user_b)}do $$begin {operation_b} end$$;commit;")
    first.wait(timeout=15)
    first_error = first.stderr.read()
    assert first.returncode == 0, first_error
    assert second.returncode != 0 and error in second.stderr, (label, second.stderr)
    results.append({"check": label, "passed": True, "rejected_sqlstate": error,
                    "wait_seconds": round(time.monotonic()-started, 3)})


assert read("select count(*)>0 and bool_and(email like 'zz-shared122-%@example.invalid') from auth.users;") == "t"
assert read("select to_regclass('public.official_topic_placements') is not null;") == "t"
assert read("select count(*) from public.official_topic_placements;") == "0", "Fresh isolated fixture required"
# Establish unequal independent sources before the first structural race.
setup = run(f"begin;{actor(learner)}select public.set_study_deck_node_selection({deck},{literal(identity(21))},true);select public.set_study_deck_node_selection({deck},{literal(identity(24))},true);commit;")
assert setup.returncode == 0, setup.stderr
for topic, value in [(21, 60), (24, 80)]:
    setup = run(f"begin;{actor(learner)}do $$begin {reset(topic,value,setting_revision())} end$$;commit;")
    assert setup.returncode == 0, setup.stderr
before_sharing = source_state()
assert before_sharing["balances"][identity(50)] == 70
revision = graph_revision()
race("opposite concurrent placements serialize", admin, add(24, 21, revision),
     admin, add(21, 24, revision), "PT409")
fresh = run(f"begin;{actor(admin)}do $$begin {add(21,24,graph_revision())} end$$;commit;")
assert fresh.returncode != 0 and "23514" in fresh.stderr
assert read("select count(*) from public.official_topic_placements;") == "1"
results.append({"check": "fresh retry of reverse edge rejects cycle", "passed": True})
assert source_state() == before_sharing
results.append({"check": "concurrent first sharing preserves 60/80 balances and contribution groups", "passed": True})

revision = setting_revision()
race("concurrent subtree adjustments reject stale writer", learner, reset(20, 60, revision),
     learner, reset(21, 20, revision), "40001")
assert read(f"select bool_and(new_mastery_balance=60) from public.study_deck_node_preferences where deck_id={deck};") == "t"
assert_provenance_matches_values()
results.append({"check": "no partial stale subtree reset, including provenance", "passed": True})
before_structure = source_state()

revision = setting_revision()
race("structural change precedes settings revision check", admin, add(23, 24, graph_revision()),
     learner, reset(20, 35, revision), "40001")
assert read(f"select bool_and(new_mastery_balance=60) from public.study_deck_node_preferences where deck_id={deck};") == "t"
assert source_state() == before_structure
results.append({"check": "structural/settings race preserves source-group contributions", "passed": True})
fresh = run(f"begin;{actor(learner)}do $$begin {reset(20,35,setting_revision())} end$$;commit;")
assert fresh.returncode == 0, fresh.stderr
assert read(f"select bool_and(new_mastery_balance=35) from public.study_deck_node_preferences where deck_id={deck};") == "t"
assert_provenance_matches_values()
results.append({"check": "fresh explicit adjustment wins atomically with matching provenance", "passed": True})

# A pinned snapshot cannot see another structural writer's committed edges.
# Direct database writes must reject that isolation level rather than permitting
# a graph check against a stale snapshot.
repeatable = run(f"begin isolation level repeatable read;insert into public.official_topic_placements(library_id,parent_node_id,topic_id,sort_order) values({library},{literal(identity(21))},{literal(identity(25))},99);commit;")
assert repeatable.returncode != 0 and "40001" in repeatable.stderr, repeatable.stderr
assert read(f"select count(*) from public.official_topic_placements where parent_node_id={literal(identity(21))} and topic_id={literal(identity(25))};") == "0"
results.append({"check": "direct repeatable-read structural write fails closed", "passed": True})

def impact_revision():
    return read(f"begin;{actor(admin)}select public.get_official_topic_delete_impact({library},{literal(identity(26))})->>'revision';rollback;").splitlines()[-1]


def delete_topic(revision):
    return f"perform public.delete_official_topic_with_impact({library},{literal(identity(26))},{literal(revision)});"


# Placements have writers outside the structural advisory-lock protocol. A
# concurrent attachment must either appear in a new warning or fail after the
# Topic is gone; it must never be silently removed by an old confirmation.
revision = impact_revision()
attach = f"insert into public.concept_placements(concept_id,library_node_id,sort_order) values({literal(identity(51))},{literal(identity(26))},0);"
race("concurrent attachment invalidates deletion impact", None, attach,
     admin, delete_topic(revision), "PT409")
assert read(f"select count(*) from public.concept_placements where concept_id={literal(identity(51))} and library_node_id={literal(identity(26))};") == "1"
revision = impact_revision()
late_attach = f"insert into public.concept_placements(concept_id,library_node_id,sort_order) values({literal(identity(50))},{literal(identity(26))},1);"
race("attachment after accepted deletion cannot disappear silently", admin,
     delete_topic(revision), None, late_attach, "23503")
assert read(f"select count(*) from public.concepts where id in ({literal(identity(50))},{literal(identity(51))});") == "2"

read(f"select public.m122_check_graph({library});")
print(json.dumps({"database": args.database, "production": False, "checks": results,
                  "passed": len(results)}, indent=2))
