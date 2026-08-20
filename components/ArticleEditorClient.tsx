'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MarkdownContent } from '@/components/MarkdownContent';
import { supabase } from '@/lib/supabase';
import type { ActiveLibrary } from '@/lib/library-context';

type LibraryNode = {
  id: string;
  library_id: string;
  name: string;
  node_type: string | null;
  parent_id: string | null;
};

type ArticleDraft = {
  id: string | null;
  title: string;
  slug: string | null;
  summary: string;
  status: string;
  body_markdown: string;
  placement_ids: string[];
  primary_placement_id: string | null;
  tags: string[];
};

type TagRecord = {
  id: string;
  name: string;
};

function getCategoryPath(node: LibraryNode, nodes: LibraryNode[]) {
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

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inlineMarkdownToHtml(text: string) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToEditorHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      html.push(`<h3>${inlineMarkdownToHtml(trimmed.slice(4))}</h3>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      html.push(`<h2>${inlineMarkdownToHtml(trimmed.slice(3))}</h2>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      const items: string[] = [];

      while (lines[index]?.trim().startsWith('- ')) {
        items.push(`<li>${inlineMarkdownToHtml(lines[index].trim().slice(2))}</li>`);
        index += 1;
      }

      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];

      while (/^\d+\.\s+/.test(lines[index]?.trim() || '')) {
        items.push(
          `<li>${inlineMarkdownToHtml(lines[index].trim().replace(/^\d+\.\s+/, ''))}</li>`
        );
        index += 1;
      }

      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    html.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
    index += 1;
  }

  return html.join('');
}

function textFromNode(node: Node) {
  return (node.textContent || '').replace(/\s+/g, ' ').trim();
}

function inlineHtmlToMarkdown(element: Element) {
  let markdown = '';

  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      markdown += node.textContent || '';
      return;
    }

    if (node instanceof HTMLElement) {
      const text = textFromNode(node);

      if (!text) return;

      if (node.tagName === 'STRONG' || node.tagName === 'B') {
        markdown += `**${text}**`;
      } else if (node.tagName === 'EM' || node.tagName === 'I') {
        markdown += `*${text}*`;
      } else {
        markdown += text;
      }
    }
  });

  return markdown.replace(/\s+/g, ' ').trim();
}

function editorHtmlToMarkdown(root: HTMLElement) {
  const blocks = Array.from(root.children);
  const lines: string[] = [];

  for (const block of blocks) {
    const tag = block.tagName;

    if (tag === 'H2') {
      lines.push(`## ${inlineHtmlToMarkdown(block) || textFromNode(block)}`);
    } else if (tag === 'H3') {
      lines.push(`### ${inlineHtmlToMarkdown(block) || textFromNode(block)}`);
    } else if (tag === 'UL') {
      Array.from(block.children).forEach((item) => {
        lines.push(`- ${inlineHtmlToMarkdown(item) || textFromNode(item)}`);
      });
    } else if (tag === 'OL') {
      Array.from(block.children).forEach((item, itemIndex) => {
        lines.push(`${itemIndex + 1}. ${inlineHtmlToMarkdown(item) || textFromNode(item)}`);
      });
    } else {
      const text = inlineHtmlToMarkdown(block) || textFromNode(block);
      if (text) lines.push(text);
    }

    lines.push('');
  }

  if (lines.length === 0) {
    const text = textFromNode(root);
    return text ? `${text}\n` : '';
  }

  return lines.join('\n').trim();
}

