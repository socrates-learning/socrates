import { actorContext, boundedBody, mediaResponse, privateHeaders, rpc, serviceClient, uuid, MediaError } from '@/lib/content-media/server';
import { cardMediaRpc } from '@/lib/content-media/personal-card-authoring';
export const runtime = 'nodejs';
type Route = { params: Promise<{ cardId: string }> };

export async function GET(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, false);
    const { cardId } = await route.params;
    const result = await rpc(serviceClient(), 'm136_manifest', { p_actor: actor.actor, p_library: actor.library, p_card: uuid(cardId) });
    return Response.json(result, { headers: privateHeaders });
  });
}

export async function POST(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, true);
    const { cardId } = await route.params;
    let body;
    try { body = JSON.parse((await boundedBody(request, 256 * 1024)).toString('utf8')); }
    catch (error) { if (error instanceof MediaError) throw error; throw new MediaError(400, 'Invalid Card image request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MediaError(400, 'Invalid Card image request');
    const args = { p_actor: actor.actor, p_library: actor.library, p_card: uuid(cardId), p_key: uuid(body.idempotencyKey) };
    let result;
    if (body.action === 'reserve') result = await cardMediaRpc(serviceClient(), 'm136_reserve', args);
    else if (body.action === 'save' && typeof body.revision === 'string' && Number.isFinite(Date.parse(body.revision))) {
      result = await cardMediaRpc(serviceClient(), 'm136_save', { ...args, p_expected: body.revision, p_payload: body.payload });
    } else throw new MediaError(400, 'Unsupported Card image action');
    return Response.json(result, { headers: privateHeaders });
  });
}
