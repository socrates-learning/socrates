// Credentials and receipts must never enter URLs, localStorage or logs.
export function deletionInput(value: unknown): { password: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid deletion request.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['confirmation', 'password'].includes(key)) || input.confirmation !== 'DELETE') throw new Error('Type DELETE to confirm permanent account deletion.');
  if (typeof input.password !== 'string' || !input.password || input.password.length > 1024) throw new Error('Enter your current password.');
  return { password: input.password };
}
export type DeletionStatus = { userId: string; state: 'pending' | 'complete'; objects: { bucket: string; name: string }[] };
export type DeletionService = {
  status: (hash: string) => Promise<DeletionStatus | null>;
  recordIntent: (id: string) => Promise<void>;
  remove: (bucket: string, names: string[]) => Promise<void>;
  deleteIdentity: (id: string) => Promise<void>;
};

// Repeatable external steps precede Auth's atomic application-data cleanup.
export async function continueDeletion(service: DeletionService, hash: string): Promise<void> {
  const status = await service.status(hash);
  if (!status) throw new Error('Deletion verification expired.');
  if (status.state === 'complete') return;
  const buckets = new Map<string, string[]>();
  for (const object of status.objects) {
    if (!['socrates-content-media', 'socrates-profile-photos'].includes(object.bucket) || !object.name || object.name.includes('..')) throw new Error('Unrecognized private media destination.');
    const list = buckets.get(object.bucket) ?? [];
    list.push(object.name); buckets.set(object.bucket, list);
  }
  // The independent, immutable record must be durable before any private
  // bytes or Auth identity disappear. Failure leaves the operation retryable.
  await service.recordIntent(status.userId);
  for (const [bucket, names] of buckets) {
    for (let start = 0; start < names.length; start += 100) await service.remove(bucket, names.slice(start, start + 100));
  }
  // Another retry can finish between our status read and the provider call.
  try { await service.deleteIdentity(status.userId); }
  catch (error) { if ((await service.status(hash))?.state !== 'complete') throw error; }
  if ((await service.status(hash))?.state !== 'complete') throw new Error('Deletion has not completed.');
}
