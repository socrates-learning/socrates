import { actorContext, boundedBody, mediaResponse, privateHeaders, rpc, serviceClient, uuid, MediaError } from '@/lib/content-media/server';
import { saveQuestionImages } from '@/lib/content-media/question-authoring';
export const runtime = 'nodejs';
type Route = { params: Promise<{ questionId: string }> };

export async function GET(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, false);
    const { questionId } = await route.params;
    const library = uuid(new URL(request.url).searchParams.get('libraryId'));
    if (library !== actor.library || questionId === 'new') throw new MediaError(403, 'Question read denied');
    const result = await rpc(serviceClient(), 'm115_manifest', { p_actor: actor.actor, p_library: library, p_question: uuid(questionId) });
    return Response.json(result, { headers: privateHeaders });
  });
}

export async function POST(request: Request, route: Route) {
  return mediaResponse(async () => {
    const actor = await actorContext(request, true);
    const { questionId } = await route.params;
    const question = questionId === 'new' ? null : uuid(questionId);
    const body = JSON.parse((await boundedBody(request, 2 * 1024 * 1024)).toString('utf8'));
    if (uuid(body.libraryId) !== actor.library) throw new MediaError(403, 'Question context denied');
    const draft = uuid(body.draftId);
    const version = body.versionId == null ? null : uuid(body.versionId);
    let result;
    if (body.action === 'save') {
      result = await saveQuestionImages(actor.library, question, draft, body.versionId == null ? null : uuid(body.versionId), body.payload);
    } else if (['create', 'read', 'abandon'].includes(body.action)) {
      result = await rpc(serviceClient(), 'm115_draft', { p_actor: actor.actor, p_library: actor.library, p_draft: draft, p_question: question, p_expected_version: version, p_action: body.action });
    } else if (body.action === 'reserve') {
      result = await rpc(serviceClient(), 'm115_reserve', { p_actor: actor.actor, p_library: actor.library, p_draft: draft, p_question: question, p_key: uuid(body.idempotencyKey) });
    } else throw new MediaError(400, 'Unsupported Question image action');
    return Response.json(result, { headers: privateHeaders });
  });
}
