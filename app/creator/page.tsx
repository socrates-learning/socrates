import Link from 'next/link';
import { Header } from '@/components/Header';

export default function CreatorPage() {
  return (
    <>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section
          className="stack"
          style={{ width: 'min(960px, 100%)', margin: '0 auto' }}
        >
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Creator Studio</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Create and manage official Socrates learning content.
            </p>
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            <article className="card">
              <h3 style={{ marginTop: 0 }}>Concepts</h3>
              <p className="muted">Create, browse, and edit concepts.</p>
              <Link className="btn primary" href="/creator/concepts">
                Open Concepts
              </Link>
            </article>

            <article className="card">
              <h3 style={{ marginTop: 0 }}>Articles</h3>
              <p className="muted">Create, browse, and edit articles.</p>
              <Link className="btn primary" href="/creator/articles">
                Open Articles
              </Link>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
