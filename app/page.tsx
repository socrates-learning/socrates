import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function Home() {
  const { data: libraries, error } = await supabase
    .from('libraries')
    .select('id, name, description')
    .order('name');

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar activeId="ace-inhibitors" />

        <section className="stack">
          <div className="dashboard">
            <div className="panel hero">
              <h2>Welcome back</h2>
              <p>Socrates is now connected to the learning database foundation.</p>
              <Link className="btn primary" href="/concepts/ace-inhibitors">
                Continue Learning: ACE Inhibitors
              </Link>
            </div>

            <div className="panel">
              <h3>Live Libraries from Supabase</h3>

              {error && <p className="muted">Could not load libraries.</p>}

              {!error &&
                libraries?.map((library) => (
                  <p key={library.id}>
                    <strong>{library.name}</strong>
                    <br />
                    <span className="muted">{library.description}</span>
                  </p>
                ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}