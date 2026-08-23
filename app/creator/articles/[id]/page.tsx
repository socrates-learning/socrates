import { notFound } from 'next/navigation';
import { ArticleEditorClient } from '@/components/ArticleEditorClient';
import { Header } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activeLibraryContext = await resolveActiveLibraryContext();
  const activeLibrary = activeLibraryContext.library;
  const supabase = await createSupabaseServerClient();
  const { data: article } = await supabase
    .from('articles')
    .select('id, title, slug, summary, status, current_version_id')
    .eq('id', id)
    .maybeSingle();

  if (!article) notFound();

  const { data: version } = article.current_version_id
    ? await supabase
        .from('article_versions')
        .select('body_markdown')
        .eq('id', article.current_version_id)
        .maybeSingle()
    : { data: null };

  const { data: placements } = await supabase
    .from('article_category_placements')
    .select('library_node_id, is_primary, created_at')
    .eq('article_id', article.id)
    .order('is_primary', { ascending: false })
    .order('created_at');
  const { data: articleTags } = await supabase
    .from('article_tags')
    .select('tags(name)')
    .eq('article_id', article.id);
  const { data: articleConcepts } = await supabase
    .from('article_concepts')
    .select(
      `
      id,
      concept_id,
      role,
      section_anchor,
      concepts (
        id,
        name,
        summary,
        concept_type,
        status
      )
    `
    )
    .eq('article_id', article.id)
    .order('sort_order')
    .order('created_at');
  const { data: nodes } = activeLibrary
    ? await supabase
        .from('library_nodes')
        .select('id, library_id, name, node_type, parent_id')
        .eq('library_id', activeLibrary.id)
        .order('name')
    : { data: [] };
  const activeNodeIds = new Set((nodes || []).map((node) => node.id));
  const activeLibraryPlacements = (placements || []).filter((placement) =>
    activeNodeIds.has(placement.library_node_id)
  );
  const placementIds = activeLibraryPlacements.map(
    (placement) => placement.library_node_id
  );
  const primaryPlacement =
    activeLibraryPlacements.find((placement) => placement.is_primary) ||
    activeLibraryPlacements[0] ||
    null;
  const tagNames = (articleTags || []).flatMap((articleTag) => {
    const tag = Array.isArray(articleTag.tags)
      ? articleTag.tags[0]
      : articleTag.tags;

    return tag?.name ? [tag.name] : [];
  });
  const coreConcepts = (articleConcepts || []).map((articleConcept) => {
    const concept = Array.isArray(articleConcept.concepts)
      ? articleConcept.concepts[0] || null
      : articleConcept.concepts;

    return {
      id: articleConcept.id,
      concept_id: articleConcept.concept_id,
      role: articleConcept.role,
      section_anchor: articleConcept.section_anchor,
      concept,
    };
  });

  return (
    <>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section className="stack">
          <div className="panel">
            <h2>Working Library: {activeLibrary?.name || 'No active library'}</h2>
            <LibrarySwitcher
              context={activeLibraryContext}
              returnTo={`/creator/articles/${article.id}`}
            />
          </div>

          {activeLibrary ? (
            <ArticleEditorClient
              activeLibrary={activeLibrary}
              nodes={nodes || []}
              article={{
                id: article.id,
                title: article.title,
                slug: article.slug,
                summary: article.summary || '',
                status: article.status,
                body_markdown: version?.body_markdown || '',
                placement_ids: placementIds,
                primary_placement_id: primaryPlacement?.library_node_id || null,
                tags: tagNames,
                core_concepts: coreConcepts,
              }}
            />
          ) : (
            <div className="panel">
              <p className="muted">
                Choose an active working library before editing articles.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
