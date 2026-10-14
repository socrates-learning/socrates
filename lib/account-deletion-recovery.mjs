import { createHash } from 'node:crypto';

// Dependencies are administrative recovery capabilities, never browser input.
// Only a stable independent ledger plus complete verification yields readiness.
export async function reconcileDeletions({ ledger, target, checkpoint, now = () => new Date() }) {
  await target.blockAccess();
  if (!checkpoint.isolated || !/^[0-9a-f]{64}$/.test(checkpoint.backupSha256) || !checkpoint.source || !Number.isFinite(Date.parse(checkpoint.createdAt))) throw new Error('Verified isolated recovery checkpoint required');
  const before = await target.preservationFingerprint();
  const snapshot = await ledger.snapshot();
  if (snapshot.source !== checkpoint.source) throw new Error('Deletion ledger belongs to another application');
  let reconciled = 0;
  for (const event of snapshot.records) {
    // Do not filter out older intents: a pending request may also be in a newer
    // backup. All confirmed intents must end absent before serving users.
    await target.reapply(event.account);
    await target.verifyAbsent(event.account);
    reconciled++;
  }
  if (await target.preservationFingerprint() !== before) throw new Error('Official content or other-account preservation failed');
  const after = await ledger.snapshot();
  if (after.digest !== snapshot.digest) throw new Error('Deletion ledger changed during recovery; retry while traffic is stopped');
  const report = { version: 1, source: checkpoint.source, backupSha256: checkpoint.backupSha256, ledgerSha256: snapshot.digest, target: await target.identity(), reconciled, verifiedAt: now().toISOString(), state: 'verified-isolated' };
  await target.writeReadiness({ ...report, reportSha256: createHash('sha256').update(JSON.stringify(report)).digest('hex') });
  // This deliberately never opens network access or promotes a restored DB.
  return report;
}
