import { normalizeDisplayName, normalizePersonalDetails, type PersonalDetails } from '@/lib/personal-profile';
import { ProfileError, profileAccount, profileBody, profilePrivateHeaders, profileResponse, requireProfileOrigin } from '@/lib/personal-profile-server';

export async function PUT(request: Request) {
  return profileResponse(async () => {
    requireProfileOrigin(request);
    const { client } = await profileAccount();
    let displayName: string;
    let details: PersonalDetails | undefined;
    try {
      const input = JSON.parse((await profileBody(request, 4096)).toString('utf8'));
      if (!input || Array.isArray(input) || Object.keys(input).some(key => !['displayName', 'details'].includes(key)) || !Object.hasOwn(input, 'displayName')) throw new Error('Invalid profile fields.');
      displayName = normalizeDisplayName(input.displayName);
      if (Object.hasOwn(input, 'details')) details = normalizePersonalDetails(input.details);
    } catch (error) {
      if (error instanceof ProfileError) throw error;
      throw new ProfileError(400, error instanceof SyntaxError ? 'Invalid profile input.' : error instanceof Error ? error.message : 'Invalid profile input.');
    }
    // Reuse the existing Home name field. No email, identity or role updates.
    const result = await client.auth.updateUser({ data: { full_name: displayName, ...(details ? { socrates_profile: details } : {}) } });
    if (result.error) throw new ProfileError(503, 'Your display name could not be saved. Please try again.');
    // Home reads verified JWT metadata. Refresh it so the greeting changes now.
    const refreshed = await client.auth.refreshSession();
    return Response.json({ displayName, ...(details ? { details } : {}), refreshRequired: Boolean(refreshed.error) }, { headers: profilePrivateHeaders });
  });
}
