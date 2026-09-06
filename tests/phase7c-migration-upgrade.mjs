// Local-only transactional upgrade test: reconstruct migration-082 authoring
// contracts, create 60 scalar/version-2 Questions, apply the complete new DDL,
// prove preservation, and roll everything back (including the reconstruction).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const database = process.env.PHASE7C_TEST_DATABASE_URL;
if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) {
  throw new Error('PHASE7C_TEST_DATABASE_URL must explicitly identify disposable localhost data');
}
const old = readFileSync(new URL('../supabase/052_shared_tag_catalog.sql', import.meta.url), 'utf8');
const snapshot = old.slice(old.indexOf('create or replace function public.append_question_version_snapshot('), old.indexOf('create or replace function public.save_concept_with_version('));
const save = old.slice(old.indexOf('create or replace function public.save_question_with_version('), old.indexOf('create or replace function public.save_article_draft('));
const migration = readFileSync(new URL('../supabase/083_question_related_concepts.sql', import.meta.url), 'utf8').replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
const sql = `begin;
${snapshot}
${save}
drop trigger keep_question_primary_concept on public.questions;
drop function public.keep_question_primary_concept();
drop table public.question_related_concepts;
drop function public.check_question_related_concept();
drop function public.get_creator_questions(uuid,uuid);
drop function public.save_question_with_relationships(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[]);
alter table public.question_versions drop column related_concepts_snapshot;
create temporary table upgrade_fixture as select ur.user_id, c.id concept_id
 from public.user_roles ur cross join public.concepts c where ur.role in ('editor','admin') limit 1;
do $$ declare f record; i integer; begin
 select * into strict f from upgrade_fixture;
 perform set_config('request.jwt.claim.sub', f.user_id::text, true);
 for i in 1..60 loop
   perform public.save_question_with_version(null,f.concept_id,'short_answer','Phase7C legacy upgrade '||i,null,'published',null,0,'medium','General Understanding','[{"answer_text":"Answer","sort_order":0}]',null,null,'{}');
 end loop;
end $$;
create temporary table upgrade_questions_before as select to_jsonb(q) content from public.questions q;
create temporary table upgrade_versions_before as select to_jsonb(v) content from public.question_versions v;
create temporary table upgrade_functions_before as select oid,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('resolve_study_deck','resolve_study_candidates','select_next_study_candidate','select_next_study_question','record_study_session_attempt','apply_user_concept_evidence','get_library_learner_progress');
${migration}
do $$ begin
 if exists ((select content from upgrade_questions_before) except (select to_jsonb(q) from public.questions q)) then raise exception 'Question rows changed'; end if;
 if exists ((select content from upgrade_versions_before) except (select to_jsonb(v)-'related_concepts_snapshot' from public.question_versions v)) then raise exception 'Historical versions changed'; end if;
 if exists(select 1 from public.question_versions where related_concepts_snapshot is not null) then raise exception 'Historical associations were fabricated'; end if;
 if (select count(*) from public.question_versions where prompt like 'Phase7C legacy upgrade %' and snapshot_schema_version=2) <> 60 then raise exception 'Scalar legacy fixtures invalid'; end if;
 if exists(select 1 from upgrade_functions_before where pg_get_functiondef(oid)<>definition) then raise exception 'Learning function definitions changed'; end if;
 raise notice 'PASS: 60 legacy scalar Questions preserved; historical schema-2 versions preserved; historical associations unrecorded; complete migration installs; all learning/progress function definitions unchanged';
end $$;
rollback;`;
const result = spawnSync('psql', [database, '-v', 'ON_ERROR_STOP=1'], { input:sql, encoding:'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exitCode = result.status ?? 1;
