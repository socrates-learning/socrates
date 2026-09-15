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
    if (requestAuth) return requestAuth;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

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
  if (actor.role !== 'editor' && actor.role !== 'admin') redirect('/');
  return actor;
}
