import { createHash, createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import { readProtectedCheckpoint, assertCheckpointContains } from './account-deletion-checkpoint.mjs';

export const ledgerFailure = () => new Error('Independent deletion ledger or checkpoint unavailable or invalid. Cleanup must remain stopped.');
export const ledgerHash = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const eventText = event => JSON.stringify({ version: 1, source: event.source, account: event.account, confirmedAt: event.confirmedAt });
export const receiptText = receipt => JSON.stringify({ version: 1, ledger: receipt.ledger, source: receipt.source, account: receipt.account, recordSha256: receipt.recordSha256, checkpointSha256: receipt.checkpointSha256 });

export function postgresLedgerConfig(env) {
  const config = {
    provider: 'supabase-postgres', databaseUrl: env.DELETION_LEDGER_DATABASE_URL,
    projectRef: env.DELETION_LEDGER_PROJECT_REF, ca: env.DELETION_LEDGER_CA_CERT?.replaceAll('\\n','\n'),
    source: env.DELETION_LEDGER_SOURCE, ledgerId: env.DELETION_LEDGER_ID,
    signingKey: env.DELETION_LEDGER_SIGNING_KEY,
    checkpointPublicKey: env.DELETION_LEDGER_CHECKPOINT_PUBLIC_KEY?.replaceAll('\\n','\n'),
  };
  if (Object.values(config).some(value => !value)) throw ledgerFailure();
  let url;
  try { url = new URL(config.databaseUrl); } catch { throw ledgerFailure(); }
  const disposable = env.DELETION_LEDGER_DISPOSABLE === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && config.source.startsWith('disposable-');
  if (!['postgres:','postgresql:'].includes(url.protocol) || url.pathname !== '/postgres' || !url.username || !url.password || url.hash || url.search || (!disposable && (!/^[a-z]{20}$/.test(config.projectRef) || !['5432','6543'].includes(url.port)))) throw ledgerFailure();
  // Pin a separate provider project; never use the application's database.
  const application = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!disposable && (!application || new URL(application).hostname.split('.')[0] === config.projectRef || config.projectRef === 'ljmiourzsxwhegshtwee')) throw ledgerFailure();
  if (!disposable && !(url.hostname === `db.${config.projectRef}.supabase.co` || (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username.endsWith(`.${config.projectRef}`)))) throw ledgerFailure();
  const username = decodeURIComponent(url.username).split('.')[0];
  if (!/^socrates_ledger_(writer|recovery|checkpoint)_[a-z0-9_]+$/.test(username)) throw ledgerFailure();
  if (!uuid.test(config.ledgerId) || !/^[a-z0-9-]{3,64}$/.test(config.source) || !/^[0-9a-f]{64}$/.test(config.signingKey)) throw ledgerFailure();
  config.role = username.split('_')[2];
  config.disposable = disposable;
  config.checkpointFile = env.DELETION_LEDGER_CHECKPOINT_FILE;
  config.checkpointKey = env.DELETION_LEDGER_CHECKPOINT_ENCRYPTION_KEY;
  config.checkpointSha256 = env.DELETION_LEDGER_CHECKPOINT_SHA256;
  try { if (createPublicKey(config.checkpointPublicKey).asymmetricKeyType !== 'ed25519') throw ledgerFailure(); }
  catch { throw ledgerFailure(); }
  return config;
}

