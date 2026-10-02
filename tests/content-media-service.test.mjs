import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadMediaModule, sampleImage } from './fixtures/content-media-images.mjs';
class MediaError extends Error { constructor(status, message) { super(message); this.status = status; } }
const image = loadMediaModule('lib/content-media/image.ts');
const context = { actor: 'actor', library: 'library' };
const request = input => new Request('http://localhost', { method: 'PUT', body: input });
function harness({ rejectAt, complete, corrupt = false } = {}) {
  const calls = [], objects = new Map(); let metadata;
  const rpc = async (_client, _name, args) => {
    calls.push(args.p_action);
    if (args.p_action === rejectAt) throw new Error('Synthetic interrupted transition');
    if (args.p_action === 'claim') return complete || { token: 'claim', generation: 1 };
    if (args.p_action !== 'claim') assert.equal(args.p_token, 'claim');
    if (args.p_action === 'commit-bytes') { metadata = args.p_data; return { attemptId: 'staging-attempt' }; }
    if (args.p_action === 'dispatch-stage') { assert.equal(args.p_data.attemptId, 'staging-attempt'); return { bucket: 'private', object: '_staging/unique' }; }
    if (args.p_action === 'stage-verified') return { attemptId: 'promotion-attempt' };
    if (args.p_action === 'dispatch-promotion') { assert.equal(args.p_data.attemptId, 'promotion-attempt'); return { bucket: 'private', source: '_staging/unique', object: 'library/fresh-asset' }; }
    if (args.p_action === 'publish') {
      assert.equal(args.p_data.attemptId, 'promotion-attempt');
      assert.equal(createHash('sha256').update(objects.get('library/fresh-asset')).digest('hex'), metadata.outputDigest);
      return { assetId: 'fresh-asset', ready: true };
    }
    return {};
  };
  const client = {
    mediaWrites: {
      stage: async (target, bytes) => { calls.push('stage-write'); objects.set(target.object, bytes); },
      promote: async target => { calls.push('copy-write'); objects.set(target.object, objects.get(target.source)); },
    },
    storage: { from: () => ({ download: async path => {
      calls.push(path.startsWith('_staging') ? 'staging-readback' : 'promotion-readback');
      return { data: new Blob([corrupt ? Buffer.from('wrong') : objects.get(path)]) };
    } }) },
  };
  const service = loadMediaModule('lib/content-media/service.ts', { 'server-only': {}, './image': image, './server': { rpc, MediaError, boundedBody: async req => { calls.push('body'); return Buffer.from(await req.arrayBuffer()); } } });
  return { calls, client, service };
}
test('authorization precedes body/decode; publication follows unique staging, copy and both exact readbacks', async () => {
  const h = harness();
  assert.equal((await h.service.uploadImage(h.client, context, 'reservation', request(await sampleImage()))).ready, true);
  assert.deepEqual(h.calls, ['claim', 'body', 'commit-bytes', 'dispatch-stage', 'stage-write', 'staging-readback', 'stage-verified', 'dispatch-promotion', 'copy-write', 'promotion-readback', 'publish']);
});
for (const transition of ['claim', 'commit-bytes', 'dispatch-stage', 'stage-verified', 'dispatch-promotion', 'publish']) {
  test(`rejected ${transition} never reports publication; recovery remains claim-qualified`, async () => {
    const h = harness({ rejectAt: transition });
    await assert.rejects(h.service.uploadImage(h.client, context, 'reservation', request(await sampleImage())), /interrupted/);
    if (transition === 'claim') assert.deepEqual(h.calls, ['claim']);
    else { assert.equal(h.calls.at(-1), 'fail'); assert.equal(h.calls.filter(x => x === 'publish').length, transition === 'publish' ? 1 : 0); }
  });
}
test('incorrect staging readback never consumes a promotion dispatch', async () => {
  const h = harness({ corrupt: true });
  await assert.rejects(h.service.uploadImage(h.client, context, 'reservation', request(await sampleImage())), /verification failed/);
  assert.ok(!h.calls.includes('dispatch-promotion')); assert.equal(h.calls.at(-1), 'fail');
});
test('published retry returns the same asset without decoding, staging or copying; changed bytes reject', async () => {
  const input = await sampleImage();
  const complete = { complete: true, assetId: 'original', inputDigest: createHash('sha256').update(input).digest('hex') };
  const h = harness({ complete });
  assert.equal((await h.service.uploadImage(h.client, context, 'reservation', request(input))).assetId, 'original');
  assert.deepEqual(h.calls, ['claim', 'body']);
  await assert.rejects(h.service.uploadImage(h.client, context, 'reservation', request('different')), /retry differs/);
  assert.deepEqual(h.calls, ['claim', 'body', 'claim', 'body']);
});
test('retry after permanent deletion returns the terminal identity without recreating bytes', async () => {
  const input = await sampleImage();
  const h = harness({ complete: { complete: true, assetId: 'deleted', terminal: true, state: 'deleted', inputDigest: createHash('sha256').update(input).digest('hex') } });
  const result = await h.service.uploadImage(h.client, context, 'reservation', request(input));
  assert.equal(result.assetId, 'deleted'); assert.equal(result.ready, false); assert.equal(result.terminal, true); assert.equal(result.state, 'deleted');
  assert.deepEqual(h.calls, ['claim', 'body']);
});
function cleanupHarness({ status = '404', removalError = false, unresolved = false } = {}) {
  const calls = [];
  const rpc = async (_client, _name, args) => {
    calls.push(args.p_action);
    if (args.p_action.endsWith('claim')) return { eligible: true, token: 'cleanup-token', bucket: 'private', object: 'unique' };
    assert.equal(args.p_token, 'cleanup-token');
    return { cleaned: !unresolved, observedAbsent: true, unresolved };
  };
  const client = { storage: { from: () => ({ remove: async () => { calls.push('remove'); return { error: removalError ? new Error('uncertain') : null }; }, download: async () => { calls.push('absence'); return { error: { statusCode: status } }; } }) } };
  const cleanup = loadMediaModule('lib/content-media/cleanup.ts', { 'server-only': {}, './server': { rpc, MediaError } });
  return { calls, client, cleanup };
}
test('temporary cleanup preserves unresolved outcomes instead of claiming physical closure', async () => {
  const h = cleanupHarness({ unresolved: true });
  const result = await h.cleanup.cleanTemporary(h.client, 'attempt');
  assert.equal(result.cleaned, false); assert.equal(result.unresolved, true);
  assert.deepEqual(h.calls, ['temporary-claim', 'remove', 'absence', 'temporary-observe']);
});
test('temporary and durable cleanup reject server errors as proof of absence and retain retry state', async () => {
  for (const temporary of [true, false]) {
    const h = cleanupHarness({ status: '503' });
    await assert.rejects(temporary ? h.cleanup.cleanTemporary(h.client, 'attempt') : h.cleanup.deleteOrphan(h.client, 'asset'), /absence not confirmed/);
    assert.equal(h.calls.at(-1), temporary ? 'temporary-retry' : 'retry');
    assert.ok(!h.calls.includes('complete'));
  }
});
test('ordinary durable cleanup confirms absence before finalizing, and a lost removal response remains retryable', async () => {
  const h = cleanupHarness();
  assert.equal((await h.cleanup.deleteOrphan(h.client, 'asset')).deleted, true);
  assert.deepEqual(h.calls, ['claim', 'remove', 'absence', 'complete']);
  const uncertain = cleanupHarness({ removalError: true });
  await assert.rejects(uncertain.cleanup.deleteOrphan(uncertain.client, 'asset'));
  assert.deepEqual(uncertain.calls, ['claim', 'remove', 'retry']);
});
