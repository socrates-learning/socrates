import { boundedBody, maintenanceAuthorized, mediaResponse, privateHeaders, serviceClient, uuid } from '@/lib/content-media/server';
import { cleanTemporaryBatch, deleteOrphan } from '@/lib/content-media/cleanup';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return mediaResponse(async () => {
    maintenanceAuthorized(request);
    const body = JSON.parse((await boundedBody(request, 1024)).toString('utf8'));
    const client = serviceClient();
    const result = body.kind === 'temporary' ? await cleanTemporaryBatch(client) : await deleteOrphan(client, uuid(body.assetId));
    return Response.json(result, { headers: privateHeaders });
  });
}
