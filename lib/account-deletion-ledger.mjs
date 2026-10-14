import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { postgresLedgerConfig, createPostgresDeletionLedger } from './account-deletion-postgres-ledger.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const failure = () => new Error('Independent deletion ledger unavailable or invalid. Cleanup must remain stopped.');
const xmlText = (xml, name) => {
  const value = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
  if (value === undefined) throw failure();
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
};
const canonical = event => JSON.stringify({ version: 1, source: event.source, account: event.account, confirmedAt: event.confirmedAt });

// Standard AWS Signature Version 4; no tokens or signed URLs leave the server.
export function signedS3Request(config, method, key, query = {}, body = '', extra = {}, now = new Date()) {
  const endpoint = new URL(config.endpoint);
  const path = `/${[config.bucket, ...key.split('/')].filter(Boolean).map(encode).join('/')}`;
  const search = Object.entries(query).map(([k, v]) => [encode(k), encode(v)]).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = stamp.slice(0, 8), scope = `${day}/${config.region}/s3/aws4_request`;
  const headers = { host: endpoint.host, 'x-amz-content-sha256': sha(body), 'x-amz-date': stamp, ...extra };
  if (config.sessionToken) headers['x-amz-security-token'] = config.sessionToken;
  const names = Object.keys(headers).sort();
  const request = [method, path, search, names.map(k => `${k}:${headers[k].trim()}\n`).join(''), names.join(';'), sha(body)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretKey}`, day), config.region), 's3'), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${hmac(signingKey, `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha(request)}`).toString('hex')}`;
  return { url: `${endpoint.origin}${path}${search ? `?${search}` : ''}`, method, headers, ...(method === 'PUT' ? { body } : {}) };
}

