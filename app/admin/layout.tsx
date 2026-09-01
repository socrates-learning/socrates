import { Header, HeaderSessionProvider } from '@/components/Header';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  if (roleData?.role !== 'admin') {
    return (
      <>
        <Header />
        <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
          <section className="panel">
            <h2>Access Denied</h2>
            <p className="muted">
              Only admins can access administration tools.
            </p>
          </section>
        </main>
      </>
    );
  }

  return (
    <HeaderSessionProvider
      email={user.email ?? 'Account'}
      role={roleData.role}
    >
      {children}
    </HeaderSessionProvider>
  );
}
