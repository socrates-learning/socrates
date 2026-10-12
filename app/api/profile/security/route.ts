import { createClient } from '@supabase/supabase-js';
import { ProfileError, profileAccount, profileBody, profilePrivateHeaders, profileResponse, requireProfileOrigin } from '@/lib/personal-profile-server';

export async function POST(request: Request) {
  return profileResponse(async () => {
    requireProfileOrigin(request);
    const { client, user } = await profileAccount();
    let input: Record<string, unknown>;
    try {
      input = JSON.parse((await profileBody(request, 4096)).toString('utf8'));
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['action', 'currentPassword', 'email', 'password', 'confirmPassword', 'nonce'].includes(key))) throw new Error();
    } catch (error) {
      if (error instanceof ProfileError) throw error;
      throw new ProfileError(400, 'Invalid account request.');
    }
    if (!['email', 'password', 'reauthenticate'].includes(String(input.action))) throw new ProfileError(400, 'Invalid account action.');
    if (input.action === 'reauthenticate') {
      const result = await client.auth.reauthenticate();
      if (result.error) throw new ProfileError(429, 'The verification code could not be sent. Please wait and try again.');
      return Response.json({ message: 'Check your current email for a verification code.' }, { headers: profilePrivateHeaders });
    }
    const password = input.currentPassword;
    if (!user.email || typeof password !== 'string' || !password || password.length > 1024) throw new ProfileError(400, 'Enter your current password.');
    if (input.action === 'email' && (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.toLowerCase() === user.email.toLowerCase())) throw new ProfileError(400, 'Enter a different, valid email address.');
    if (input.action === 'password') {
      if (typeof input.password !== 'string' || Array.from(input.password).length < 12 || Buffer.byteLength(input.password, 'utf8') > 72) throw new ProfileError(400, 'Use at least 12 characters and no more than 72 bytes for your new password.');
      if (input.password !== input.confirmPassword) throw new ProfileError(400, 'The new passwords do not match.');
      if (input.nonce !== undefined && (typeof input.nonce !== 'string' || !/^\d{6,10}$/.test(input.nonce))) throw new ProfileError(400, 'Enter the verification code from your email.');
    }
    // Verify the current credential through Auth without replacing browser cookies
    // or relying on optional provider configuration for current-password checks.
    const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const verified = await check.auth.signInWithPassword({ email: user.email, password });
    if (verified.error || !verified.data.session) throw new ProfileError(403, 'Your current password could not be verified. Please try again.');
    const sameUser = verified.data.user?.id === user.id;
    // Revoke only this temporary check session before performing an update.
    const cleanup = await check.auth.signOut({ scope: 'local' });
    if (cleanup.error) throw new ProfileError(503, 'Account verification could not finish. Please try again later.');
    if (!sameUser) throw new ProfileError(403, 'Your account could not be verified.');
    const result = input.action === 'email'
      ? await client.auth.updateUser({ email: input.email as string }, { emailRedirectTo: new URL('/auth/callback?next=/profile', request.headers.get('origin')!).href })
      : await client.auth.updateUser({ password: input.password as string, current_password: password, ...(input.nonce ? { nonce: input.nonce as string } : {}) });
    if (result.error) {
      if (result.error.code === 'reauthentication_needed' || result.error.code === 'reauthentication_not_valid') return Response.json({ error: 'Verify the code from your current email to finish changing your password.', reauthenticationRequired: true }, { status: 403, headers: profilePrivateHeaders });
      if (result.error.code === 'weak_password' || result.error.code === 'same_password') throw new ProfileError(400, 'Choose a different password that meets the account password requirements.');
      throw new ProfileError(400, 'The account change could not be completed. Check your details and try again.');
    }
    return Response.json({ message: input.action === 'email' ? 'Check your email inboxes and follow Supabase’s confirmation instructions. Your email stays unchanged until verification completes.' : 'Your password has been updated.' }, { headers: profilePrivateHeaders });
  });
}
