// Explicit opt-in, synthetic namespace only. Never part of the default suite.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { Client } from 'pg';
import { postgresLedgerConfig, createPostgresDeletionLedger } from '../lib/account-deletion-postgres-ledger.mjs';
import { checkpointLedger } from '../scripts/checkpoint-deletion-ledger.mjs';
import { readProtectedCheckpoint, assertCheckpointContains } from '../lib/account-deletion-checkpoint.mjs';
import { reconcileDeletions } from '../lib/account-deletion-recovery.mjs';
const ref=process.env.SOCRATES_LEDGER_PROOF_PROJECT;
assert.match(ref ?? '',/^[a-z]{20}$/);
assert.ok(!['ljmiourzsxwhegshtwee','uabtzwcpksqvqoztohah'].includes(ref));
const output=process.env.SOCRATES_LEDGER_PROOF_REPORT;assert.ok(output?.startsWith('/Users/itxiermeziani/.codex/local-evidence/'));
const read=(service,account)=>JSON.parse(execFileSync('security',['find-generic-password','-s',service,'-a',account,'-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const operator=read('Socrates deletion ledger operator',`${ref}:synthetic`);
const roles=Object.fromEntries(['writer','recovery','checkpoint'].map(role=>{const config=postgresLedgerConfig(read('Socrates deletion ledger environment',`${ref}:synthetic:${role}`));assert.equal(config.source,'disposable-ledger-proof');return [role,{config,ledger:createPostgresDeletionLedger(config)}];}));
const checks=[];const pass=name=>{checks.push(name);};
async function sql(role,text,values=[]) {
  const c=new Client({connectionString:roles[role].config.databaseUrl,ssl:{rejectUnauthorized:true,ca:roles[role].config.ca},connectionTimeoutMillis:10000});c.on('error',()=>{});
  try {await c.connect();assert.ok(c.connection.stream.encrypted && c.connection.stream.authorized);return (await c.query(text,values)).rows;}
  finally {await c.end();}
}
let head;
try {head=read('Socrates deletion ledger operator',`${ref}:synthetic:head`);}
catch {assert.equal(readdirSync(operator.directory).filter(n=>n.endsWith('.checkpoint')).length,0,'Missing checkpoint head must not be silently replaced');}
async function checkpoint() {
  const result=await checkpointLedger({config:roles.checkpoint.config,ledger:roles.checkpoint.ledger,directory:operator.directory,encryptionKey:operator.encryptionKey,privateKey:operator.privateKey,head,save:async value=>{
    const command=`add-generic-password -U -s "Socrates deletion ledger operator" -a "${ref}:synthetic:head" -w ${JSON.stringify(JSON.stringify(value))}\n`;
    const result=spawnSync('security',['-i'],{input:command,encoding:'utf8'});assert.equal(result.status,0);assert.deepEqual(read('Socrates deletion ledger operator',`${ref}:synthetic:head`),value);head=value;
  }});return result;
}
try {
  for(const role of Object.keys(roles))assert.equal((await roles[role].ledger.assertReady()).appendOnly,true);pass('Restricted authenticated database roles and append-only contract');
  const tls=await sql('writer','select ssl from pg_stat_ssl where pid=pg_backend_pid()');assert.equal(tls[0].ssl,true);pass('Certificate-verified client TLS and encrypted pooler-to-database connection');
  for(const role of Object.keys(roles))for(const statement of ['update ledger_private.records set record=record','delete from ledger_private.records','truncate ledger_private.records','drop table ledger_private.records'])await assert.rejects(sql(role,statement),e=>e.code==='42501');pass('Writer, recovery and checkpoint identities denied direct UPDATE, DELETE, TRUNCATE and DROP');
  await assert.rejects(sql('writer','select ledger_api.list_records(null)'),e=>e.code==='42501');pass('Application writer cannot enumerate deletion records');
  await assert.rejects(sql('writer',"select ledger_api.acknowledge_checkpoint($1,$2)",[randomUUID(),'{}']),e=>e.code==='42501');pass('Application writer cannot acknowledge a checkpoint');
  await assert.rejects(sql('recovery',"select ledger_api.append_record('{}')"),e=>e.code==='42501');
  await assert.rejects(sql('checkpoint',"select ledger_api.append_record('{}')"),e=>e.code==='42501');pass('Recovery is read-only; checkpoint cannot append deletion intents');
  await assert.rejects(sql('writer','set role socrates_ledger_checkpoint'),e=>e.code==='42501');
  await assert.rejects(sql('writer','set role postgres'),e=>e.code==='42501');pass('Writer cannot assume checkpoint or administrative roles');
  const spoof=await sql('writer',"select set_config('request.jwt.claims','{\"ledger_source\":\"socrates-production\"}',false),ledger_api.ledger_status() state");assert.equal(spoof[0].state.source,'disposable-ledger-proof');pass('Client claims cannot change source identity');
  const id=randomUUID();await assert.rejects(roles.writer.ledger.record(id));pass('Append succeeds but cleanup remains blocked before independent checkpoint');
  let exported=await roles.recovery.ledger.exportRecords();const saved=exported.rows.find(r=>roles.recovery.ledger.verify(r.record).account===id);assert.ok(saved && saved.receipt===null);pass('Recovery enumerates and verifies original signed intent');
  await Promise.all([assert.rejects(roles.writer.ledger.record(id)),assert.rejects(roles.writer.ledger.record(id))]);
  exported=await roles.recovery.ledger.exportRecords();assert.equal(exported.rows.filter(r=>roles.recovery.ledger.verify(r.record).account===id).length,1);assert.equal(exported.rows.find(r=>roles.recovery.ledger.verify(r.record).account===id).record,saved.record);pass('Concurrent duplicate append preserves exactly one original record');
  const wrong=JSON.parse(saved.record);wrong.event.source='socrates-production';await assert.rejects(sql('writer','select ledger_api.append_record($1)',[JSON.stringify(wrong)]));pass('Database rejects cross-source append');
  await checkpoint();assert.equal((await roles.writer.ledger.record(id)).account,id);assert.equal((await roles.writer.ledger.read(id)).account,id);pass('Encrypted external checkpoint and signature receipt unlock confirmed intent');
  const pinned={...roles.recovery.config,checkpointFile:head.path,checkpointSha256:head.sha256,checkpointKey:operator.encryptionKey};
  const ledger=createPostgresDeletionLedger(pinned);const snapshot=await ledger.snapshot();assert.ok(snapshot.records.some(r=>r.account===id));pass('Recovery snapshot matches independent pinned checkpoint');
  const prior=readProtectedCheckpoint(pinned);assert.throws(()=>assertCheckpointContains(prior,{ledger:pinned.ledgerId,source:pinned.source,rows:[]}));pass('Missing records and ledger rollback detected against external checkpoint');
  const outage=createPostgresDeletionLedger(roles.writer.config,async()=>{throw Error('simulated unavailable provider');});await assert.rejects(outage.record(randomUUID()));pass('Unavailable ledger fails closed before cleanup commitment');
  let blocked=false,ready=false;const removed=new Set();
  const result=await reconcileDeletions({ledger,checkpoint:{isolated:true,backupSha256:'a'.repeat(64),source:pinned.source,createdAt:new Date().toISOString()},target:{blockAccess:async()=>{blocked=true;},preservationFingerprint:async()=>'unchanged',reapply:async account=>{assert.ok(blocked);removed.add(account);},verifyAbsent:async account=>assert.ok(removed.has(account)),identity:async()=>'synthetic-target',hasActiveAdministrator:async()=>true,writeReadiness:async()=>{ready=true;}}});
  assert.equal(result.reconciled,snapshot.records.length);assert.ok(ready);assert.equal(result.state,'verified-isolated');pass('Existing recovery reconciliation consumes verified PostgreSQL ledger records');
  writeFileSync(output,JSON.stringify({status:'PASS',project:ref,source:'disposable-ledger-proof',checks,checkCount:checks.length,syntheticRecords:snapshot.records.length,checkpointSha256:head.sha256,productionWrites:0},null,2),{mode:0o600});
  console.log(JSON.stringify({status:'PASS',checks:checks.length,syntheticRecords:snapshot.records.length}));
} catch(e) {
  writeFileSync(output,JSON.stringify({status:'FAIL',completedChecks:checks,errorName:e.name,errorCode:e.code ?? null},null,2),{mode:0o600});console.error('Focused provider proof failed; safe completed-check evidence retained.');process.exitCode=1;
}
