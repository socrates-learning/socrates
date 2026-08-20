import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { MarkdownContent } from '@/components/MarkdownContent';
import { Sidebar } from '@/components/Sidebar';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type LibraryNode = {
  id: string;
  library_id: string;
  name: string;
  parent_id: string | null;
};

function getBreadcrumb(node: LibraryNode | null, nodes: LibraryNode[]) {
  if (!node) return [];

  const breadcrumb = [node.name];
  const visited = new Set([node.id]);
  let parentId = node.parent_id;

  while (parentId) {
    const parent = nodes.find((item) => item.id === parentId);
    if (!parent || visited.has(parent.id)) break;
    breadcrumb.unshift(parent.name);
    visited.add(parent.id);
    parentId = parent.parent_id;
  }

  return breadcrumb;
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: article } = await supabase
    .from('articles')
    .select('id, title, summary, status, published_at, updated_at, published_version_id')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (!article?.published_version_id) notFound();

  const { data: version } = await supabase
    .from('article_versions')
    .select('body_markdown')
    .eq('id', article.published_version_id)
    .maybeSingle();

  if (!version) notFound();

  const { data: placement } = await supabase
    .from('article_category_placements')
    .select('library_node_id')
    .eq('article_id', article.id)
    .eq('is_primary', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  const { data: selectedNode } = placement?.library_node_id
    ? await supabase
        .from('library_nodes')
        .select('id, library_id, name, parent_id')
        .eq('id', placement.library_node_id)
        .maybeSingle()
    : { data: null };
  const { data: nodes } = selectedNode?.library_id
    ? await supabase
        .from('library_nodes')
        .select('id, library_id, name, parent_id')
        .eq('library_id', selectedNode.library_id)
    : { data: [] };
  const breadcrumb = getBreadcrumb(selectedNode, nodes || []);

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar
          activeLibrary={
            selectedNode?.library_id
              ? { id: selectedNode.library_id, name: breadcrumb[0] || 'Library' }
              : null
          }
        />
        <article className="panel">
          {breadcrumb.length > 0 && (
            <p className="muted" style={{ marginTop: 0 }}>
              {breadcrumb.join(' › ')}
            </p>
          )}
          <h1>{article.title}</h1>
          {article.summary && <p>{article.summary}</p>}
          <p className="muted">
            Published:{' '}
            {article.published_at
              ? new Date(article.published_at).toLocaleDateString()
              : 'Recently'}
          </p>
          <MarkdownContent markdown={version.body_markdown} />
        </article>
      </main>
    </>
  );
}
