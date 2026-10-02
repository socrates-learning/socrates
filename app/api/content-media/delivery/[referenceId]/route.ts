import { actorContext, mediaResponse, privateHeaders, serviceClient, uuid } from '@/lib/content-media/server';
import { deliverImage } from '@/lib/content-media/service';
export const runtime = 'nodejs';
export async function GET(request: Request, route: { params: Promise<{ referenceId: string }> }) {
  return mediaResponse(async () => {
    const context = await actorContext(request, false);
    const image = await deliverImage(serviceClient(), context, uuid((await route.params).referenceId));
    return new Response(new Uint8Array(image.bytes), { headers: { ...privateHeaders, 'Content-Type': image.mime, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  });
}
