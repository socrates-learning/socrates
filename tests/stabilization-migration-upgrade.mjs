// Reconstruct the 085 contract in a disposable local database, apply 086,
// prove preservation of existing rows/functions/ACLs, then roll everything back.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const database = process.env.STABILIZATION_TEST_DATABASE_URL;
if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) {
  throw new Error('STABILIZATION_TEST_DATABASE_URL must identify disposable localhost data');
}
const migration = readFileSync(new URL('../supabase/086_study_response_idempotency.sql', import.meta.url), 'utf8')
  .replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
const sql = `begin;
drop function if exists public.record_study_session_attempt(uuid,uuid,uuid,text,uuid);
drop function if exists public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid);
drop table if exists public.study_response_submissions;
alter table public.review_attempts drop column if exists submission_id;
alter table public.personal_review_attempts drop column if exists submission_id;
create temporary table before_functions as select oid,pg_get_functiondef(oid) definition,proacl from pg_proc where pronamespace='public'::regnamespace and prokind='f';
create temporary table before_rows(table_name text, content jsonb);
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('insert into before_rows select %L,to_jsonb(t) from public.%I t',t.tablename,t.tablename);
 end loop;
end $$;
${migration}
do $$ declare t record; changed boolean; begin
 if exists(select 1 from before_functions b join pg_proc p on p.oid=b.oid where pg_get_functiondef(b.oid)<>b.definition or p.proacl is distinct from b.proacl) then raise exception 'Existing function/ACL changed'; end if;
 for t in select distinct table_name from before_rows loop
  execute format('select exists((select content from before_rows where table_name=%L) except all (select %s from public.%I x)) or exists((select %s from public.%I x) except all (select content from before_rows where table_name=%L))',
   t.table_name,case when t.table_name in ('review_attempts','personal_review_attempts') then 'to_jsonb(x)-''submission_id''' else 'to_jsonb(x)' end,t.table_name,
   case when t.table_name in ('review_attempts','personal_review_attempts') then 'to_jsonb(x)-''submission_id''' else 'to_jsonb(x)' end,t.table_name,t.table_name) into changed;
  if changed then raise exception 'Existing rows changed in %',t.table_name; end if;
 end loop;
 if exists(select 1 from public.study_response_submissions) then raise exception 'Unexpected backfill'; end if;
 if exists(select 1 from public.review_attempts where submission_id is not null) or exists(select 1 from public.personal_review_attempts where submission_id is not null) then raise exception 'Historical identities fabricated'; end if;
 if not (select relrowsecurity from pg_class where oid='public.study_response_submissions'::regclass) then raise exception 'Ledger RLS missing'; end if;
 if has_table_privilege('authenticated','public.study_response_submissions','SELECT') or has_table_privilege('authenticated','public.study_response_submissions','INSERT') then raise exception 'Ledger client access'; end if;
 if not has_function_privilege('authenticated','public.record_study_session_attempt(uuid,uuid,uuid,text,uuid)','EXECUTE') or not has_function_privilege('authenticated','public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)','EXECUTE') then raise exception 'New RPC grant missing'; end if;
 raise notice 'PASS 7/7: existing function definitions and ACLs, ALL existing public rows, empty ledger, null historical keys, RLS, private ledger grants, authenticated keyed RPC grants';
end $$;
rollback;`;
const result = spawnSync('psql', [database, '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
assert.equal(result.status, 0);
