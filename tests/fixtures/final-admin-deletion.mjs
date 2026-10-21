// Disposable ledger transport with real HMAC, Ed25519 receipts, encrypted
// checkpoint files and independent head pins. No network or Production keys.
import { createHash, createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPostgresDeletionLedger } from '../../lib/account-deletion-postgres-ledger.mjs';
import { signCheckpointReceipt, writeProtectedCheckpoint } from '../../lib/account-deletion-checkpoint.mjs';

export function signedRecoveryFixture(account = randomUUID()) {
  const keys = generateKeyPairSync('ed25519'), hash = value => createHash('sha256').update(value).digest('hex');
  const directory = mkdtempSync(join(tmpdir(), 'socrates-final-admin-')); chmodSync(directory, 0o700);
  const config = { ledgerId: randomUUID(), source: 'disposable-final-admin', signingKey: 'ab'.repeat(32), checkpointPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) };
  const event = { version: 1, source: config.source, account, confirmedAt: new Date().toISOString() };
  const row = { record: JSON.stringify({ event, signature: createHmac('sha256', Buffer.from(config.signingKey, 'hex')).update(JSON.stringify(event)).digest('hex') }), receipt: null };
  const exported = { ledger: config.ledgerId, source: config.source, rows: [{ ...row }], digest: hash(hash(row.record)) };
  const saved = writeProtectedCheckpoint({ config, directory, encryptionKey: 'cd'.repeat(32), privateKey: keys.privateKey, exported });
  row.receipt = signCheckpointReceipt(config, account, row.record, saved.sha256, keys.privateKey);
  Object.assign(config, { checkpointFile: saved.path, checkpointKey: 'cd'.repeat(32), checkpointSha256: saved.sha256 });
  const options = { offline: false, missing: false }; const calls = [];
  const ledger = createPostgresDeletionLedger(config, async (sql, args) => {
    calls.push(sql); if (options.offline) throw new Error('Disposable ledger offline');
    if (sql.includes('ledger_status')) return { version: 1, ledger: config.ledgerId, source: config.source, appendOnly: true, count: 1, digest: hash(hash(row.record)) };
    if (sql.includes('list_records')) return [row];
    if (sql.includes('read_record')) return !options.missing && args[0] === account ? row : null;
    throw new Error('Recovery must never append or acknowledge new ledger evidence');
  });
  return { ledger, config, row, options, calls, account, event, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
