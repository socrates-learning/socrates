-- Included by role-management-db.py after its synthetic fixture and migration.
begin;
set local search_path=public,pg_catalog;
truncate checks;
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
set local role authenticated;
select pg_temp.ok((select count(*) from public.list_users_with_roles())=(select count(*) from fixtures),'Active Admin lists all synthetic accounts');
select pg_temp.ok(exists(select 1 from public.list_users_with_roles() where role='editor'),'Historical Editor is reported without conversion');
select pg_temp.reject(format('select public.set_user_role_by_email(%L,''learner'')',pg_temp.email((select owner_id from fixtures where role_name='admin'))),'42501','Existing self-role-change prohibition retained');
select pg_temp.reject('select public.set_user_role_by_email(''missing@example.invalid'',''admin'')','P0002','Unknown identity is not created');
select pg_temp.reject('select public.set_user_role_by_email(null,''admin'')','22023','Null email rejected');
select pg_temp.reject('select public.set_user_role_by_email(''  '',''learner'')','22023','Blank email rejected');
select pg_temp.reject(format('select public.set_user_role_by_email(%L,null)',pg_temp.email((select owner_id from fixtures where role_name='learner'))),'22023','Null role rejected');
do $$declare r text;begin
 foreach r in array array['editor','Editor','unknown','admin ',''] loop
  perform pg_temp.reject(format('select public.set_user_role_by_email(%L,%L)',pg_temp.email((select owner_id from fixtures where role_name='learner')),r),'22023','RPC rejects new role value: '||r);
 end loop;
end$$;
select pg_temp.reject(format('select public.set_user_role_by_email(%L,''learner'')',pg_temp.email((select owner_id from fixtures where role_name='inactive_admin'))),'42501','Pending account target write fence retained');

-- Successful assignment and no-op retain the existing role-row identity/date.
reset role;
create temp table assigned_before as select to_jsonb(r)-'role' data from public.user_roles r where user_id=(select owner_id from fixtures where role_name='learner');
grant select on assigned_before to authenticated;
set local role authenticated;
select public.set_user_role_by_email('  '||upper(pg_temp.email((select owner_id from fixtures where role_name='learner')))||'  ','admin');
select pg_temp.ok(exists(select 1 from public.list_users_with_roles() where user_id=(select owner_id from fixtures where role_name='learner') and role='admin'),'Active Admin assignment works without missing-column error');
select public.set_user_role_by_email(pg_temp.email((select owner_id from fixtures where role_name='learner')),'learner');
select public.set_user_role_by_email(pg_temp.email((select owner_id from fixtures where role_name='learner')),'learner');
reset role;
select pg_temp.ok(data=(select to_jsonb(r)-'role' from public.user_roles r where user_id=(select owner_id from fixtures where role_name='learner')),'Assignment and no-op preserve role row ID and creation date') from assigned_before;
savepoint legacy;
set local role authenticated;
select public.set_user_role_by_email(pg_temp.email((select owner_id from fixtures where role_name='editor')),'learner');
select pg_temp.ok(exists(select 1 from public.list_users_with_roles() where user_id=(select owner_id from fixtures where role_name='editor') and role='learner'),'Explicit authorized legacy reassignment is allowed');
rollback to legacy;

-- Browser ACLs are unchanged. Claims cannot grant a role that is not in SQL.
set local role authenticated;
select pg_temp.reject(format('insert into public.user_roles(user_id,role) values(%L,''admin'')',(select owner_id from fixtures where role_name='pending2')),'42501','Browser cannot insert roles directly');
select pg_temp.reject('update public.user_roles set role=''admin''','42501','Browser cannot update roles directly');
select pg_temp.reject('delete from public.user_roles','42501','Browser cannot delete roles directly');
do $$declare r record;begin
 for r in select * from fixtures where role_name in('editor','learner','inactive_admin','unapproved') loop
  perform pg_temp.sign_in(r.owner_id);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',r.owner_id,'role','admin')::text,true);
  perform pg_temp.reject(format('select public.set_user_role_by_email(%L,''admin'')',pg_temp.email((select owner_id from fixtures where role_name='pending2'))),'42501',r.role_name||' role assignment denied even with forged role claim');
  perform pg_temp.reject('select * from public.list_users_with_roles()','42501',r.role_name||' User Management read denied');
  perform pg_temp.reject(format('select * from public.provision_invited_learner(%L)',pg_temp.email((select owner_id from fixtures where role_name='pending2'))),'42501',r.role_name||' pending Learner approval denied');
 end loop;
