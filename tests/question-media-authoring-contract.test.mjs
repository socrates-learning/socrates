import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const sql=read('supabase/115_question_media_authoring.sql');
test('115 adds exactly one private operational table without authored content/history or fixture rows',()=>{
 assert.deepEqual([...sql.matchAll(/create table public\.(\w+)/g)].map(m=>m[1]),['question_media_drafts']);
 const table=sql.slice(sql.indexOf('create table'),sql.indexOf('create index'));
 assert.doesNotMatch(table,/\b(prompt|answer_text|alt_text|caption|filename|object_name|testing_angle|tag_ids)\b/);
 assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public.question_media_drafts from public,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/create policy|insert into public\.(libraries|library_nodes|concepts)|Media disposable|Media root|media112-|ZZ GATE/);
 assert.equal((sql.match(/create or replace/g)||[]).length,0,'Frozen functions are not replaced');
});
test('atomic Question save installs both surfaces before exactly one delegated version boundary',()=>{
 const body=sql.slice(sql.indexOf('create function public.m115_save'),sql.indexOf('-- Computed field'));
 assert.equal((body.match(/public\.create_question\(/g)||[]).length,1);assert.equal((body.match(/public\.save_question_with_relationships_v2\(/g)||[]).length,1);
 assert.ok(body.indexOf('public.create_question(')<body.indexOf('insert into public.content_media_placements'));
 assert.ok(body.indexOf('insert into public.content_media_placements')<body.indexOf('public.save_question_with_relationships_v2('));
 assert.match(body,/current_version_id is distinct from p_expected_version/);assert.match(body,/Consumed draft payload differs/);assert.match(body,/return public.m115_receipt/);
 assert.match(body,/First save must create exactly one version/);assert.match(body,/array\['front','answer'\]/);
 assert.match(body,/op\.asset_id and actor_id=actor and expires_at>clock_timestamp/);
});
test('authoring reserves a real unbound draft; no fake saved Question, personal path or Storage URLs',()=>{
 const ui=read('components/creator/QuestionImageAuthoring.tsx');assert.match(ui,/questionId \|\| 'new'/);assert.match(ui,/crypto.randomUUID\(\)/);assert.match(ui,/questionMediaFingerprint/);
 assert.doesNotMatch(ui,/save_question_with_relationships|supabase|createSignedUrl|socrates-media:/);
 const parent=read('components/CreatorStudioV2Client.tsx');assert.match(parent,/questionSource === 'official' && creatorAuthority.canSaveQuestion/);
 assert.match(parent,/questionImages.guardActive && !isCurrentQuestionReadOnly && isQuestionDirty/);
 assert.match(parent,/questionImages\.reset\(\)/);
});
test('shared figure keeps bounded private digest verification without HTML or optimizer delivery',()=>{
 const renderer=read('components/VerifiedMediaImage.tsx');assert.match(renderer,/crypto.subtle.digest\('SHA-256'/);assert.match(renderer,/3 \* 1024 \* 1024/);assert.match(renderer,/unoptimized/);assert.match(renderer,/URL.revokeObjectURL/);assert.doesNotMatch(renderer,/dangerouslySetInnerHTML|createSignedUrl/);
 const service=read('lib/content-media/question-authoring.ts');assert.match(service,/normalizeImage/);assert.match(service,/require.resolve\('socrates-media-sharp'\)/);assert.doesNotMatch(service,/from 'sharp'|require\('socrates-media-sharp'\)/);
});
