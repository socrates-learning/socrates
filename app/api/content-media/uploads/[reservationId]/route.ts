import { actorContext, mediaResponse, privateHeaders, rpc, serviceClient, uuid } from '@/lib/content-media/server';
import { uploadImage } from '@/lib/content-media/service';
export const runtime = 'nodejs';
export const maxDuration = 60;
type Route = { params: Promise<{ reservationId: string }> };
export async function PUT(request: Request, route: Route) {
  return mediaResponse(async () => {
    const context = await actorContext(request, true);
    const reservation = uuid((await route.params).reservationId);
    return Response.json(await uploadImage(serviceClient(), context, reservation, request), { headers: privateHeaders });
  });
}
export async function DELETE(request: Request, route: Route) {
  return mediaResponse(async () => {
    const context = await actorContext(request, true);
    const result = await rpc(serviceClient(), 'm113_upload', { p_actor: context.actor, p_library: context.library, p_reservation: uuid((await route.params).reservationId), p_action: 'cancel' });
    return Response.json(result, { headers: privateHeaders });
  });
}
