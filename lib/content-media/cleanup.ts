import 'server-only';
import { MediaError, rpc, type MediaClient } from './server';

export async function deleteOrphan(client: MediaClient, asset: string) {
  const claim = await rpc(client, 'm113_cleanup', { p_asset: asset, p_action: 'claim' });
  if (!claim.eligible) return { deleted: false };
  try {
    const store = client.storage.from(claim.bucket);
    const { error } = await store.remove([claim.object]);
    if (error) throw new MediaError(503, 'Storage deletion failed');
    // A transport/server/permission error is not proof of absence.
    const readback = await store.download(claim.object);
    if (!readback.error || String((readback.error as { statusCode?: string }).statusCode) !== '404') throw new MediaError(503, 'Storage absence not confirmed');
    await rpc(client, 'm113_cleanup', { p_asset: asset, p_action: 'complete', p_token: claim.token });
    return { deleted: true };
  } catch (error) {
    await rpc(client, 'm113_cleanup', { p_asset: asset, p_action: 'retry', p_token: claim.token }).catch(() => undefined);
    throw error;
  }
}

// Temporary attempts are not content references. Unknown in-flight outcomes
// remain unresolved even after an observed 404; maintenance must revisit them.
export async function cleanTemporary(client: MediaClient, attempt: string) {
  const claim = await rpc(client, 'm113_cleanup', { p_asset: attempt, p_action: 'temporary-claim' });
  if (!claim.eligible) return { cleaned: false };
  try {
    const store = client.storage.from(claim.bucket);
    const removal = await store.remove([claim.object]);
    if (removal.error) throw new MediaError(503, 'Temporary deletion failed');
    const readback = await store.download(claim.object);
    if (!readback.error || String((readback.error as { statusCode?: string }).statusCode) !== '404') throw new MediaError(503, 'Temporary absence not confirmed');
    return await rpc(client, 'm113_cleanup', { p_asset: attempt, p_action: 'temporary-observe', p_token: claim.token });
  } catch (error) {
    await rpc(client, 'm113_cleanup', { p_asset: attempt, p_action: 'temporary-retry', p_token: claim.token }).catch(() => undefined);
    throw error;
  }
}

export async function cleanTemporaryBatch(client: MediaClient) {
  const attempts: string[] = await rpc(client, 'm113_cleanup', { p_asset: null, p_action: 'temporary-list' });
  const results = [];
  for (const attempt of attempts) {
    try { results.push({ attempt, ...await cleanTemporary(client, attempt) }); }
    catch { results.push({ attempt, retry: true }); }
  }
  return { results };
}