export function createPostgresDeletionLedger(config, query, clock = () => new Date()) {
  const signRecord = id => {
    if (!uuid.test(id)) throw ledgerFailure();
    const event = { version: 1, source: config.source, account: id, confirmedAt: clock().toISOString() };
    return JSON.stringify({ event, signature: createHmac('sha256', Buffer.from(config.signingKey, 'hex')).update(eventText(event)).digest('hex') });
  };
  const verify = (text, expectedId) => {
    try {
      if (typeof text !== 'string' || text.length > 1024) throw ledgerFailure();
      const record = JSON.parse(text), event = record.event;
      if (Object.keys(record).sort().join() !== 'event,signature' || !event || Object.keys(event).sort().join() !== 'account,confirmedAt,source,version' || event.version !== 1 || event.source !== config.source || !uuid.test(event.account) || (expectedId && event.account !== expectedId) || new Date(event.confirmedAt).toISOString() !== event.confirmedAt || Date.parse(event.confirmedAt) > clock().getTime() + 60000 || !/^[0-9a-f]{64}$/.test(record.signature)) throw ledgerFailure();
      const expected = createHmac('sha256', Buffer.from(config.signingKey, 'hex')).update(eventText(event)).digest();
      if (!timingSafeEqual(expected, Buffer.from(record.signature, 'hex'))) throw ledgerFailure();
      return event;
    } catch { throw ledgerFailure(); }
  };
  const verifyReceipt = (row, event) => {
    try {
      const signed = JSON.parse(row.receipt), r = signed.receipt;
      if (Object.keys(signed).sort().join() !== 'receipt,signature' || Object.keys(r).sort().join() !== 'account,checkpointSha256,ledger,recordSha256,source,version' || r.version !== 1 || r.ledger !== config.ledgerId || r.source !== config.source || r.account !== event.account || r.recordSha256 !== ledgerHash(row.record) || !/^[0-9a-f]{64}$/.test(r.checkpointSha256) || !/^[0-9a-f]{128}$/.test(signed.signature) || !verifySignature(null, Buffer.from(receiptText(r)), config.checkpointPublicKey, Buffer.from(signed.signature, 'hex'))) throw ledgerFailure();
    } catch { throw ledgerFailure(); }
  };
  const rpc = async (name, args = {}) => {
    try {
      const names = { ledger_status: [], read_record: ['p_account'], append_record: ['p_record'], list_records: ['p_after'], acknowledge_checkpoint: ['p_account','p_receipt'] };
      if (!Object.hasOwn(names,name) || Object.keys(args).sort().join() !== [...names[name]].sort().join()) throw ledgerFailure();
      const values = names[name].map(key => args[key]);
      const sql = `select ledger_api.${name}(${values.map((_,index) => `$${index+1}`).join(',')}) as result`;
      if (query) return await query(sql, values);
      const { Client } = await import('pg');
      const client = new Client({ connectionString: config.databaseUrl, ssl: config.disposable ? false : { rejectUnauthorized: true, ca: config.ca }, connectionTimeoutMillis: 10000, statement_timeout: 10000, query_timeout: 12000, application_name: 'socrates-deletion-ledger' });
      client.on('error', () => {});
      try { await client.connect(); return (await client.query(sql, values)).rows[0].result; }
      finally { await client.end().catch(() => {}); }
    } catch { throw ledgerFailure(); }
  };
  const status = async () => {
    const result = await rpc('ledger_status');
    if (result?.version !== 1 || result.ledger !== config.ledgerId || result.source !== config.source || result.appendOnly !== true || !Number.isSafeInteger(result.count) || result.count < 0 || !/^[0-9a-f]{64}$/.test(result.digest)) throw ledgerFailure();
    return result;
  };
  const read = async id => {
    if (!uuid.test(id)) throw ledgerFailure();
    const row = await rpc('read_record', { p_account: id });
    if (row === null) return null;
    const event = verify(row.record, id); verifyReceipt(row, event); return event;
  };
  const record = async id => {
    await status();
    await rpc('append_record', { p_record: signRecord(id) });
    // Destructive cleanup waits for an independently saved, signed checkpoint.
    // A delayed acknowledgement uses the existing restricted deletion retry.
    const event = await read(id); if (!event) throw ledgerFailure(); return event;
  };
  const exportRecords = async () => {
    const before = await status(), rows = []; let after = null;
    for (let page = 0; ; page++) {
      if (page > 10000) throw ledgerFailure();
      const batch = await rpc('list_records', { p_after: after });
      if (!Array.isArray(batch) || batch.length > 500) throw ledgerFailure();
      for (const row of batch) {
        const event = verify(row.record);
        if (after !== null && event.account <= after) throw ledgerFailure();
        after = event.account; rows.push({ record: row.record, receipt: row.receipt });
      }
      if (batch.length < 500) break;
    }
    const end = await status();
    if (before.count !== rows.length || end.count !== before.count || end.digest !== before.digest || ledgerHash(rows.map(row => ledgerHash(row.record)).join('')) !== before.digest) throw ledgerFailure();
    return { ledger: config.ledgerId, source: config.source, rows, digest: before.digest };
  };
  const snapshot = async () => {
    const exported = await exportRecords();
    // Recovery must pin the independently retained checkpoint, never one obtained
    // solely from the database being inspected or restored.
    const checkpoint = readProtectedCheckpoint(config);
    assertCheckpointContains(checkpoint, exported);
    const records = exported.rows.map(row => { const event = verify(row.record); verifyReceipt(row, event); return event; });
    return { source: config.source, records, digest: ledgerHash(JSON.stringify(records)), exported };
  };
  const acknowledge = async (account, receipt) => rpc('acknowledge_checkpoint', { p_account: account, p_receipt: receipt });
  return { assertReady: status, record, read, snapshot, verify, verifyReceipt, exportRecords, acknowledge };
}
