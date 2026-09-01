import { Header, HeaderSessionProvider } from '@/components/Header';
import { StudyCreatorClient } from '@/components/StudyCreatorClient';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getVerifiedRequestAuthContext } from '@/lib/server-auth-context';
import { redirect } from 'next/navigation';

export default async function StudyCreatorPage() {
  const requestAuth = await getVerifiedRequestAuthContext();
  let userId = requestAuth?.userId ?? null;
  let email = requestAuth?.email ?? null;
  let role = requestAuth?.role ?? null;

  if (!requestAuth) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/login?next=/study-creator');

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (
      roleData?.role !== 'learner' &&
      roleData?.role !== 'editor' &&
      roleData?.role !== 'admin'
    ) {
      redirect('/pending-approval');
    }

    userId = user.id;
    email = user.email ?? 'Account';
    role = roleData.role;
  }

  if (!userId) redirect('/login?next=/study-creator');

  return (
    <HeaderSessionProvider email={email ?? 'Account'} role={role}>
      <Header />
      <StudyCreatorClient ownerId={userId} />
    </HeaderSessionProvider>
  );
}
