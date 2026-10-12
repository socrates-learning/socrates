import { isAppearance } from '@/lib/appearance';
import { ProfileError, profileAccount, profileBody, profilePrivateHeaders, profileResponse, requireProfileOrigin } from '@/lib/personal-profile-server';

export async function PUT(request: Request) {
  return profileResponse(async () => {
    requireProfileOrigin(request);
    const { client } = await profileAccount();
    let appearance: unknown;
    try {
      const input = JSON.parse((await profileBody(request, 128)).toString('utf8'));
      if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'appearance')) throw new Error();
      appearance = input.appearance;
    } catch (error) {
      if (error instanceof ProfileError) throw error;
      throw new ProfileError(400, 'Choose one of the four appearance options.');
    }
    if (!isAppearance(appearance)) throw new ProfileError(400, 'Choose one of the four appearance options.');
    // Own cosmetic preference only. Auth metadata never confers authorization.
    const result = await client.auth.updateUser({ data: { socrates_appearance: appearance } });
    if (result.error) throw new ProfileError(503, 'Appearance could not be saved. Please try again.');
    return Response.json({ appearance }, { headers: profilePrivateHeaders });
  });
}
