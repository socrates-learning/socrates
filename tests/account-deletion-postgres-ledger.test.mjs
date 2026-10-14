import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, chmodSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresLedgerConfig, createPostgresDeletionLedger } from '../lib/account-deletion-postgres-ledger.mjs';
import { readProtectedCheckpoint, writeProtectedCheckpoint, assertCheckpointContains, signCheckpointReceipt } from '../lib/account-deletion-checkpoint.mjs';
import { checkpointLedger } from '../scripts/checkpoint-deletion-ledger.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const keys=generateKeyPairSync('ed25519');
const config={ledgerId:randomUUID(),source:'disposable-proof',signingKey:'ab'.repeat(32),checkpointPublicKey:keys.publicKey.export({type:'spki',format:'pem'})};
function record(account=randomUUID()) {
  const event={version:1,source:config.source,account,confirmedAt:'2026-10-13T00:00:00.000Z'};
  return JSON.stringify({event,signature:createHmac('sha256',Buffer.from(config.signingKey,'hex')).update(JSON.stringify(event)).digest('hex')});
}
const exported=records=>({ledger:config.ledgerId,source:config.source,rows:records.map(record=>({record,receipt:null})),digest:hash(records.map(hash).join(''))});
function setup(t) {
  const directory=mkdtempSync(join(tmpdir(),'socrates-ledger-'));chmodSync(directory,0o700);t.after(()=>rmSync(directory,{recursive:true,force:true}));
  return {config,directory,encryptionKey:'cd'.repeat(32),privateKey:keys.privateKey};
}
test('server configuration pins a different Supabase database with a restricted login',()=>{
  const ref='abcdefghijklmnopqrst';
  const env={DELETION_LEDGER_DATABASE_URL:`postgresql://socrates_ledger_writer_production.${ref}:secret@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,DELETION_LEDGER_PROJECT_REF:ref,DELETION_LEDGER_CA_CERT:'certificate',DELETION_LEDGER_SOURCE:config.source,DELETION_LEDGER_ID:config.ledgerId,DELETION_LEDGER_SIGNING_KEY:config.signingKey,DELETION_LEDGER_CHECKPOINT_PUBLIC_KEY:config.checkpointPublicKey,NEXT_PUBLIC_SUPABASE_URL:'https://ljmiourzsxwhegshtwee.supabase.co'};
  assert.equal(postgresLedgerConfig(env).role,'writer');
  for(const change of [{NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`},{DELETION_LEDGER_PROJECT_REF:'ljmiourzsxwhegshtwee'},{DELETION_LEDGER_DATABASE_URL:env.DELETION_LEDGER_DATABASE_URL+'?sslmode=disable'},{DELETION_LEDGER_DATABASE_URL:env.DELETION_LEDGER_DATABASE_URL.replace('socrates_ledger_writer_production','postgres')}])assert.throws(()=>postgresLedgerConfig({...env,...change}));
});
test('signed record format stays compatible and tampering is rejected',()=>{
  const ledger=createPostgresDeletionLedger(config),r=record();assert.equal(ledger.verify(r).version,1);
  assert.throws(()=>ledger.verify(r.replace('disposable-proof','disposable-other')));
});
test('encrypted checkpoint verifies signature, source, pinned identity and file privacy',t=>{
  const args=setup(t),saved=writeProtectedCheckpoint({...args,exported:exported([record()])});
  const env={...config,checkpointFile:saved.path,checkpointKey:args.encryptionKey,checkpointSha256:saved.sha256};
  assert.equal(readProtectedCheckpoint(env).rows.length,1);
  assert.throws(()=>readProtectedCheckpoint({...env,source:'other'}));
  assert.throws(()=>readProtectedCheckpoint({...env,checkpointSha256:'0'.repeat(64)}));
  chmodSync(saved.path,0o644);assert.throws(()=>readProtectedCheckpoint(env));chmodSync(saved.path,0o600);
  const bytes=readFileSync(saved.path);bytes[bytes.length-1]^=1;writeFileSync(saved.path,bytes);assert.throws(()=>readProtectedCheckpoint({...env,checkpointSha256:hash(bytes)}));
});
test('missing records or changed records block a subsequent checkpoint',t=>{
  const args=setup(t),r=record(),first=writeProtectedCheckpoint({...args,exported:exported([r])});
  assert.throws(()=>writeProtectedCheckpoint({...args,exported:exported([]),previous:first.checkpoint}));
  assert.throws(()=>assertCheckpointContains(first.checkpoint,exported([r.replace('00:00:00','00:00:01')])));
});
test('a rollback to an older valid encrypted checkpoint fails its external head pin',t=>{
  const args=setup(t),first=writeProtectedCheckpoint({...args,exported:exported([])}),second=writeProtectedCheckpoint({...args,exported:exported([record()]),previous:first.checkpoint});
  assert.equal(second.checkpoint.previous,first.sha256);
  assert.throws(()=>readProtectedCheckpoint({...config,checkpointFile:first.path,checkpointKey:args.encryptionKey,checkpointSha256:second.sha256}));
});
test('receipt cannot be substituted between accounts or signed by the database',()=>{
  const ledger=createPostgresDeletionLedger(config),r=record(),event=ledger.verify(r);
  const receipt=signCheckpointReceipt(config,event.account,r,'1'.repeat(64),keys.privateKey);
  ledger.verifyReceipt({record:r,receipt},event);
  assert.throws(()=>ledger.verifyReceipt({record:r,receipt}, {...event,account:randomUUID()}));
  assert.throws(()=>ledger.verifyReceipt({record:r,receipt:receipt.replace(/"signature":"[^"]+"/,`"signature":"${'0'.repeat(128)}"`)},event));
});
test('no receipt is issued until checkpoint write and independent head persistence succeed',async t=>{
  const args=setup(t),rows=exported([record()]);let acknowledgements=0;
  const verifier=createPostgresDeletionLedger(config);
  const ledger={...verifier,exportRecords:async()=>rows,acknowledge:async()=>{acknowledgements++;}};
  await assert.rejects(checkpointLedger({...args,ledger,save:async()=>{throw Error('Protected head unavailable');}}));
  assert.equal(acknowledgements,0);
  let saved=false;
  const result=await checkpointLedger({...args,ledger:{...ledger,acknowledge:async()=>{assert.equal(saved,true);acknowledgements++;}},save:async()=>{saved=true;}});
  assert.equal(result.records,1);assert.equal(acknowledgements,1);
});
test('ledger outage or missing checkpoint receipt never returns a committed intent',async()=>{
  let appended=false;const row={record:record(),receipt:null};const event=JSON.parse(row.record).event;
  const status={version:1,ledger:config.ledgerId,source:config.source,appendOnly:true,count:0,digest:hash('')};
  const ledger=createPostgresDeletionLedger(config,async sql=>{if(sql.includes('ledger_status'))return status;if(sql.includes('append_record')){appended=true;return null;}return row;});
  await assert.rejects(ledger.record(event.account));assert.equal(appended,true);
  const unavailable=createPostgresDeletionLedger(config,async()=>{throw Error('database unavailable');});await assert.rejects(unavailable.record(randomUUID()));
});
