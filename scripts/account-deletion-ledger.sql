-- Dedicated ledger project ONLY. This is not an application migration.
-- The installer must independently verify the target project and set
-- socrates.ledger_install_project before executing this transaction.
begin;
do $$ begin
  if coalesce(current_setting('socrates.ledger_install_project', true), '') !~ '^([a-z]{20}|disposable-[a-z0-9-]+)$'
     or current_setting('socrates.ledger_install_project') = 'ljmiourzsxwhegshtwee' then
    raise exception 'Dedicated ledger project required';
  end if;
  if exists(select 1 from pg_namespace where nspname in ('ledger_private', 'ledger_api')) then
    raise exception 'Ledger already exists; do not replace or reset it';
  end if;
end $$;

create role socrates_ledger_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role socrates_ledger_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role socrates_ledger_recovery nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role socrates_ledger_checkpoint nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant socrates_ledger_owner to postgres;
create schema ledger_private authorization socrates_ledger_owner;
create schema ledger_api authorization socrates_ledger_owner;
set local role socrates_ledger_owner;
revoke all on schema ledger_private, ledger_api from public, anon, authenticated, service_role;
alter default privileges in schema ledger_private revoke execute on functions from public;
alter default privileges in schema ledger_api revoke execute on functions from public;

create table ledger_private.instances (
  source text primary key check (source ~ '^[a-z0-9-]{3,64}$'),
  ledger uuid not null unique,
  writer name not null unique,
  recovery name not null unique,
  checkpoint name not null unique,
  check (writer <> recovery and writer <> checkpoint and recovery <> checkpoint)
);
create table ledger_private.records (
  source text not null references ledger_private.instances(source),
  account uuid not null,
  record text not null check (octet_length(record) <= 1024),
  record_hash text not null check (record_hash = encode(sha256(convert_to(record, 'UTF8')), 'hex')),
  primary key(source, account)
);
create table ledger_private.acknowledgements (
  source text not null,
  account uuid not null,
  receipt text not null check (octet_length(receipt) <= 2048),
  primary key(source, account),
  foreign key(source, account) references ledger_private.records(source, account)
);
alter table ledger_private.instances enable row level security;
alter table ledger_private.instances force row level security;
alter table ledger_private.records enable row level security;
alter table ledger_private.records force row level security;
alter table ledger_private.acknowledgements enable row level security;
alter table ledger_private.acknowledgements force row level security;
create policy owner_read on ledger_private.instances for select to socrates_ledger_owner using (true);
create policy owner_add on ledger_private.instances for insert to socrates_ledger_owner with check (true);
create policy owner_read on ledger_private.records for select to socrates_ledger_owner using (true);
create policy owner_add on ledger_private.records for insert to socrates_ledger_owner with check (true);
create policy owner_read on ledger_private.acknowledgements for select to socrates_ledger_owner using (true);
create policy owner_add on ledger_private.acknowledgements for insert to socrates_ledger_owner with check (true);

create function ledger_private.reject_change() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Append-only ledger: modification prohibited' using errcode='42501'; end $$;
create trigger immutable_record before update or delete or truncate on ledger_private.records for each statement execute function ledger_private.reject_change();
create trigger immutable_receipt before update or delete or truncate on ledger_private.acknowledgements for each statement execute function ledger_private.reject_change();
create trigger immutable_instance before update or delete or truncate on ledger_private.instances for each statement execute function ledger_private.reject_change();

create function ledger_private.context_source() returns text language plpgsql stable security definer set search_path='' as $$
declare s text;
begin
  -- session_user is the database-authenticated login. SET ROLE, request claims,
  -- and client-supplied source fields cannot impersonate another ledger source.
  select source into s from ledger_private.instances where session_user in (writer,recovery,checkpoint);
  if s is null then raise exception 'Ledger source unavailable' using errcode='42501'; end if;
  return s;
end $$;

create function ledger_api.ledger_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s text := ledger_private.context_source(); protected boolean;
begin
  select not exists (
    select 1 from pg_roles r
    where (r.rolname in ('socrates_ledger_writer','socrates_ledger_recovery','socrates_ledger_checkpoint','anon','authenticated','service_role')
      or r.rolname in (select writer from ledger_private.instances union select recovery from ledger_private.instances union select checkpoint from ledger_private.instances))
      and (has_table_privilege(r.oid,'ledger_private.records','INSERT,UPDATE,DELETE,TRUNCATE')
        or has_table_privilege(r.oid,'ledger_private.acknowledgements','INSERT,UPDATE,DELETE,TRUNCATE')
        or has_schema_privilege(r.oid,'ledger_private','CREATE') or r.rolsuper or r.rolcreaterole
        or pg_has_role(r.oid,'socrates_ledger_owner','MEMBER') or pg_has_role(r.oid,'postgres','MEMBER'))
  ) and not has_function_privilege('anon','ledger_api.append_record(text)','EXECUTE')
    and not has_function_privilege('authenticated','ledger_api.append_record(text)','EXECUTE')
    and not has_function_privilege('socrates_ledger_writer','ledger_api.acknowledge_checkpoint(uuid,text)','EXECUTE')
    and not has_function_privilege('socrates_ledger_recovery','ledger_api.append_record(text)','EXECUTE')
    and not has_function_privilege('socrates_ledger_checkpoint','ledger_api.append_record(text)','EXECUTE')
  into protected;
  return jsonb_build_object('version',1,'source',s,'ledger',(select ledger from ledger_private.instances where source=s),
    'appendOnly',protected,'count',(select count(*) from ledger_private.records where source=s),
    'digest',(select encode(sha256(convert_to(coalesce(string_agg(record_hash,'' order by account),''),'UTF8')),'hex') from ledger_private.records where source=s));
