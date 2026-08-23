import { ArticleEditorClient } from '@/components/ArticleEditorClient';
import { Header } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function NewArticlePage() {
  const activeLibraryContext = await resolveActiveLibraryContext();
  const activeLibrary = activeLibraryContext.library;
  const supabase = await createSupabaseServerClient();
  const { data: nodes } = activeLibrary
    ? await supabase
        .from('library_nodes')
        .select('id, library_id, name, node_type, parent_id')
        .eq('library_id', activeLibrary.id)
        .order('name')
    : { data: [] };

  return (
    <>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section className="stack">
          <div className="panel">
            <h2>Working Library: {activeLibrary?.name || 'No active library'}</h2>
            <LibrarySwitcher context={activeLibraryContext} returnTo="/creator/articles/new" />
          </div>

          {activeLibrary ? (
            <ArticleEditorClient
              activeLibrary={activeLibrary}
              nodes={nodes || []}
              article={{
                id: null,
                title: '',
                slug: null,
                summary: '',
                status: 'draft',
                body_markdown: '',
                placement_ids: [],
                primary_placement_id: null,
                tags: [],
                core_concepts: [],
              }}
            />
          ) : (
            <div className="panel">
              <p className="muted">
                Choose an active working library before creating an article.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
