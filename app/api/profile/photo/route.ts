import { ImageValidationError, normalizeImage } from '@/lib/content-media/image';
import { PROFILE_PHOTO_BUCKET, PROFILE_PHOTO_LIMIT, PROFILE_PHOTO_TYPES, validateProfilePhoto } from '@/lib/personal-profile';
import { ProfileError, profileAccount, profileBody, profilePrivateHeaders, profileResponse, requireProfileOrigin } from '@/lib/personal-profile-server';

export const runtime = 'nodejs';

export async function GET() {
  return profileResponse(async () => {
    const { client, user } = await profileAccount();
    const result = await client.storage.from(PROFILE_PHOTO_BUCKET).download(`${user.id}/avatar`);
    if (result.error) {
      if ('statusCode' in result.error && String(result.error.statusCode) === '404') return new Response(null, { status: 204, headers: profilePrivateHeaders });
      throw new ProfileError(503, 'Your photo could not be loaded. Please try again.');
    }
    if (!PROFILE_PHOTO_TYPES.some(type => type === result.data.type) || result.data.size > PROFILE_PHOTO_LIMIT) throw new ProfileError(422, 'Replace this photo with a JPEG, PNG, or WebP image.');
    return new Response(result.data, { headers: { ...profilePrivateHeaders, 'Content-Type': result.data.type, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline' } });
  });
}

export async function PUT(request: Request) {
  return profileResponse(async () => {
    requireProfileOrigin(request);
    const { client, user } = await profileAccount();
    const bytes = await profileBody(request, PROFILE_PHOTO_LIMIT);
    try { validateProfilePhoto({ size: bytes.length, type: request.headers.get('content-type') || '' }); }
    catch (error) { throw new ProfileError(400, (error as Error).message); }
    let image;
    try { image = await normalizeImage(bytes, request.signal); }
    catch (error) {
      if (error instanceof ImageValidationError) throw new ProfileError(400, 'Choose a valid, still JPEG, PNG, or WebP photo up to 4096 pixels per side.');
      throw error;
    }
    // The destination is derived exclusively from the authenticated account.
    // User-scoped Storage RLS remains enforced; no service key or public URL.
    const result = await client.storage.from(PROFILE_PHOTO_BUCKET).upload(`${user.id}/avatar`, image.bytes, { upsert: true, contentType: image.mime, cacheControl: '0' });
    if (result.error) throw new ProfileError(503, 'Your photo could not be saved. Please try again.');
    return Response.json({ saved: true }, { headers: profilePrivateHeaders });
  });
}

export async function DELETE(request: Request) {
  return profileResponse(async () => {
    requireProfileOrigin(request);
    const { client, user } = await profileAccount();
    const result = await client.storage.from(PROFILE_PHOTO_BUCKET).remove([`${user.id}/avatar`]);
    if (result.error) throw new ProfileError(503, 'Your photo could not be removed. Please try again.');
    return Response.json({ removed: true }, { headers: profilePrivateHeaders });
  });
}