end$$;
select pg_temp.sign_in(null);
set local role anon;
select pg_temp.reject('select public.set_user_role_by_email(''nobody@example.invalid'',''admin'')','42501','Anonymous assignment denied');
select pg_temp.reject('select * from public.list_users_with_roles()','42501','Anonymous User Management read denied');
reset role;
grant select on fixtures to service_role;
grant select,insert on checks to service_role;
set local role service_role;
select pg_temp.reject('select public.set_user_role_by_email(''nobody@example.invalid'',''admin'')','42501','Service key without active Administrator cannot assign roles through RPC');
select pg_temp.reject('select * from public.list_users_with_roles()','42501','Service key without active Administrator cannot list users through RPC');
select pg_temp.reject(format('insert into public.user_roles(user_id,role) values(%L,''editor'')',(select owner_id from fixtures where role_name='pending2')),'42501','Privileged direct INSERT cannot create Editor');
select pg_temp.reject(format('update public.user_roles set role=''editor'' where user_id=%L',(select owner_id from fixtures where role_name='learner')),'42501','Privileged direct UPDATE cannot assign Editor');
select pg_temp.reject(format('update public.user_roles set user_id=%L where role=''editor''',(select owner_id from fixtures where role_name='pending2')),'42501','Legacy Editor row cannot be transferred to another identity');
update public.user_roles set role=role where role='editor';
select pg_temp.ok(exists(select 1 from public.user_roles where role='editor'),'Existing Editor row remains writable without new assignment');
reset role;
select pg_temp.reject(format('insert into public.user_roles(user_id,role) values(%L,''editor'')',(select owner_id from fixtures where role_name='pending2')),'42501','Trusted SQL writers also cannot create new Editor assignments');
select pg_temp.reject('insert into public.approved_domains(domain,default_role) values(''bad.example.invalid'',''admin'')','23514','Domain cannot grant Administrator by explicit value');
select pg_temp.reject('insert into public.approved_domains(domain,default_role) values(''bad.example.invalid'',''editor'')','23514','Domain cannot grant Editor by explicit value');
select pg_temp.reject('update public.approved_domains set default_role=''editor''','23514','Domain cannot regain Editor default');
insert into public.approved_domains(domain) values('learner138.example.invalid');
select pg_temp.ok((select default_role='learner' from public.approved_domains where domain='learner138.example.invalid'),'New domain default is Learner');

-- No new provisioning or signup mechanism: existing explicit Learner approval.
insert into public.learner_account_defaults(singleton,default_library_id) values(true,(select id from libraries where kind='allowed'));
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
set local role authenticated;
select pg_temp.ok((select role='learner' and library_id=(select id from libraries where kind='allowed') and is_primary from public.provision_invited_learner(pg_temp.email((select owner_id from fixtures where role_name='unapproved')))),'Existing Learner provisioning and default Library membership preserved');
select pg_temp.reject(format('select * from public.provision_invited_learner(%L)',pg_temp.email((select owner_id from fixtures where role_name='editor'))),'P0001','Learner provisioning cannot downgrade a legacy staff account');
select public.set_user_role_by_email(pg_temp.email((select owner_id from fixtures where role_name='pending2')),'admin');
reset role;
select pg_temp.ok(exists(select 1 from public.user_roles where user_id=(select owner_id from fixtures where role_name='pending2') and role='admin'),'Explicit authorized first role assignment preserved');
select pg_temp.ok(not exists(select 1 from public.user_libraries where user_id=(select owner_id from fixtures where role_name='pending2')),'Role assignment does not silently grant or change Library memberships');

-- Existing Library and historical owner protections remain authoritative.
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
set local role authenticated;
select pg_temp.ok(exists(select 1 from public.personal_cards where owner_id=(select owner_id from fixtures where role_name='learner')),'Existing learner Cards still readable');
select pg_temp.ok(not exists(select 1 from public.personal_cards where owner_id=(select owner_id from fixtures where role_name='other')),'Cross-account Card reads remain denied');
select pg_temp.reject(format('update public.personal_cards set personal_topic_id=null,library_id=%L,library_node_id=%L where id=%L',(select id from libraries where kind='foreign'),(select root_id from libraries where kind='foreign'),(select topic_card from fixtures where role_name='learner')),'42501','Cross-Library Card writes remain denied');
select pg_temp.sign_in((select owner_id from fixtures where role_name='editor'));
select pg_temp.ok(public.is_editor_or_admin() and not public.is_admin(),'Existing legacy Editor authority unchanged');
reset role;
select pg_temp.ok(data=pg_temp.protected_data(),'All protected educational content, selections, mastery and study history unchanged') from preservation;
\o
select jsonb_build_object('behaviorChecks',count(*),'checks',jsonb_agg(label order by label)) from checks;
\o /dev/null
rollback;
