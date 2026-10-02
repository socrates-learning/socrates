import { actorContext, boundedBody, mediaResponse, privateHeaders, rpc, serviceClient, uuid, MediaError } from '@/lib/content-media/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return mediaResponse(async () => {
    const context = await actorContext(request, true);
    const body = JSON.parse((await boundedBody(request, 2048)).toString('utf8'));
    if (!['concept', 'question'].includes(body.kind) || uuid(body.libraryId) !== context.library) throw new MediaError(403, 'Media target denied');
    const result = await rpc(serviceClient(), 'm113_reserve', { p_actor: context.actor, p_library: context.library, p_kind: body.kind, p_target: uuid(body.targetId), p_key: uuid(body.idempotencyKey) });
    // Final asset identity exists only after a confirmed promotion is published.
    return Response.json({ reservationId: result.reservationId, expiresAt: result.expiresAt }, { headers: privateHeaders });
  });
}
