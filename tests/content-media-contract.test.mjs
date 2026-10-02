import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/112_content_media_foundation.sql', import.meta.url), 'utf8');
test('media foundation is additive and leaves all existing saves and rendering untouched', () => {
 assert.doesNotMatch(sql, /create or replace function|alter table public\.(concepts|questions|personal_cards)\b/i);
 assert.doesNotMatch(sql, /insert into storage\.(buckets|objects)|delete from storage\.objects/i);
 assert.match(sql, /as restrictive for all to anon,authenticated/);
});
test('foundation fixes file limits but not a permanent image-count limit', () => {
 for (const limit of ['3145728','4096','12000000','frame_count=1']) assert.ok(sql.includes(limit));
 assert.match(sql, /ordinal integer not null check\(ordinal>=0\)/);
 assert.doesNotMatch(sql, /ordinal\s*[<]|image\/svg|image\/gif/);
});
test('version snapshots are append-only and current media must match a fresh version', () => {
 assert.match(sql, /before insert or update or delete on public.media_version_references/);
 assert.match(sql, /Historical versions cannot acquire new media/);
 assert.match(sql, /Current media and immutable version snapshot differ/);
 assert.match(sql, /deferrable initially deferred/);
});
test('orphan deletion shares reference locks and preserves historical and draft references', () => {
 assert.match(sql, /where id=new.asset_id for update/);
 assert.match(sql, /where id=p_asset for update/);
 for (const table of ['content_media_placements','media_version_references','media_draft_leases','media_upload_sessions']) assert.match(sql, new RegExp(`exists\\(select 1 from public\\.${table}`));
 assert.match(sql, /interval '24 hours'/);
 assert.match(sql, /Storage API deletion not confirmed/);
});

test('personal bindings fail closed without inventing personal content history', () => {
 assert.match(sql, /Personal reservations are supported; personal attachment\/history is not approved\.[\s\S]*?return false;/);
 assert.doesNotMatch(sql, /create table public\.personal_.*version/);
});
test('permanent deletion closes media references only through parent version deletion', () => {
 assert.match(sql, /concept_version_id uuid references public\.concept_versions\(id\) on delete cascade/);
 assert.match(sql, /question_version_id uuid references public\.question_versions\(id\) on delete cascade/);
 assert.match(sql, /not exists\(select 1 from public\.concept_versions where id=old.concept_version_id\)/);
 assert.match(sql, /not exists\(select 1 from public\.question_versions where id=old.question_version_id\)/);
 assert.match(sql, /Existing parent-version deletion guards remain authoritative and unchanged/);
});
