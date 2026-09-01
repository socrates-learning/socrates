import { Header, HeaderSessionProvider } from '@/components/Header';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getVerifiedRequestAuthContext } from '@/lib/server-auth-context';
import { redirect } from 'next/navigation';

export default async function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestAuth = await getVerifiedRequestAuthContext();
  let email = requestAuth?.email ?? null;
  let role = requestAuth?.role ?? null;

  if (!requestAuth) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/login');

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    email = user.email ?? 'Account';
    role = roleData?.role ?? null;
  }

  if (role !== 'admin' && role !== 'editor') {
    return (
      <HeaderSessionProvider
        email={email ?? 'Account'}
        role={role}
      >
        <Header />
        <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
          <section className="panel">
            <h2>Access Denied</h2>
            <p className="muted">
              Only editors and admins can access Creator Studio.
            </p>
          </section>
        </main>
      </HeaderSessionProvider>
    );
  }

  return (
    <HeaderSessionProvider
      email={email ?? 'Account'}
      role={role}
    >
      {children}
    </HeaderSessionProvider>
  );
}
