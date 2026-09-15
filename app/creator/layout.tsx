import { Header, HeaderSessionProvider } from '@/components/Header';
import {
  canActorAccessSharedCreator,
  getServerCreatorRouteActor,
} from '@/lib/server-creator-route-access';
import { redirect } from 'next/navigation';

export default async function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getServerCreatorRouteActor();
  if (!actor) redirect('/login');
  const { email, role } = actor;

  if (!canActorAccessSharedCreator(actor)) {
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
