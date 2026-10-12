// Explicit opt-in: only a disposable loopback Supabase instance is permitted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const config = Object.fromEntries(readFileSync(process.env.PROFILE_DISPOSABLE_ENV, 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const base = config.NEXT_PUBLIC_SUPABASE_URL;
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const accounts = JSON.parse(readFileSync(process.env.PROFILE_DISPOSABLE_ACCOUNTS, 'utf8'));
let passed = 0;
function check(value, label) { assert.ok(value, label); passed++; console.log('PASS:', label); }
function client() { return createClient(base, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); }
async function login(account) {
  assert.match(account.email, /@example\.invalid$/);
  const api = client(); const { data, error } = await api.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(error, null, 'Disposable sign-in must succeed'); assert.equal(data.user.id, account.id); return api;
}
const first = await login(accounts.other), second = await login(accounts.healthy), anonymous = client();
const bucket = 'socrates-profile-photos', own = `${accounts.other.id}/avatar`, foreign = `${accounts.healthy.id}/avatar`;
const photo = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#173556' } }).png().toBuffer();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function downloaded(api, path) { const result = await api.storage.from(bucket).download(path); return { error: result.error, bytes: result.data && Buffer.from(await result.data.arrayBuffer()) }; }
try {
  check(!(await first.storage.from(bucket).upload(own, photo, { contentType: 'image/png', upsert: true })).error, 'owner upload persisted');
  check(digest((await downloaded(first, own)).bytes) === digest(photo), 'fresh owner download matches persisted bytes');
  check(Boolean((await downloaded(second, own)).error), 'second account cannot download first photo');
  check(Boolean((await downloaded(anonymous, own)).error), 'anonymous cannot download private photo');
  check(Boolean((await second.storage.from(bucket).upload(own, photo, { contentType: 'image/png', upsert: true })).error), 'cross-owner replacement rejected');
  await second.storage.from(bucket).remove([own]);
  check(digest((await downloaded(first, own)).bytes) === digest(photo), 'cross-owner removal has no effect');
  check(Boolean((await first.storage.from(bucket).upload(foreign, photo, { contentType: 'image/png' })).error), 'cross-owner creation rejected');
  check(Boolean((await first.storage.from(bucket).upload(`${accounts.other.id}/extra`, photo, { contentType: 'image/png' })).error), 'extra storage keys rejected');
  check(Boolean((await first.storage.from(bucket).upload(own, '<svg/>', { contentType: 'image/svg+xml', upsert: true })).error), 'unsupported MIME rejected by bucket');
  check(Boolean((await first.storage.from(bucket).upload(own, Buffer.alloc(3145729), { contentType: 'image/png', upsert: true })).error), 'oversized upload rejected by bucket');
  const publicUrl = first.storage.from(bucket).getPublicUrl(own).data.publicUrl;
  check(!(await fetch(publicUrl)).ok, 'public image endpoint cannot expose private photo');
  const replacement = await sharp(photo).webp().toBuffer();
  check(!(await first.storage.from(bucket).upload(own, replacement, { contentType: 'image/webp', upsert: true })).error, 'owner replacement succeeds');
  const fresh = await login(accounts.other);
  check(digest((await downloaded(fresh, own)).bytes) === digest(replacement), 'new sign-in reads replacement bytes');
  check(!(await first.storage.from(bucket).remove([own])).error, 'owner removal succeeds');
  check(Boolean((await downloaded(fresh, own)).error), 'removed photo is absent in independent client');
  await fresh.auth.signOut({ scope: 'local' });
} finally {
  await first.storage.from(bucket).remove([own]);
  await first.auth.signOut({ scope: 'local' }); await second.auth.signOut({ scope: 'local' });
}
console.log(JSON.stringify({ passed, failed: 0, disposableOnly: true }));
