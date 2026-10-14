// Node 24+. Explicit isolated Docker database only. No Production host support.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync, openSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createDeletionLedger, ledgerConfig } from '../lib/account-deletion-ledger.mjs';
import { reconcileDeletions } from '../lib/account-deletion-recovery.mjs';
import { continueDeletion } from '../lib/account-deletion.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const anonymousColumns = new Map([
  ['article_category_placements', ['created_by']], ['article_concepts', ['created_by']], ['article_sources', ['created_by']], ['article_tags', ['created_by']], ['article_versions', ['created_by']], ['articles', ['owner_id']],
  ['concept_aliases', ['created_by']], ['concept_distinctions', ['created_by']], ['concept_prerequisites', ['created_by', 'updated_by']], ['concept_relationships', ['created_by']], ['concept_tags', ['created_by']], ['concept_versions', ['created_by']], ['concepts', ['created_by']], ['content_source_notes', ['created_by']],
  ['learn_sections', ['created_by']], ['learning_objects', ['created_by']], ['library_group_libraries', ['created_by']], ['library_groups', ['created_by']], ['media_assets', ['created_by']],
  ['question_additional_testing_angles', ['created_by']], ['question_related_concepts', ['created_by']], ['question_sources', ['created_by']], ['question_tags', ['created_by']], ['question_versions', ['created_by']], ['questions', ['created_by']], ['sources', ['created_by']], ['tags', ['created_by']], ['testing_angle_vocabulary', ['created_by', 'updated_by']], ['user_libraries', ['assigned_by']],
]);

export function isolatedDatabase(env) {
  const container = env.ACCOUNT_RECOVERY_DB_CONTAINER, database = env.ACCOUNT_RECOVERY_DB_NAME;
  const url = new URL(env.ACCOUNT_RECOVERY_SUPABASE_URL);
  if (env.ACCOUNT_RECOVERY_DISPOSABLE !== '1' || !/^socrates-[a-z0-9-]+-uat-db$/.test(container || '') || !/^account127_recovery[a-z0-9_]*$/.test(database || '') || url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) throw new Error('Only explicitly named loopback disposable recovery environments are supported');
  return statement => execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-XAt', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

// Fingerprint all unaffected public rows, including non-owner child records.
// Only the exact deletion ownership closure and approved attribution are projected.
export function preservationFingerprint(sql, targets, tableDigests = false, attribution = { concepts: new Map(), startedAt: 0 }) {
  const ids = new Set(targets);
  const tables = JSON.parse(sql("select json_agg(tablename order by tablename) from pg_tables where schemaname='public'"));
  const rows = new Map(tables.map(name => [name, JSON.parse(sql(`select coalesce(json_agg(to_jsonb(t)),'[]') from public."${name}" t`))]));
  const fks = JSON.parse(sql(`select coalesce(json_agg(json_build_object('child',c.relname,'parentSchema',pn.nspname,'parent',p.relname,'column',a.attname,'parentColumn',pa.attname,'cascade',f.confdeltype='c')),'[]')
    from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_class p on p.oid=f.confrelid join pg_namespace pn on pn.oid=p.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=f.conkey[1] join pg_attribute pa on pa.attrelid=p.oid and pa.attnum=f.confkey[1]
    where f.contype='f' and n.nspname='public' and array_length(f.conkey,1)=1`));
  const doomed = new Map(tables.map(name => [name, new Set()]));
  for (const [name, values] of rows) for (let index = 0; index < values.length; index++) {
    if (name === 'account_deletion_state' && ids.has(values[index].user_id)) doomed.get(name).add(index);
    if (fks.some(f => f.child === name && f.parentSchema === 'auth' && f.parent === 'users' && !anonymousColumns.get(name)?.includes(f.column) && ids.has(values[index][f.column]))) doomed.get(name).add(index);
  }
  let changed;
  do {
    changed = false;
    for (const f of fks) {
      const explicit = (f.child === 'content_media_placements' && ['personal_cards', 'personal_concepts'].includes(f.parent)) || (['media_deletion_jobs', 'media_service_operations'].includes(f.child) && f.parent === 'media_assets');
      if (f.parentSchema !== 'public' || (!f.cascade && !explicit)) continue;
      const keys = new Set([...doomed.get(f.parent)].map(index => rows.get(f.parent)[index][f.parentColumn]));
      rows.get(f.child).forEach((row, index) => {
        if (row[f.column] !== null && keys.has(row[f.column]) && !doomed.get(f.child).has(index)) { doomed.get(f.child).add(index); changed = true; }
      });
    }
  } while (changed);
  const protectedRows = [];
  for (const [name, values] of rows) {
    const normalized = values.flatMap((original, index) => {
      if (doomed.get(name).has(index)) return [];
      const row = { ...original };
      // Released enforce_concept_lifecycle updates current-row metadata on any
      // UPDATE, including anonymization. Immutable revision timestamps and every
      // other Concept stay exact. Accept only this run's attribution timestamp.
      if (name === 'concepts' && attribution.concepts.has(row.id)) {
        const originalTime = attribution.concepts.get(row.id);
        if (row.updated_at !== originalTime) {
          const time = Date.parse(row.updated_at);
          if (row.created_by !== null || !Number.isFinite(time) || time < attribution.startedAt - 2000 || time > Date.now() + 2000) throw new Error('Unexpected Concept timestamp change');
        }
        row.updated_at = originalTime;
      }
      for (const column of anonymousColumns.get(name) || []) if (ids.has(row[column])) row[column] = null;
      return [JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))];
    }).sort();
    protectedRows.push([name, digest(JSON.stringify(normalized))]);
  }
  return tableDigests ? protectedRows : digest(JSON.stringify(protectedRows));
}

