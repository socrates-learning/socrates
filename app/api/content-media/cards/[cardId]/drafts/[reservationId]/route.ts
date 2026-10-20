import { actorContext, mediaResponse, privateHeaders, rpc, serviceClient, uuid } from '@/lib/content-media/server';
import { cardImage, uploadCardImage } from '@/lib/content-media/personal-card-authoring';
export const runtime = 'nodejs';
type Route = { params: Promise<{ cardId: string; reservationId: string }> };
async function context(request: Request, route: Route, mutation: boolean) {
  const actor = await actorContext(request, mutation);
  const params = await route.params;
  return { ...actor, card: uuid(params.cardId), reservation: uuid(params.reservationId) };
}
export async function POST(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await context(request, route, true);
    const result = await uploadCardImage(serviceClient(), actor, actor.reservation, request);
    return Response.json({ assetId: result.assetId, ready: result.ready, terminal: result.terminal === true }, { headers: privateHeaders });
  });
}
export async function GET(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await context(request, route, false);
    const metadataOnly = new URL(request.url).searchParams.get('metadata') === '1';
    const result = await cardImage(serviceClient(), actor, actor.reservation, true, metadataOnly);
    return metadataOnly ? Response.json(result.metadata, { headers: privateHeaders })
      : new Response(new Uint8Array(result.bytes!), { headers: { ...privateHeaders, 'Content-Type': result.metadata.mime, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  });
}
export async function DELETE(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await context(request, route, true);
    const result = await rpc(serviceClient(), 'm136_upload', { p_actor: actor.actor, p_library: actor.library, p_card: actor.card, p_reservation: actor.reservation, p_action: 'cancel' });
    return Response.json(result, { headers: privateHeaders });
  });
}