end $$;

create function ledger_api.append_record(p_record text) returns void language plpgsql security definer set search_path='' as $$
declare s text := ledger_private.context_source(); r jsonb; e jsonb; id uuid;
begin
  if octet_length(p_record)>1024 then raise exception 'Invalid ledger record'; end if;
  r:=p_record::jsonb; e:=r->'event'; id:=(e->>'account')::uuid;
  if (select array_agg(k order by k) from jsonb_object_keys(r) k) is distinct from array['event','signature']
     or (select array_agg(k order by k) from jsonb_object_keys(e) k) is distinct from array['account','confirmedAt','source','version']
     or e->>'source' is distinct from s or e->>'version' is distinct from '1' or id is null
     or coalesce(r->>'signature','') !~ '^[0-9a-f]{64}$'
     or e->>'confirmedAt' is null or (e->>'confirmedAt')::timestamptz > now()+interval '1 minute' then
    raise exception 'Invalid ledger record';
  end if;
  insert into ledger_private.records(source,account,record,record_hash)
  values(s,id,p_record,encode(sha256(convert_to(p_record,'UTF8')),'hex')) on conflict do nothing;
end $$;

create function ledger_api.read_record(p_account uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('record',r.record,'receipt',a.receipt)
    from ledger_private.records r left join ledger_private.acknowledgements a using(source,account)
    where r.source=ledger_private.context_source() and r.account=p_account
$$;
create function ledger_api.list_records(p_after uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(rows) order by account),'[]'::jsonb) from (
    select r.account,r.record,a.receipt from ledger_private.records r left join ledger_private.acknowledgements a using(source,account)
    where r.source=ledger_private.context_source() and (p_after is null or r.account>p_after) order by r.account limit 500
  ) rows
$$;
create function ledger_api.acknowledge_checkpoint(p_account uuid,p_receipt text) returns void language plpgsql security definer set search_path='' as $$
declare s text := ledger_private.context_source(); body jsonb; digest text;
begin
  if octet_length(p_receipt)>2048 then raise exception 'Invalid checkpoint receipt'; end if;
  body:=p_receipt::jsonb;
  select record_hash into digest from ledger_private.records where source=s and account=p_account;
  if digest is null or body->'receipt'->>'recordSha256' is distinct from digest
     or body->'receipt'->>'source' is distinct from s
     or body->'receipt'->>'account' is distinct from p_account::text
     or body->'receipt'->>'ledger' is distinct from (select ledger::text from ledger_private.instances where source=s)
     or coalesce(body->>'signature','') !~ '^[0-9a-f]{128}$' then raise exception 'Invalid checkpoint receipt'; end if;
  -- The application verifies the Ed25519 signature against its pinned external key.
  -- This role cannot manufacture a valid signature or replace a previous receipt.
  insert into ledger_private.acknowledgements(source,account,receipt) values(s,p_account,p_receipt) on conflict do nothing;
end $$;

revoke all on all tables in schema ledger_private from public,anon,authenticated,service_role,socrates_ledger_writer,socrates_ledger_recovery,socrates_ledger_checkpoint;
revoke all on all functions in schema ledger_private,ledger_api from public,anon,authenticated,service_role;
grant usage on schema ledger_api to socrates_ledger_writer,socrates_ledger_recovery,socrates_ledger_checkpoint;
grant execute on function ledger_api.ledger_status(), ledger_api.read_record(uuid) to socrates_ledger_writer,socrates_ledger_recovery,socrates_ledger_checkpoint;
grant execute on function ledger_api.append_record(text) to socrates_ledger_writer;
grant execute on function ledger_api.list_records(uuid) to socrates_ledger_recovery,socrates_ledger_checkpoint;
grant execute on function ledger_api.acknowledge_checkpoint(uuid,text) to socrates_ledger_checkpoint;
reset role;
revoke socrates_ledger_owner from postgres;
commit;
