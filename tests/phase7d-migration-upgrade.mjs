// Disposable localhost only. Reconstruct 083, seed schema-1/2/3 snapshots,
// apply 084, compare all older rows and every unrelated public function, rollback.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const database=process.env.PHASE7D_TEST_DATABASE_URL;
if(!database || !['localhost','127.0.0.1','[::1]'].includes(new URL(database).hostname)) throw new Error('Explicit disposable localhost database required');
const prior=readFileSync(new URL('../supabase/083_question_related_concepts.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/084_question_additional_testing_angles.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const snapshot=prior.slice(prior.indexOf('create or replace function public.append_question_version_snapshot('),prior.indexOf('create or replace function public.save_question_with_relationships('));
const save=prior.slice(prior.indexOf('create or replace function public.save_question_with_relationships('),prior.indexOf('-- Preserve the exact existing 14-argument API'));
const browse=prior.slice(prior.indexOf('create function public.get_creator_questions'),prior.indexOf('revoke all on function public.get_creator_questions')).replace('create function','create or replace function');
const sql=`begin;
${snapshot}
${save}
${browse}
drop trigger remove_primary_from_additional_testing_angles on public.questions;
drop function public.remove_primary_from_additional_testing_angles();
drop table public.question_additional_testing_angles;
drop function public.check_question_additional_testing_angle();
drop function public.save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[]);
alter table public.question_versions drop column additional_testing_angles_snapshot;
create temporary table f as select gen_random_uuid() editor,gen_random_uuid() concept;
insert into auth.users(id) select editor from f;
insert into public.user_roles(user_id,role) select editor,'editor' from f;
insert into public.concepts(id,name,created_by) select concept,'Upgrade',editor from f;
select set_config('request.jwt.claim.sub',editor::text,true) from f;
${snapshot.replace('    3,','    1,')}
select public.save_question_with_version(null,concept,'short_answer','Schema 1',null,'published',null,0,'medium','General Understanding','[{"answer_text":"Answer"}]',null,null,'{}') from f;
${snapshot.replace('    3,','    2,')}
select public.save_question_with_version(null,concept,'short_answer','Schema 2',null,'published',null,0,'medium','General Understanding','[{"answer_text":"Answer"}]',null,null,'{}') from f;
${snapshot}
select public.save_question_with_version(null,concept,'short_answer','Scalar '||g,null,'published',null,0,'medium','General Understanding','[{"answer_text":"Answer"}]',null,null,'{}') from f cross join generate_series(1,60) g;
create temporary table questions_before as select to_jsonb(q) content from public.questions q;
create temporary table versions_before as select to_jsonb(v) content from public.question_versions v;
create temporary table functions_before as select oid,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('append_question_version_snapshot','save_question_with_relationships','get_creator_questions');
${migration}
do $$ begin
 if exists((select content from questions_before) except (select to_jsonb(q) from public.questions q)) then raise exception 'Question rows changed'; end if;
 if exists((select content from versions_before) except (select to_jsonb(v)-'additional_testing_angles_snapshot' from public.question_versions v)) then raise exception 'Historical versions changed'; end if;
 if exists(select 1 from public.question_versions where additional_testing_angles_snapshot is not null) then raise exception 'Historical Additional metadata fabricated'; end if;
 if exists(select 1 from public.question_additional_testing_angles) then raise exception 'Unexpected backfill'; end if;
 if exists(select 1 from functions_before where pg_get_functiondef(oid)<>definition) then raise exception 'Unrelated function changed'; end if;
 if (select count(distinct snapshot_schema_version) from public.question_versions)<>3 then raise exception 'Missing older schema fixtures'; end if;
 raise notice 'PASS 6/6: scalar rows, historical schema-1/2/3 snapshots, null unrecorded metadata, zero backfill, ALL unrelated public function definitions, three historical schemas';
end $$;
rollback;`;
const result=spawnSync('psql',[database,'-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
