import { actorContext, mediaResponse, privateHeaders, rpc, serviceClient, uuid, MediaError } from '@/lib/content-media/server';
import { conceptPreview, uploadConceptDraft } from '@/lib/content-media/concept-authoring';
export const runtime = 'nodejs';
type Route = { params: Promise<{ conceptId: string; reservationId: string }> };

export async function GET(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, false);
    const { conceptId, reservationId } = await route.params;
    const query = new URL(request.url).searchParams;
    if (uuid(query.get('libraryId')) !== actor.library) throw new MediaError(403, 'Preview context denied');
    const metadataOnly = query.get('metadata') === '1';
    const result = await conceptPreview(serviceClient(), actor, conceptId === 'new' ? null : uuid(conceptId), conceptId === 'new' ? uuid(query.get('draftId')) : null, uuid(reservationId), metadataOnly);
    return metadataOnly ? Response.json(result.metadata, { headers: privateHeaders })
      : new Response(new Uint8Array(result.bytes!), { headers: { ...privateHeaders, 'Content-Type': result.metadata.mime, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  });
}

export async function PUT(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, true);
    const { conceptId, reservationId } = await route.params;
    if (conceptId !== 'new') throw new MediaError(400, 'Use the existing Concept upload route');
    // The database derives and locks the real draft from this reservation.
    const result = await uploadConceptDraft(serviceClient(), actor, uuid(reservationId), request);
    return Response.json({ assetId: result.assetId, ready: result.ready, terminal: result.terminal === true }, { headers: privateHeaders });
  });
}

export async function DELETE(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, true);
    const { conceptId, reservationId } = await route.params;
    if (conceptId !== 'new') throw new MediaError(400, 'Use the existing Concept cancellation route');
    await rpc(serviceClient(), 'm114_upload', { p_actor: actor.actor, p_library: actor.library, p_reservation: uuid(reservationId), p_action: 'cancel' });
    return Response.json({ cancelled: true }, { headers: privateHeaders });
  });
}
