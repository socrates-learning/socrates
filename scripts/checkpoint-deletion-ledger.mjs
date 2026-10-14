import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { postgresLedgerConfig, createPostgresDeletionLedger } from '../lib/account-deletion-postgres-ledger.mjs';
import { readProtectedCheckpoint, writeProtectedCheckpoint, signCheckpointReceipt } from '../lib/account-deletion-checkpoint.mjs';

const service='Socrates deletion ledger operator';
function readKey(account) {
  try { return execFileSync('security',['find-generic-password','-s',service,'-a',account,'-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
  catch { throw new Error('Protected checkpoint configuration unavailable'); }
}
function saveHead(account,value) {
  const input=`add-generic-password -U -s ${JSON.stringify(service)} -a ${JSON.stringify(account)} -w ${JSON.stringify(JSON.stringify(value))}\n`;
  const result=spawnSync('security',['-i'],{input,encoding:'utf8'});
  if (result.status || readKey(account)!==JSON.stringify(value)) throw new Error('Independent checkpoint head could not be preserved');
}

export async function checkpointLedger({ config, ledger, directory, encryptionKey, privateKey, head, save }) {
  let lock;
  try {
    lock=openSync(join(directory,'.checkpoint.lock'),'wx',0o600);
    const previous=head ? readProtectedCheckpoint({...config,checkpointFile:head.path,checkpointSha256:head.sha256,checkpointKey:encryptionKey}) : null;
    const exported=await ledger.exportRecords();
    for (const row of exported.rows) ledger.verify(row.record);
    const saved=writeProtectedCheckpoint({config,exported,directory,encryptionKey,privateKey,previous});
    // Pin the new head in a different protected store before issuing receipts.
    await save({path:saved.path,sha256:saved.sha256,sequence:saved.checkpoint.sequence});
    for (const row of exported.rows) {
      const event=ledger.verify(row.record);
      if (row.receipt) ledger.verifyReceipt(row,event);
      else await ledger.acknowledge(event.account,signCheckpointReceipt(config,event.account,row.record,saved.sha256,privateKey));
    }
    return {records:exported.rows.length,sequence:saved.checkpoint.sequence,path:saved.path,sha256:saved.sha256};
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(join(directory,'.checkpoint.lock')); }
  }
}

async function main() {
  const account=process.argv[2];
  if (!/^[a-z]{20}:(production|synthetic)$/.test(account ?? '')) throw new Error('Explicit ledger operator identity required');
  const stored=JSON.parse(readKey(account)),config=postgresLedgerConfig(stored.env);
  if (config.role!=='checkpoint') throw new Error('Restricted checkpoint identity required');
  const head=JSON.parse(readKey(account+':head'));
  const result=await checkpointLedger({config,ledger:createPostgresDeletionLedger(config),directory:stored.directory,encryptionKey:stored.encryptionKey,privateKey:stored.privateKey,head,save:value=>saveHead(account+':head',value)});
  console.log(JSON.stringify({status:'verified',records:result.records,sequence:result.sequence,checkpointSha256:result.sha256}));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('Checkpoint failed. Account deletion must remain stopped; inspect protected configuration and retry.');process.exitCode=1;});
