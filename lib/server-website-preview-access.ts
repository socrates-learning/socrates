import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// Request-scoped verification: never trust browser-supplied identity headers or
// user-editable metadata. Reuse the application's Auth, roles and deletion fence.
export const requireAdminWebsitePreview = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect('/login?next=%2Fwebsite');

  const [role, active] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle(),
    supabase.rpc('account_is_active'),
  ]);
  if (role.error || active.error || role.data?.role !== 'admin' || active.data !== true) {
    redirect('/');
  }
});