export function ArticleEditorClient({
  article,
  activeLibrary,
  nodes,
}: {
  article: ArticleDraft;
  activeLibrary: ActiveLibrary;
  nodes: LibraryNode[];
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [articleId, setArticleId] = useState(article.id);
  const [slug, setSlug] = useState(article.slug);
  const [title, setTitle] = useState(article.title);
  const [summary, setSummary] = useState(article.summary);
  const [placementIds, setPlacementIds] = useState(article.placement_ids);
  const [primaryPlacementId, setPrimaryPlacementId] = useState(
    article.primary_placement_id || article.placement_ids[0] || ''
  );
  const [newPlacementId, setNewPlacementId] = useState('');
  const [categoryParentId, setCategoryParentId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryMessage, setCategoryMessage] = useState('');
  const [availableNodes, setAvailableNodes] = useState(nodes);
  const [tags, setTags] = useState(article.tags);
  const [tagInput, setTagInput] = useState('');
  const [availableTags, setAvailableTags] = useState<TagRecord[]>([]);
  const [status, setStatus] = useState(article.status);
  const [previewMarkdown, setPreviewMarkdown] = useState(article.body_markdown);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const placementNodes = availableNodes.filter((node) => node.parent_id !== null);

  useEffect(() => {
    async function loadTags() {
      const { data } = await supabase.from('tags').select('id, name').order('name');
      setAvailableTags((data || []) as TagRecord[]);
    }

    loadTags();
  }, []);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function getMarkdown() {
    return editorRef.current ? editorHtmlToMarkdown(editorRef.current) : '';
  }

  async function saveArticle(nextStatus: 'draft' | 'published') {
    const markdown = getMarkdown();

    if (!title.trim() || placementIds.length === 0 || !primaryPlacementId || !markdown.trim()) {
      setMessage('Add a title, at least one placement, and article content before saving.');
      return;
    }

    setIsSaving(true);
    setMessage(nextStatus === 'published' ? 'Publishing article...' : 'Saving draft...');

    const { data, error } = await supabase.rpc('save_article_draft', {
      p_article_id: articleId,
      p_title: title.trim(),
      p_summary: summary.trim() || null,
      p_body_markdown: markdown,
      p_active_library_id: activeLibrary.id,
      p_library_node_ids: placementIds,
      p_primary_library_node_id: primaryPlacementId,
      p_tag_names: tags,
      p_publish: nextStatus === 'published',
    });

    setIsSaving(false);

    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }

    const result = data as {
      article_id: string;
      slug: string;
      status: string;
    };

    setArticleId(result.article_id);
    setSlug(result.slug);
    setStatus(result.status);
    setPreviewMarkdown(markdown);
    setMessage(nextStatus === 'published' ? 'Article published.' : 'Draft saved.');
    router.refresh();
  }

  function addPlacement() {
    if (!newPlacementId || placementIds.includes(newPlacementId)) {
      setMessage('Choose a new, non-duplicate location.');
      return;
    }

    setPlacementIds((current) => [...current, newPlacementId]);
    setPrimaryPlacementId((current) => current || newPlacementId);
    setNewPlacementId('');
    setMessage('');
  }

  function removePlacement(placementId: string) {
    setPlacementIds((current) => current.filter((id) => id !== placementId));

    if (primaryPlacementId === placementId) {
      const nextPrimary = placementIds.find((id) => id !== placementId) || '';
      setPrimaryPlacementId(nextPrimary);
    }
  }

  async function createSubcategory() {
    const parent = availableNodes.find((node) => node.id === categoryParentId);
    const name = categoryName.trim();

    if (!parent || !name) {
      setCategoryMessage('Choose a parent and enter a category name.');
      return;
    }

    if (parent.library_id !== activeLibrary.id) {
      setCategoryMessage('Parent must belong to the working library.');
      return;
    }

    setCategoryMessage('Creating subcategory...');

    const { data, error } = await supabase
      .rpc('create_library_node_in_library', {
        p_library_id: activeLibrary.id,
        p_parent_id: parent.id,
        p_name: name,
        p_node_type: 'topic',
        p_sort_order: 0,
      })
      .single();

    if (error) {
      setCategoryMessage(`Error: ${error.message}`);
      return;
    }

    const createdNode = data as LibraryNode;

    setAvailableNodes((current) =>
      current.some((node) => node.id === createdNode.id)
        ? current
        : [...current, createdNode].sort((a, b) => a.name.localeCompare(b.name))
    );
    setNewPlacementId(createdNode.id);
    setCategoryName('');
    setCategoryMessage('Subcategory created and selected for placement.');
  }

  function normalizeTagName(value: string) {
    return value.replace(/\s+/g, ' ').trim();
  }

  function addTag() {
    const tagName = normalizeTagName(tagInput);

    if (!tagName) return;

    if (tags.some((tag) => tag.toLowerCase() === tagName.toLowerCase())) {
      setMessage('That tag is already attached.');
      setTagInput('');
      return;
    }

    setTags((current) => [...current, tagName]);
    setTagInput('');
    setMessage('');
  }

  function removeTag(tagName: string) {
    setTags((current) => current.filter((tag) => tag !== tagName));
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p className="muted" style={{ marginTop: 0 }}>
            Working Library: {activeLibrary.name}
          </p>
          <h2>{articleId ? 'Edit Article' : 'Create Article'}</h2>
        </div>
        <Link className="btn ghost" href="/creator/articles">
          Manage Articles
        </Link>
      </div>

      <div className="form-grid">
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Isotonic, Hypotonic, and Hypertonic Solutions"
          />
        </label>

      </div>

      <br />

      <div className="card">
        <h3>Article Locations</h3>
        <p className="muted">
          Add every working-library category where learners should be able to find this article.
        </p>

        {placementIds.length === 0 ? (
          <p className="muted">No locations added yet.</p>
        ) : (
          placementIds.map((placementId) => {
            const node = availableNodes.find((item) => item.id === placementId);
            const isPrimary = primaryPlacementId === placementId;

            return (
              <div className="card" key={placementId}>
                <strong>{isPrimary ? 'Primary Location' : 'Additional Location'}</strong>
                <p className="muted">
                  {node ? getCategoryPath(node, availableNodes) : 'Unknown category'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {!isPrimary && (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => setPrimaryPlacementId(placementId)}
                    >
                      Make Primary
                    </button>
                  )}
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => removePlacement(placementId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div className="form-grid">
          <label>
            Add Location
            <select
              value={newPlacementId}
              onChange={(event) => setNewPlacementId(event.target.value)}
            >
              <option value="">Choose location</option>
              {placementNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {getCategoryPath(node, availableNodes)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <br />

        <button className="btn ghost" type="button" onClick={addPlacement}>
          + Add Location
        </button>

        <h3>Create Subcategory</h3>
        <div className="form-grid">
          <label>
            Parent
            <select
              value={categoryParentId}
              onChange={(event) => setCategoryParentId(event.target.value)}
            >
              <option value="">Choose parent</option>
              {availableNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {getCategoryPath(node, availableNodes)}
                </option>
              ))}
            </select>
          </label>

          <label>
            New subcategory
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Acid-Base Disorders"
            />
          </label>
        </div>

        <br />

        <button className="btn ghost" type="button" onClick={createSubcategory}>
          + Create Subcategory
        </button>
        {categoryMessage && <p className="muted">{categoryMessage}</p>}
      </div>

      <br />

      <div className="card">
        <h3>Tags</h3>
        <p className="muted">
          Tags describe related subjects. They are reusable metadata, not hierarchy locations.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tags.map((tag) => (
            <button
              className="btn ghost"
              type="button"
              key={tag}
              onClick={() => removeTag(tag)}
            >
              {tag} ×
            </button>
          ))}
        </div>

        <br />

        <div className="form-grid">
          <label>
            Add Tag
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTag();
                }
              }}
              list="article-tags"
              placeholder="ABG"
            />
            <datalist id="article-tags">
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.name} />
              ))}
            </datalist>
          </label>
        </div>

        <br />

        <button className="btn ghost" type="button" onClick={addTag}>
          + Add Tag
        </button>
      </div>

      <br />

      <label>
        Summary
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Brief learner-facing summary"
        />
      </label>

      <br />
      <br />

      <div className="card">
        <h3>Article Content</h3>
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className="tab" type="button" onClick={() => runCommand('formatBlock', 'p')}>
            Paragraph
          </button>
          <button className="tab" type="button" onClick={() => runCommand('formatBlock', 'h2')}>
            Heading 2
          </button>
          <button className="tab" type="button" onClick={() => runCommand('formatBlock', 'h3')}>
            Heading 3
          </button>
          <button className="tab" type="button" onClick={() => runCommand('bold')}>
            Bold
          </button>
          <button className="tab" type="button" onClick={() => runCommand('italic')}>
            Italic
          </button>
          <button className="tab" type="button" onClick={() => runCommand('insertUnorderedList')}>
            Bullets
          </button>
          <button className="tab" type="button" onClick={() => runCommand('insertOrderedList')}>
            Numbers
          </button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{
            __html: markdownToEditorHtml(article.body_markdown),
          }}
          style={{
            minHeight: 320,
            padding: 16,
            border: '1px solid #d1d5db',
            borderRadius: 12,
            background: '#fff',
          }}
        />
      </div>

      <br />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="btn primary"
          type="button"
          disabled={isSaving}
          onClick={() => saveArticle('draft')}
        >
          Save Draft
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={isSaving}
          onClick={() => setPreviewMarkdown(getMarkdown())}
        >
          Preview
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={isSaving}
          onClick={() => saveArticle('published')}
        >
          Publish
        </button>
        {slug && status === 'published' && (
          <Link className="btn ghost" href={`/articles/${slug}`}>
            Open Published Article
          </Link>
        )}
      </div>

      {message && <p className="muted">{message}</p>}

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Preview</h3>
        <p className="muted">Status: {status}</p>
        {summary && <p>{summary}</p>}
        <MarkdownContent markdown={previewMarkdown} />
      </div>
    </div>
  );
}
