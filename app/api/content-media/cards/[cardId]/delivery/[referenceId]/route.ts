import { actorContext, mediaResponse, privateHeaders, serviceClient, uuid } from '@/lib/content-media/server';
import { cardImage } from '@/lib/content-media/personal-card-authoring';
export const runtime = 'nodejs';
type Route = { params: Promise<{ cardId: string; referenceId: string }> };
export async function GET(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, false);
    const { cardId, referenceId } = await route.params;
    const result = await cardImage(serviceClient(), { ...actor, card: uuid(cardId) }, uuid(referenceId), false);
    return new Response(new Uint8Array(result.bytes!), { headers: { ...privateHeaders, 'Content-Type': result.metadata.mime, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  });
}
