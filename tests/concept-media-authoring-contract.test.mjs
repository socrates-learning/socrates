import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = source('supabase/114_concept_media_authoring.sql');
const body = name => sql.slice(sql.indexOf(`create function public.${name}(`)).split('end $$;')[0];
test('114 is additive with one private operational draft table and no personal history or foundation replacement', () => {
  assert.deepEqual([...sql.matchAll(/create table ([\w.]+)/g)].map(x => x[1]), ['public.concept_media_drafts']);
  assert.doesNotMatch(sql, /create or replace|alter table public\.(?:media_|content_media)|create (?:or replace )?function public\.(?:m112_|m113_|save_concept_)/i);
  const table = sql.slice(sql.indexOf('create table'), sql.indexOf('create index'));
  assert.doesNotMatch(table, /body_markdown|caption|alt_text|filename|signed_url|bytea/);
  assert.match(sql, /revoke all on public.concept_media_drafts from public,anon,authenticated,service_role/);
  assert.match(sql, /enable row level security/);
  assert.match(table, /interval '23 hours'/);
});
test('atomic first save uses draft-create then exactly one existing versioned prerequisite save', () => {
  const save = body('m114_save');
  assert.match(save, /actor uuid:=auth.uid\(\)/);
  assert.match(save, /where id=p_draft for update/);
  assert.equal((save.match(/public.save_concept_draft\(/g) || []).length, 1);
  assert.equal((save.match(/public.save_concept_with_prerequisites\(/g) || []).length, 1);
  assert.ok(save.indexOf('public.save_concept_draft(null') < save.indexOf('insert into public.content_media_placements'));
  assert.ok(save.indexOf('insert into public.content_media_placements') < save.indexOf('public.save_concept_with_prerequisites'));
  assert.ok(save.indexOf('public.save_concept_with_prerequisites') < save.indexOf("set state='consumed'"));
  assert.match(save, /count\(\*\) from public.concept_versions where concept_id=target\)<>1/);
  assert.doesNotMatch(save, /exception when|commit;/);
});
test('save validates full token order, exact Library and reservation intent, ready assets and existing version CAS', () => {
  const save = body('m114_save');
  for (const fragment of ['ids is distinct from manifest_ids', "a.scope<>'official'", "a.state<>'ready'", 'c.current_version_id is distinct from p_expected_version', 'op.target_id<>d.id', 'op.target_id<>p_concept', 'actor_id=actor', 'save_digest is distinct from digest']) assert.ok(save.includes(fragment), fragment);
  assert.match(body('m114_receipt'), /'terminal',true/);
  assert.match(body('m114_receipt'), /media_version_references/);
  assert.match(body('m114_close_operations'), /media_upload_sessions set expires_at/);
  assert.doesNotMatch(body('m114_close_operations'), /delete from|unreferenced_since/);
});
test('draft uploads use single-use staging/promotion, exact author intent and terminal asset state', () => {
  const upload = body('m114_upload');
  for (const fragment of ['m114_author(p_actor,p_library)', "op.target_kind='concept-draft'", 'd.author_id is distinct from p_actor', 'claim_token is distinct from p_token', "'dispatch-stage'", "'stage-verified'", "'dispatch-promotion'", "'publish'", "a.state in ('deleting','deleted')"]) assert.ok(upload.includes(fragment), fragment);
  assert.ok(upload.indexOf("p_action='publish' and t.operation_type='promotion'") < upload.indexOf('insert into public.media_assets'));
  assert.doesNotMatch(upload, /m113_upload\(/);
});
test('verifier pins frozen foundation bodies and authority instead of merely counting functions', () => {
  const verifier = source('supabase/verify_114_concept_media_authoring.sql');
  assert.match(verifier, /md5\(pg_get_functiondef/);
  assert.match(verifier, /pg_get_userbyid\(p.proowner\)/);
  assert.match(verifier, /p.proacl::text/);
  assert.match(verifier, /Frozen foundation changed/);
  assert.match(verifier, /m112_reference_guard/); assert.match(verifier, /m113_upload/);
  assert.match(verifier, /has_function_privilege\('authenticated'/);
});
