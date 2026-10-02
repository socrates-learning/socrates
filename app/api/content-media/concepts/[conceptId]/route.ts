import { actorContext, boundedBody, mediaResponse, privateHeaders, rpc, serviceClient, uuid, MediaError } from '@/lib/content-media/server';
import { saveConceptImages } from '@/lib/content-media/concept-authoring';
export const runtime = 'nodejs';
type Route = { params: Promise<{ conceptId: string }> };

export async function GET(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, false);
    const { conceptId } = await route.params;
    const library = uuid(new URL(request.url).searchParams.get('libraryId'));
    if (library !== actor.library || conceptId === 'new') throw new MediaError(403, 'Concept read denied');
    const result = await rpc(serviceClient(), 'm114_manifest', { p_actor: actor.actor, p_library: library, p_concept: uuid(conceptId) });
    return Response.json(result, { headers: privateHeaders });
  });
}

export async function POST(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, true);
    const { conceptId } = await route.params;
    const concept = conceptId === 'new' ? null : uuid(conceptId);
    const body = JSON.parse((await boundedBody(request, 2 * 1024 * 1024)).toString('utf8'));
    if (uuid(body.libraryId) !== actor.library) throw new MediaError(403, 'Concept context denied');
    const draft = concept === null ? uuid(body.draftId) : null;
    if (concept !== null && body.draftId != null) throw new MediaError(400, 'Invalid draft context');
    let result;
    if (body.action === 'save') {
      result = await saveConceptImages(actor.library, concept, draft, body.versionId == null ? null : uuid(body.versionId), body.payload);
    } else if (concept === null && ['create', 'read', 'abandon'].includes(body.action)) {
      result = await rpc(serviceClient(), 'm114_draft', { p_actor: actor.actor, p_library: actor.library, p_draft: draft, p_action: body.action });
    } else if (concept === null && body.action === 'reserve') {
      result = await rpc(serviceClient(), 'm114_reserve', { p_actor: actor.actor, p_library: actor.library, p_draft: draft, p_key: uuid(body.idempotencyKey) });
    } else throw new MediaError(400, 'Unsupported Concept image action');
    return Response.json(result, { headers: privateHeaders });
  });
}