export async function runRecovery(env, checkpoint, outputDirectory) {
  const directory = resolve(outputDirectory); mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (statSync(directory).mode & 0o077) throw new Error('Recovery evidence directory must be private');
  const lock = `${directory}/.reconciliation.lock`, handle = openSync(lock, 'wx', 0o600);
  try { return await reconcileLocked(env, checkpoint, directory); }
  finally { closeSync(handle); unlinkSync(lock); }
}

async function reconcileLocked(env, checkpoint, directory) {
  const ready = `${directory}/READY.json`;
  try { unlinkSync(ready); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  writeFileSync(`${directory}/BLOCKED.json`, JSON.stringify({ state: 'isolated-unavailable', startedAt: new Date().toISOString() }), { mode: 0o600 });
  const sql = isolatedDatabase(env), config = ledgerConfig(env), ledger = createDeletionLedger(config);
  if (!checkpoint.backupPath || digest(readFileSync(checkpoint.backupPath)) !== checkpoint.backupSha256) throw new Error('Recovery backup identity does not match');
  const snapshot = await ledger.snapshot();
  if (snapshot.source !== checkpoint.source) throw new Error('Wrong deletion-ledger source');
  const ids = snapshot.records.map(row => row.account);
  const attribution = { startedAt: Date.now(), concepts: new Map(JSON.parse(sql(`select coalesce(json_agg(json_build_array(id,updated_at)),'[]') from public.concepts where created_by=any(array[${ids.map(literal).join(',')}]::uuid[])`))) };
  const admin = createClient(env.ACCOUNT_RECOVERY_SUPABASE_URL, env.ACCOUNT_RECOVERY_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  if (sql("select count(*) from pg_proc where oid='public.begin_account_deletion(uuid,text)'::regprocedure") !== '1') throw new Error('Install and verify Migration 127 in isolation first');
  const service = {
    async status(hash) { const r = await admin.rpc('account_deletion_status', { p_receipt_hash: hash }); if (r.error) throw new Error('Recovery status unavailable'); return r.data; },
    async recordIntent(id) { if (!(await ledger.read(id))) throw new Error('Recovery requires the existing independent intent'); },
    async remove(bucket, names) { const r = await admin.storage.from(bucket).remove(names); if (r.error) throw new Error('Recovery Storage cleanup incomplete'); },
    async deleteIdentity(id) { const r = await admin.auth.admin.deleteUser(id, false); if (r.error) throw new Error('Recovery Auth cleanup incomplete'); },
  };
  const ownedPaths = new Map();
  const target = {
    async blockAccess() { /* Only loopback services; no ingress-opening operation exists. */ },
    async identity() { return `${env.ACCOUNT_RECOVERY_DB_CONTAINER}/${sql('select current_database()')}`; },
    async preservationFingerprint() { return preservationFingerprint(sql, ids, false, attribution); },
    async reapply(id) {
      const exists = sql(`select count(*) from auth.users where id=${literal(id)}`) === '1';
      if (!exists) return;
      const provider = await admin.auth.admin.getUserById(id);
      if (provider.error || provider.data.user?.id !== id) throw new Error('Recovery API/database target mismatch');
      const receipt = digest(randomBytes(32));
      const begun = await admin.rpc('begin_account_deletion', { p_user: id, p_receipt_hash: receipt });
      if (begun.error) throw new Error('Approved cleanup could not begin');
      ownedPaths.set(id, (await service.status(receipt)).objects);
      await continueDeletion(service, receipt);
    },
    async verifyAbsent(id) {
      if (sql(`select count(*) from auth.users where id=${literal(id)}`) !== '0') throw new Error('Auth identity remains');
      const residual = sql(`do $verify$ declare r record; n bigint; begin
        for r in select c.relname,a.attname from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace ns on ns.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=f.conkey[1]
        where f.contype='f' and f.confrelid='auth.users'::regclass and ns.nspname='public' loop
          execute format('select count(*) from public.%I where %I=$1',r.relname,r.attname) into n using ${literal(id)}::uuid;
          if n<>0 then raise exception 'Residual owner reference'; end if;
        end loop;
        if exists(select 1 from storage.objects where owner=${literal(id)}::uuid or owner_id=${literal(id)}) then raise exception 'Residual private Storage'; end if;
      end $verify$; select 'absent';`);
      if (!residual.endsWith('absent')) throw new Error('Personal-data absence is unverified');
      for (const path of ownedPaths.get(id) || []) {
        const result = await admin.storage.from(path.bucket).download(path.name);
        if (!result.error || !['400', '404'].includes(String(result.error.statusCode))) throw new Error('Private bytes still exist or absence is unverified');
      }
    },
    async writeReadiness(report) {
      writeFileSync(ready, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
      // BLOCKED remains: a certificate records proof, never permission to serve.
    },
  };
  return reconcileDeletions({ ledger, target, checkpoint });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [envFile, checkpointFile, output] = process.argv.slice(2);
  if (!envFile || !checkpointFile || !output || statSync(envFile).mode & 0o077) throw new Error('Private explicit environment, checkpoint and evidence paths required');
  const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
  try { const report = await runRecovery(env, JSON.parse(readFileSync(checkpointFile, 'utf8')), output); console.log(JSON.stringify({ state: report.state, reconciled: report.reconciled, noNetworkAccessEnabled: true })); }
  catch { console.error('Recovery failed. Keep the restored environment unavailable; protected local evidence is required for investigation.'); process.exitCode = 1; }
}
