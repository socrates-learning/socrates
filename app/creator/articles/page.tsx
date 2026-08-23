import Link from 'next/link';
import { Header } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type LibraryNode = {
  id: string;
  name: string;
  parent_id: string | null;
};

type ArticlePlacement = {
  article_id: string;
  library_node_id: string;
  is_primary: boolean;
  articles:
    | {
        id: string;
        title: string;
        slug: string;
        status: string;
        updated_at: string;
      }
    | Array<{
        id: string;
        title: string;
        slug: string;
        status: string;
        updated_at: string;
      }>
    | null;
};

function articleFromPlacement(placement: ArticlePlacement) {
  return Array.isArray(placement.articles)
    ? placement.articles[0] || null
    : placement.articles;
}

function getCategoryPath(nodeId: string, nodes: LibraryNode[]) {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return 'Unplaced';

  const names = [node.name];
  const visited = new Set([node.id]);
  let parentId = node.parent_id;

  while (parentId) {
    const parent = nodes.find((item) => item.id === parentId);
    if (!parent || visited.has(parent.id)) break;
    names.unshift(parent.name);
    visited.add(parent.id);
    parentId = parent.parent_id;
  }

  return names.join(' > ');
}

export default async function ManageArticlesPage() {
  const activeLibraryContext = await resolveActiveLibraryContext();
  const activeLibrary = activeLibraryContext.library;
  const supabase = await createSupabaseServerClient();
  const { data: nodes } = activeLibrary
    ? await supabase
        .from('library_nodes')
        .select('id, name, parent_id')
        .eq('library_id', activeLibrary.id)
        .order('name')
    : { data: [] };
  const nodeIds = (nodes || []).map((node) => node.id);
  const { data: placements } = nodeIds.length
    ? await supabase
        .from('article_category_placements')
        .select(`
          article_id,
          library_node_id,
          is_primary,
          articles!inner (
            id,
            title,
            slug,
            status,
            updated_at
          )
        `)
        .in('library_node_id', nodeIds)
    : { data: [] };
  const articlesById = new Map<
    string,
    {
      id: string;
      title: string;
      slug: string;
      status: string;
      updated_at: string;
      placement: string;
      otherLocationCount: number;
      isPrimary: boolean;
    }
  >();

  for (const placement of (placements || []) as unknown as ArticlePlacement[]) {
    const article = articleFromPlacement(placement);

    if (!article) continue;

    const existing = articlesById.get(article.id);

    if (!existing) {
      articlesById.set(article.id, {
        ...article,
        placement: getCategoryPath(placement.library_node_id, nodes || []),
        otherLocationCount: 0,
        isPrimary: placement.is_primary,
      });
      continue;
    }

    existing.otherLocationCount += 1;

    if (placement.is_primary && !existing.isPrimary) {
      existing.placement = getCategoryPath(placement.library_node_id, nodes || []);
      existing.isPrimary = true;
    }
  }

  const articles = [...articlesById.values()].sort(
    (a, b) =>
      new Date(b.updated_at || 0).getTime() -
      new Date(a.updated_at || 0).getTime()
  );

  return (
    <>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section className="stack">
          <div className="panel">
            <p className="muted" style={{ marginTop: 0 }}>
              Working Library: {activeLibrary?.name || 'No active library'}
            </p>
            <h2>Manage Articles</h2>
            <LibrarySwitcher context={activeLibraryContext} returnTo="/creator/articles" />
          </div>

          <div className="panel">
            <Link className="btn primary" href="/creator/articles/new">
              Create Article
            </Link>
          </div>

          <div className="panel">
            {!activeLibrary ? (
              <p className="muted">Choose an active library to manage articles.</p>
            ) : articles.length === 0 ? (
              <p className="muted">No {activeLibrary.name} articles yet.</p>
            ) : (
              <div className="grid">
                {articles.map((article) => (
                  <div className="card" key={article.id}>
                    <h3>{article.title}</h3>
                    <p className="muted">
                      Status: {article.status}
                      <br />
                      Primary placement: {article.placement}
                      {article.otherLocationCount > 0 && (
                        <>
                          <br />+ {article.otherLocationCount} other{' '}
                          {article.otherLocationCount === 1 ? 'location' : 'locations'}
                        </>
                      )}
                      <br />
                      Updated: {new Date(article.updated_at).toLocaleDateString()}
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Link className="btn ghost" href={`/creator/articles/${article.id}`}>
                        Edit
                      </Link>
                      {article.status === 'published' && (
                        <Link className="btn ghost" href={`/articles/${article.slug}`}>
                          View
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
