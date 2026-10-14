import { createCipheriv, createDecipheriv, createHash, randomBytes, sign, verify } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

const header = Buffer.from('SOCRATES-LEDGER-CHECKPOINT-1\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = () => new Error('Independent deletion checkpoint unavailable or inconsistent. Cleanup and recovery must remain stopped.');
const text = body => JSON.stringify(body);

function privatePath(path, directory = false) {
  const s = lstatSync(path);
  if (!isAbsolute(path) || s.isSymbolicLink() || (s.mode & 0o077) || (directory ? !s.isDirectory() : !s.isFile())) throw failure();
}

export function readProtectedCheckpoint(config) {
  try {
    const { checkpointFile: path, checkpointKey: key, checkpointSha256: digest, checkpointPublicKey: publicKey } = config;
    if (!path || !/^[0-9a-f]{64}$/.test(key) || !/^[0-9a-f]{64}$/.test(digest)) throw failure();
    privatePath(dirname(path), true); privatePath(path);
    const bytes = readFileSync(path);
    if (bytes.length > 128 * 1024 * 1024 || hash(bytes) !== digest || !bytes.subarray(0, header.length).equals(header)) throw failure();
    const d = createDecipheriv('aes-256-gcm', Buffer.from(key,'hex'), bytes.subarray(header.length,header.length+12));
    d.setAAD(header); d.setAuthTag(bytes.subarray(header.length+12,header.length+28));
    const signed = JSON.parse(Buffer.concat([d.update(bytes.subarray(header.length+28)),d.final()]).toString());
    const b = signed.body;
    if (!b || b.version !== 1 || b.ledger !== config.ledgerId || b.source !== config.source || !Array.isArray(b.rows) || !Number.isSafeInteger(b.sequence) || b.sequence < 1 || !/^[0-9a-f]{128}$/.test(signed.signature) || !verify(null,Buffer.from(text(b)),publicKey,Buffer.from(signed.signature,'hex'))) throw failure();
    const accounts = b.rows.map(row => JSON.parse(row.record).event.account);
    if (new Set(accounts).size !== accounts.length || accounts.some((a,i) => i && a <= accounts[i-1]) || hash(b.rows.map(row => hash(row.record)).join('')) !== b.digest) throw failure();
    return { ...b, fileSha256: digest };
  } catch { throw failure(); }
}

export function assertCheckpointContains(checkpoint, exported) {
  if (checkpoint.ledger !== exported.ledger || checkpoint.source !== exported.source) throw failure();
  const rows = new Map(exported.rows.map(row => [JSON.parse(row.record).event.account,row.record]));
  for (const row of checkpoint.rows) {
    if (rows.get(JSON.parse(row.record).event.account) !== row.record) throw failure();
  }
}

// Operator-only: neither the application nor the ledger database receives the
// encryption/signing private keys or write access to this filesystem.
export function writeProtectedCheckpoint({ config, exported, directory, encryptionKey, privateKey, previous, now = new Date() }) {
  try {
    privatePath(directory,true);
    if (!/^[0-9a-f]{64}$/.test(encryptionKey) || exported.ledger !== config.ledgerId || exported.source !== config.source) throw failure();
    if (previous) assertCheckpointContains(previous,exported);
    const body = { version:1, ledger:config.ledgerId, source:config.source, sequence:(previous?.sequence ?? 0)+1, previous:previous?.fileSha256 ?? null, createdAt:now.toISOString(), digest:exported.digest, rows:exported.rows.map(row => ({ record:row.record })) };
    const signed = { body, signature:sign(null,Buffer.from(text(body)),privateKey).toString('hex') };
    const nonce=randomBytes(12), c=createCipheriv('aes-256-gcm',Buffer.from(encryptionKey,'hex'),nonce); c.setAAD(header);
    const encrypted=Buffer.concat([c.update(text(signed)),c.final()]);
    const bytes=Buffer.concat([header,nonce,c.getAuthTag(),encrypted]), digest=hash(bytes), path=join(directory,`${body.sequence}-${digest}.checkpoint`);
    const fd=openSync(path,'wx',0o600);
    try { writeFileSync(fd,bytes); fsyncSync(fd); } finally { closeSync(fd); }
    const parent=openSync(directory,'r');try { fsyncSync(parent); } finally { closeSync(parent); }
    const verified=readProtectedCheckpoint({ ...config, checkpointFile:path, checkpointKey:encryptionKey, checkpointSha256:digest });
    return { checkpoint:verified, path, sha256:digest };
  } catch { throw failure(); }
}

export function signCheckpointReceipt(config, account, record, checkpointSha256, privateKey) {
  const receipt={version:1,ledger:config.ledgerId,source:config.source,account,recordSha256:hash(record),checkpointSha256};
  return JSON.stringify({ receipt, signature:sign(null,Buffer.from(text(receipt)),privateKey).toString('hex') });
}
