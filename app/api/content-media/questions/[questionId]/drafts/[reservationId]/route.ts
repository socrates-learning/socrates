import { actorContext, mediaResponse, privateHeaders, rpc, serviceClient, uuid, MediaError } from '@/lib/content-media/server';
import { questionPreview, uploadQuestionDraft } from '@/lib/content-media/question-authoring';
export const runtime = 'nodejs';
type Route = { params: Promise<{ questionId: string; reservationId: string }> };

export async function GET(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, false);
    const { questionId, reservationId } = await route.params;
    const query = new URL(request.url).searchParams;
    if (uuid(query.get('libraryId')) !== actor.library) throw new MediaError(403, 'Preview context denied');
    const metadataOnly = query.get('metadata') === '1';
    const result = await questionPreview(serviceClient(), { ...actor, question: questionId === 'new' ? null : uuid(questionId) }, questionId === 'new' ? null : uuid(questionId), uuid(query.get('draftId')), uuid(reservationId), metadataOnly);
    return metadataOnly ? Response.json(result.metadata, { headers: privateHeaders })
      : new Response(new Uint8Array(result.bytes!), { headers: { ...privateHeaders, 'Content-Type': result.metadata.mime, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  });
}

export async function PUT(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, true);
    const { questionId, reservationId } = await route.params;
    // The database derives and locks the real draft from this reservation.
    const result = await uploadQuestionDraft(serviceClient(), { ...actor, question: questionId === 'new' ? null : uuid(questionId) }, uuid(reservationId), request);
    return Response.json({ assetId: result.assetId, ready: result.ready, terminal: result.terminal === true }, { headers: privateHeaders });
  });
}

export async function DELETE(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, true);
    const { questionId, reservationId } = await route.params;
    await rpc(serviceClient(), 'm115_upload', { p_actor: actor.actor, p_library: actor.library, p_reservation: uuid(reservationId), p_question: questionId === 'new' ? null : uuid(questionId), p_action: 'cancel' });
    return Response.json({ cancelled: true }, { headers: privateHeaders });
  });
}
