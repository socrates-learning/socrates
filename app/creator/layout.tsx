import { Header } from '@/components/Header';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function CreatorLayout({
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

  if (roleData?.role !== 'admin' && roleData?.role !== 'editor') {
    return (
      <>
        <Header />
        <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
          <section className="panel">
            <h2>Access Denied</h2>
            <p className="muted">
              Only editors and admins can access Creator Studio.
            </p>
          </section>
        </main>
      </>
    );
  }

  return children;
}