export function ledgerConfig(env = process.env) {
  if (env.DELETION_LEDGER_PROVIDER === 'supabase-postgres') return postgresLedgerConfig(env);
  if (env.DELETION_LEDGER_PROVIDER && env.DELETION_LEDGER_PROVIDER !== 's3') throw failure();
  const config = {
    endpoint: env.DELETION_LEDGER_ENDPOINT, bucket: env.DELETION_LEDGER_BUCKET,
    region: env.DELETION_LEDGER_REGION, source: env.DELETION_LEDGER_SOURCE,
    accessKey: env.DELETION_LEDGER_ACCESS_KEY, secretKey: env.DELETION_LEDGER_SECRET_KEY,
    sessionToken: env.DELETION_LEDGER_SESSION_TOKEN, signingKey: env.DELETION_LEDGER_SIGNING_KEY,
  };
  if (Object.entries(config).some(([key, value]) => key !== 'sessionToken' && !value)) throw failure();
  const url = new URL(config.endpoint);
  const disposable = env.DELETION_LEDGER_DISPOSABLE === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && config.source.startsWith('disposable-');
  if ((!disposable && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw failure();
  if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(config.bucket) || !/^[a-z0-9-]{3,64}$/.test(config.source) || !/^[a-z0-9-]+$/.test(config.region) || !/^[0-9a-f]{64}$/.test(config.signingKey)) throw failure();
  // The production ledger must live outside the application database/Storage.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) throw failure();
  return config;
}

export function createDeletionLedger(config, fetcher = fetch, clock = () => new Date()) {
  if (config.provider === 'supabase-postgres') return createPostgresDeletionLedger(config, undefined, clock);
  const prefix = `deletions/${config.source}/`;
  const keyFor = id => { if (!uuid.test(id)) throw failure(); return `${prefix}${id}.json`; };
  const request = async (method, key = '', query = {}, body = '', headers = {}) => {
    const signed = signedS3Request(config, method, key, query, body, headers, clock());
    try { return await fetcher(signed.url, { ...signed, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) }); }
    catch { throw failure(); }
  };
  const verify = (text, expectedId) => {
    let record;
    try { if (text.length > 1024) throw failure(); record = JSON.parse(text); } catch { throw failure(); }
    const event = record.event;
    if (Object.keys(record).sort().join() !== 'event,signature' || !event || Object.keys(event).sort().join() !== 'account,confirmedAt,source,version' || event.version !== 1 || event.source !== config.source || !uuid.test(event.account) || (expectedId && event.account !== expectedId) || typeof event.confirmedAt !== 'string' || new Date(event.confirmedAt).toISOString() !== event.confirmedAt || Date.parse(event.confirmedAt) > clock().getTime() + 60000 || !/^[0-9a-f]{64}$/.test(record.signature)) throw failure();
    const expected = hmac(Buffer.from(config.signingKey, 'hex'), canonical(event));
    if (!timingSafeEqual(expected, Buffer.from(record.signature, 'hex'))) throw failure();
    return event;
  };
  const assertReady = async () => {
    const response = await request('GET', '', { 'object-lock': '' });
    if (!response.ok) throw failure();
    const xml = await response.text();
    const days = Number(xmlText(xml, 'Days'));
    if (xmlText(xml, 'ObjectLockEnabled') !== 'Enabled' || xmlText(xml, 'Mode') !== 'COMPLIANCE' || !Number.isInteger(days) || days < 90) throw failure();
  };
  const read = async id => {
    const response = await request('GET', keyFor(id));
    if (response.status === 404) return null;
    const until = Date.parse(response.headers.get('x-amz-object-lock-retain-until-date') || '');
    if (!response.ok || response.headers.get('x-amz-object-lock-mode') !== 'COMPLIANCE' || !Number.isFinite(until) || until <= clock().getTime()) throw failure();
    const event = verify(await response.text(), id);
    if (until < Date.parse(event.confirmedAt) + 90 * 86400000 - 60000) throw failure();
    return event;
  };
  const record = async id => {
    await assertReady();
    const event = { version: 1, source: config.source, account: id, confirmedAt: clock().toISOString() };
    const body = JSON.stringify({ event, signature: hmac(Buffer.from(config.signingKey, 'hex'), canonical(event)).toString('hex') });
    // Bucket-default compliance retention applies. Conditional PUT prevents
    // replacement/new versions and makes simultaneous/repeated requests safe.
    // Do not preflight GET: S3 deliberately returns 403 for a missing key when
    // the append-only writer lacks ListBucket. Conditional PUT needs no listing.
    const response = await request('PUT', keyFor(id), {}, body, { 'if-none-match': '*', 'content-type': 'application/json', 'x-amz-server-side-encryption': 'AES256', 'content-md5': createHash('md5').update(body).digest('base64') });
    if (!response.ok && ![409, 412].includes(response.status)) throw failure();
    const saved = await read(id);
    if (!saved) throw failure();
    return saved;
  };
  const snapshot = async () => {
    await assertReady();
    const accounts = new Set(); let token;
    for (let page = 0; ; page++) {
      if (page > 1000) throw failure();
      const query = { 'list-type': '2', prefix, 'encoding-type': 'url', 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) };
      const response = await request('GET', '', query);
      if (!response.ok) throw failure();
      const xml = await response.text();
      if (xml.length > 2000000 || xml.includes('<!')) throw failure();
      const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map(match => decodeURIComponent(match[1]));
      if (Number(xmlText(xml, 'KeyCount')) !== keys.length) throw failure();
      for (const key of keys) {
        const id = key.slice(prefix.length, -5);
        if (key !== keyFor(id) || accounts.has(id)) throw failure();
        accounts.add(id);
      }
      const more = xmlText(xml, 'IsTruncated');
      if (more === 'false') break;
      if (more !== 'true') throw failure();
      const next = xmlText(xml, 'NextContinuationToken');
      if (!next || next === token) throw failure(); token = next;
    }
    const records = [];
    for (const id of [...accounts].sort()) { const event = await read(id); if (!event) throw failure(); records.push(event); }
    return { source: config.source, records, digest: sha(JSON.stringify(records)) };
  };
  return { assertReady, record, read, snapshot, verify };
}
