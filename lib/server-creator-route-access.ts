import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import {
  canAccessSharedCreator,
  CREATOR_LEARNER_ALLOWLIST_ENV,
} from '@/lib/creator-route-access';
import type { RequestAuthRole } from '@/lib/request-auth-context';
import { getVerifiedRequestAuthContext } from '@/lib/server-auth-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { assertCreatorQuerySucceeded } from '@/lib/creator-data-access';

export type ServerCreatorRouteActor = {
  userId: string;
  email: string | null;
  displayName: string;
  role: RequestAuthRole | null;
};

function canonicalRole(value: unknown): RequestAuthRole | null {
  return value === 'learner' || value === 'editor' || value === 'admin'
    ? value
    : null;
}

export const getServerCreatorRouteActor = cache(
  async (): Promise<ServerCreatorRouteActor | null> => {
    const requestAuth = await getVerifiedRequestAuthContext();
    const supabase = await createSupabaseServerClient();
    const authResult = requestAuth ? null : await supabase.auth.getUser();
    if (authResult) {
      assertCreatorQuerySucceeded(authResult.error, 'the signed-in Creator user');
    }
    const user = authResult?.data.user;
    // The activity RPC is authenticated-only. Preserve the signed-out redirect
    // instead of turning its expected permission denial into a route error.
    if (!requestAuth && !user) return null;
    // A known role alone is insufficient while an account is inactive or its
    // deletion is pending. This RPC uses the existing account/ownership fence.
    const activity = await supabase.rpc('account_is_active');
    assertCreatorQuerySucceeded(activity.error, 'the active Creator account');
    if (activity.data !== true) return null;
    if (requestAuth) return requestAuth;

    if (!user) return null;

    const roleResult = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    assertCreatorQuerySucceeded(roleResult.error, 'the Creator authorization role');
    const roleData = roleResult.data;

    return {
      userId: user.id,
      email: user.email ?? null,
      displayName:
        (user.user_metadata?.full_name as string | undefined) ||
        (user.email ? user.email.split('@')[0] : 'there'),
      role: canonicalRole(roleData?.role),
    };
  }
);

export function canActorAccessSharedCreator(
  actor: ServerCreatorRouteActor
): boolean {
  if (!actor.role) return false;

  return canAccessSharedCreator({
    userId: actor.userId,
    role: actor.role,
    learnerAllowlist: process.env[CREATOR_LEARNER_ALLOWLIST_ENV],
  });
}

export async function requireStaffCreatorRoute(): Promise<ServerCreatorRouteActor> {
  const actor = await getServerCreatorRouteActor();
  if (!actor) redirect('/login');
  if (actor.role !== 'admin') redirect('/');
  return actor;
}
