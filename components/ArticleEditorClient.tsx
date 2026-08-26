'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  core_concepts: LinkedCoreConcept[];
};

type TagRecord = {
  id: string;
  name: string;
};

type LinkedCoreConcept = {
  id: string;
  concept_id: string;
  role: string;
  section_anchor: string | null;
  concept: {
    id: string;
    name: string;
    summary: string | null;
    concept_type: string | null;
    status: string | null;
  } | null;
};

type AvailableConcept = {
  id: string;
  name: string;
  summary: string | null;
  concept_type: string | null;
  status: string | null;
};

type SourceRecord = {
  id: string;
  title: string;
  source_type: string | null;
  url: string | null;
};

type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
type QuestionStatus = 'draft' | 'published' | 'archived';

type QuestionOption = {
  id: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
};

type QuestionAcceptedAnswer = {
  id: string;
  answer_text: string;
  sort_order: number;
};

type QuestionSourceLink = {
  id: string;
  source_id: string;
  note: string | null;
  source: SourceRecord | null;
};

type QuestionRecord = {
  id: string;
  concept_id: string;
  question_type: QuestionType;
  prompt: string;
  explanation: string | null;
  status: QuestionStatus;
  review_article_concept_id: string | null;
  sort_order: number;
  question_options: QuestionOption[];
  question_accepted_answers: QuestionAcceptedAnswer[];
  question_sources: QuestionSourceLink[];
};

type QuestionOptionForm = {
  clientId: string;
  id?: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
};

type QuestionAnswerForm = {
  clientId: string;
  id?: string;
  answer_text: string;
  sort_order: number;
};

type QuestionForm = {
  id: string;
  isNew: boolean;
  concept_id: string;
  question_type: QuestionType;
  prompt: string;
  explanation: string;
  status: QuestionStatus;
  review_article_concept_id: string;
  sort_order: number;
  options: QuestionOptionForm[];
  acceptedAnswers: QuestionAnswerForm[];
  sourceIds: string[];
  sourceSelectId: string;
};

const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  short_answer: 'Short Answer',
};

function createClientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createBlankOption(sortOrder: number): QuestionOptionForm {
  return {
    clientId: createClientId(),
    option_text: '',
    is_correct: false,
    sort_order: sortOrder,
  };
}

function createBlankAnswer(sortOrder: number): QuestionAnswerForm {
  return {
    clientId: createClientId(),
    answer_text: '',
    sort_order: sortOrder,
  };
}

function normalizeQuestionType(value: string | null): QuestionType {
  if (value === 'true_false' || value === 'short_answer') return value;
  return 'multiple_choice';
}

function normalizeQuestionStatus(value: string | null): QuestionStatus {
  if (value === 'published' || value === 'archived') return value;
  return 'draft';
}

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

function extractArticleSections(markdown: string) {
  const sections: string[] = [];
  const seen = new Set<string>();

  markdown.split(/\r?\n/).forEach((line) => {
    const match = /^(##|###)\s+(.+)$/.exec(line.trim());
    const heading = match?.[2]?.replace(/\s+/g, ' ').trim();

    if (heading && !seen.has(heading.toLowerCase())) {
      seen.add(heading.toLowerCase());
      sections.push(heading);
    }
  });

  return sections;
}

function normalizeJoinedConcept(row: {
  id: string;
  concept_id: string;
  role: string;
  section_anchor: string | null;
  concepts:
    | {
        id: string;
        name: string;
        summary: string | null;
        concept_type: string | null;
        status: string | null;
      }
    | Array<{
        id: string;
        name: string;
        summary: string | null;
        concept_type: string | null;
        status: string | null;
      }>
    | null;
}): LinkedCoreConcept {
  const concept = Array.isArray(row.concepts) ? row.concepts[0] || null : row.concepts;

  return {
    id: row.id,
    concept_id: row.concept_id,
    role: row.role,
    section_anchor: row.section_anchor,
    concept,
  };
}

function normalizeQuestion(row: {
  id: string;
  concept_id: string;
  question_type: string | null;
  prompt: string;
  explanation: string | null;
  status: string | null;
  review_article_concept_id: string | null;
  sort_order: number | null;
  question_options?: Array<{
    id: string;
    option_text: string;
    is_correct: boolean;
    sort_order: number | null;
  }> | null;
  question_accepted_answers?: Array<{
    id: string;
    answer_text: string;
    sort_order: number | null;
  }> | null;
  question_sources?: Array<{
    id: string;
    source_id: string;
    note: string | null;
    sources:
      | SourceRecord
      | SourceRecord[]
      | null;
  }> | null;
}): QuestionRecord {
  const options = (row.question_options || [])
    .map((option) => ({
      id: option.id,
      option_text: option.option_text,
      is_correct: option.is_correct,
      sort_order: option.sort_order || 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const acceptedAnswers = (row.question_accepted_answers || [])
    .map((answer) => ({
      id: answer.id,
      answer_text: answer.answer_text,
      sort_order: answer.sort_order || 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const sourceLinks = (row.question_sources || []).map((sourceLink) => {
    const source = Array.isArray(sourceLink.sources)
      ? sourceLink.sources[0] || null
      : sourceLink.sources;

    return {
      id: sourceLink.id,
      source_id: sourceLink.source_id,
      note: sourceLink.note,
      source,
    };
  });

  return {
    id: row.id,
    concept_id: row.concept_id,
    question_type: normalizeQuestionType(row.question_type),
    prompt: row.prompt,
    explanation: row.explanation,
    status: normalizeQuestionStatus(row.status),
    review_article_concept_id: row.review_article_concept_id,
    sort_order: row.sort_order || 0,
    question_options: options,
    question_accepted_answers: acceptedAnswers,
    question_sources: sourceLinks,
  };
}

function createQuestionForm(
  question: QuestionRecord,
  isNew = false
): QuestionForm {
  const options =
    question.question_type === 'true_false'
      ? [
          {
            clientId: createClientId(),
            id: question.question_options.find((option) => option.option_text === 'True')?.id,
            option_text: 'True',
            is_correct:
              question.question_options.find((option) => option.option_text === 'True')
                ?.is_correct || false,
            sort_order: 0,
          },
          {
            clientId: createClientId(),
            id: question.question_options.find((option) => option.option_text === 'False')?.id,
            option_text: 'False',
            is_correct:
              question.question_options.find((option) => option.option_text === 'False')
                ?.is_correct || false,
            sort_order: 1,
          },
        ]
      : question.question_options.map((option) => ({
          clientId: createClientId(),
          id: option.id,
          option_text: option.option_text,
          is_correct: option.is_correct,
          sort_order: option.sort_order,
        }));

  return {
    id: question.id,
    isNew,
    concept_id: question.concept_id,
    question_type: question.question_type,
    prompt: question.prompt,
    explanation: question.explanation || '',
    status: question.status,
    review_article_concept_id: question.review_article_concept_id || '',
    sort_order: question.sort_order,
    options:
      question.question_type === 'multiple_choice' && options.length === 0
        ? [createBlankOption(0), createBlankOption(1), createBlankOption(2), createBlankOption(3)]
        : options,
    acceptedAnswers:
      question.question_accepted_answers.length > 0
        ? question.question_accepted_answers.map((answer) => ({
            clientId: createClientId(),
            id: answer.id,
            answer_text: answer.answer_text,
            sort_order: answer.sort_order,
          }))
        : [createBlankAnswer(0)],
    sourceIds: question.question_sources.map((sourceLink) => sourceLink.source_id),
    sourceSelectId: '',
  };
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
  const [coreConcepts, setCoreConcepts] = useState(article.core_concepts);
  const [availableConcepts, setAvailableConcepts] = useState<AvailableConcept[]>([]);
  const [availableSources, setAvailableSources] = useState<SourceRecord[]>([]);
  const [questionBanks, setQuestionBanks] = useState<Record<string, QuestionRecord[]>>({});
  const [expandedConceptIds, setExpandedConceptIds] = useState<Set<string>>(new Set());
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());
  const [questionForms, setQuestionForms] = useState<Record<string, QuestionForm>>({});
  const [questionMessageByConcept, setQuestionMessageByConcept] = useState<
    Record<string, string>
  >({});
  const [newQuestionTypeByConcept, setNewQuestionTypeByConcept] = useState<
    Record<string, QuestionType>
  >({});
  const [conceptSearch, setConceptSearch] = useState('');
  const [selectedConceptId, setSelectedConceptId] = useState('');
  const [newConceptName, setNewConceptName] = useState('');
  const [newConceptSummary, setNewConceptSummary] = useState('');
  const [newConceptPlacementIds, setNewConceptPlacementIds] = useState<string[]>(
    article.placement_ids
  );
  const [selectedSectionAnchor, setSelectedSectionAnchor] = useState('');
  const [articleSections, setArticleSections] = useState(
    extractArticleSections(article.body_markdown)
  );
  const [coreConceptMode, setCoreConceptMode] = useState<
    'closed' | 'link' | 'create'
  >('closed');
  const [coreConceptMessage, setCoreConceptMessage] = useState('');
  const [status, setStatus] = useState(article.status);
  const [previewMarkdown, setPreviewMarkdown] = useState(article.body_markdown);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const placementNodes = useMemo(
    () => availableNodes.filter((node) => node.parent_id !== null),
    [availableNodes]
  );

  useEffect(() => {
    async function loadTags() {
      const { data } = await supabase.from('tags').select('id, name').order('name');
      setAvailableTags((data || []) as TagRecord[]);
    }

    loadTags();
  }, []);

  useEffect(() => {
    async function loadSources() {
      const { data, error } = await supabase
        .from('sources')
        .select('id, title, source_type, url')
        .order('title');

      if (error) {
        setCoreConceptMessage(`Unable to load sources: ${error.message}`);
        return;
      }

      setAvailableSources((data || []) as SourceRecord[]);
    }

    loadSources();
  }, []);

  useEffect(() => {
    async function loadAvailableConcepts() {
      const nodeIds = placementNodes.map((node) => node.id);

      if (nodeIds.length === 0) {
        setAvailableConcepts([]);
        return;
      }

      const { data, error } = await supabase
        .from('concept_placements')
        .select(
          `
          concept_id,
          concepts (
            id,
            name,
            summary,
            concept_type,
            status
          )
        `
        )
        .in('library_node_id', nodeIds);

      if (error) {
        setCoreConceptMessage(`Unable to load concepts: ${error.message}`);
        return;
      }

      const conceptsById = new Map<string, AvailableConcept>();

      (data || []).forEach((placement) => {
        const concept = Array.isArray(placement.concepts)
          ? placement.concepts[0]
          : placement.concepts;

        if (concept?.id) {
          conceptsById.set(concept.id, concept);
        }
      });

      setAvailableConcepts(
        [...conceptsById.values()].sort((a, b) => a.name.localeCompare(b.name))
      );
    }

    loadAvailableConcepts();
  }, [activeLibrary.id, placementNodes]);

  useEffect(() => {
    async function loadQuestionBanks() {
      const conceptIds = coreConcepts
        .map((concept) => concept.concept_id)
        .filter(Boolean);

      if (conceptIds.length === 0) {
        setQuestionBanks({});
        return;
      }

      const { data, error } = await supabase
        .from('questions')
        .select(
          `
          id,
          concept_id,
          question_type,
          prompt,
          explanation,
          status,
          review_article_concept_id,
          sort_order,
          created_at,
          question_options (
            id,
            option_text,
            is_correct,
            sort_order
          ),
          question_accepted_answers (
            id,
            answer_text,
            sort_order
          ),
          question_sources (
            id,
            source_id,
            note,
            sources (
              id,
              title,
              source_type,
              url
            )
          )
        `
        )
        .in('concept_id', conceptIds)
        .order('sort_order')
        .order('created_at');

      if (error) {
        setCoreConceptMessage(`Unable to load question banks: ${error.message}`);
        return;
      }

      const banks: Record<string, QuestionRecord[]> = {};

      (data || []).map(normalizeQuestion).forEach((question) => {
        banks[question.concept_id] = [...(banks[question.concept_id] || []), question];
      });

      setQuestionBanks(banks);
    }

    loadQuestionBanks();
  }, [coreConcepts]);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function getMarkdown() {
    return editorRef.current ? editorHtmlToMarkdown(editorRef.current) : '';
  }

  async function loadCoreConcepts(nextArticleId = articleId) {
    if (!nextArticleId) {
      setCoreConcepts([]);
      return;
    }

    const { data, error } = await supabase
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
      .eq('article_id', nextArticleId)
      .order('sort_order')
      .order('created_at');

    if (error) {
      setCoreConceptMessage(`Unable to load core concepts: ${error.message}`);
      return;
    }

    setCoreConcepts((data || []).map(normalizeJoinedConcept));
  }

  function refreshSectionOptions() {
    const sections = extractArticleSections(getMarkdown());
    setArticleSections(sections);
    return sections;
  }

  async function loadQuestionBankForConcept(conceptId: string) {
    const { data, error } = await supabase
      .from('questions')
      .select(
        `
        id,
        concept_id,
        question_type,
        prompt,
        explanation,
        status,
        review_article_concept_id,
        sort_order,
        created_at,
        question_options (
          id,
          option_text,
          is_correct,
          sort_order
        ),
        question_accepted_answers (
          id,
          answer_text,
          sort_order
        ),
        question_sources (
          id,
          source_id,
          note,
          sources (
            id,
            title,
            source_type,
            url
          )
        )
      `
      )
      .eq('concept_id', conceptId)
      .order('sort_order')
      .order('created_at');

    if (error) {
      setQuestionMessageByConcept((current) => ({
        ...current,
        [conceptId]: `Unable to refresh questions: ${error.message}`,
      }));
      return;
    }

    setQuestionBanks((current) => ({
      ...current,
      [conceptId]: (data || []).map(normalizeQuestion),
    }));
  }

  function setQuestionMessage(conceptId: string, nextMessage: string) {
    setQuestionMessageByConcept((current) => ({
      ...current,
      [conceptId]: nextMessage,
    }));
  }

  function toggleExpandedConcept(conceptId: string) {
    setExpandedConceptIds((current) => {
      const next = new Set(current);

      if (next.has(conceptId)) {
        next.delete(conceptId);
      } else {
        next.add(conceptId);
      }

      return next;
    });
  }

  function toggleExpandedQuestion(questionId: string) {
    setExpandedQuestionIds((current) => {
      const next = new Set(current);

      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }

      return next;
    });
  }

  function ensureQuestionForm(question: QuestionRecord) {
    setQuestionForms((current) =>
      current[question.id]
        ? current
        : {
            ...current,
            [question.id]: createQuestionForm(question),
          }
    );
  }

  function updateQuestionForm(
    questionId: string,
    updater: (form: QuestionForm) => QuestionForm
  ) {
    setQuestionForms((current) => {
      const form = current[questionId];

      if (!form) return current;

      return {
        ...current,
        [questionId]: updater(form),
      };
    });
  }

  function addQuestion(conceptLink: LinkedCoreConcept, questionType: QuestionType) {
    const existingQuestions = questionBanks[conceptLink.concept_id] || [];
    const tempId = `new-${conceptLink.concept_id}-${createClientId()}`;
    const question: QuestionRecord = {
      id: tempId,
      concept_id: conceptLink.concept_id,
      question_type: questionType,
      prompt: '',
      explanation: '',
      status: 'draft',
      review_article_concept_id: conceptLink.id,
      sort_order: existingQuestions.length,
      question_options:
        questionType === 'true_false'
          ? [
              { id: 'true', option_text: 'True', is_correct: true, sort_order: 0 },
              { id: 'false', option_text: 'False', is_correct: false, sort_order: 1 },
            ]
          : [],
      question_accepted_answers: [],
      question_sources: [],
    };

    setQuestionBanks((current) => ({
      ...current,
      [conceptLink.concept_id]: [...(current[conceptLink.concept_id] || []), question],
    }));
    setQuestionForms((current) => ({
      ...current,
      [tempId]: createQuestionForm(question, true),
    }));
    setExpandedConceptIds((current) => new Set(current).add(conceptLink.concept_id));
    setExpandedQuestionIds((current) => new Set(current).add(tempId));
    setQuestionMessage(conceptLink.concept_id, 'New draft question ready.');
  }

  function addQuestionOption(questionId: string) {
    updateQuestionForm(questionId, (form) => ({
      ...form,
      options: [...form.options, createBlankOption(form.options.length)],
    }));
  }

  function removeQuestionOption(questionId: string, clientId: string) {
    updateQuestionForm(questionId, (form) => ({
      ...form,
      options: form.options
        .filter((option) => option.clientId !== clientId)
        .map((option, index) => ({ ...option, sort_order: index })),
    }));
  }

  function addAcceptedAnswer(questionId: string) {
    updateQuestionForm(questionId, (form) => ({
      ...form,
      acceptedAnswers: [
        ...form.acceptedAnswers,
        createBlankAnswer(form.acceptedAnswers.length),
      ],
    }));
  }

  function removeAcceptedAnswer(questionId: string, clientId: string) {
    updateQuestionForm(questionId, (form) => ({
      ...form,
      acceptedAnswers: form.acceptedAnswers
        .filter((answer) => answer.clientId !== clientId)
        .map((answer, index) => ({ ...answer, sort_order: index })),
    }));
  }

  function addQuestionSource(questionId: string) {
    updateQuestionForm(questionId, (form) => {
      if (!form.sourceSelectId || form.sourceIds.includes(form.sourceSelectId)) {
        return form;
      }

      return {
        ...form,
        sourceIds: [...form.sourceIds, form.sourceSelectId],
        sourceSelectId: '',
      };
    });
  }

  function removeQuestionSource(questionId: string, sourceId: string) {
    updateQuestionForm(questionId, (form) => ({
      ...form,
      sourceIds: form.sourceIds.filter((id) => id !== sourceId),
    }));
  }

  function questionSourceLinks(questionId: string, conceptId: string) {
    return (
      questionBanks[conceptId]?.find((question) => question.id === questionId)
        ?.question_sources || []
    );
  }

  async function reconcileQuestionSources(
    questionId: string,
    conceptId: string,
    sourceIds: string[]
  ) {
    const existingLinks = questionSourceLinks(questionId, conceptId);
    const existingSourceIds = existingLinks.map((sourceLink) => sourceLink.source_id);

    for (const sourceId of sourceIds.filter((id) => !existingSourceIds.includes(id))) {
      const { error } = await supabase.rpc('attach_question_source', {
        p_question_id: questionId,
        p_source_id: sourceId,
        p_note: null,
      });

      if (error) throw error;
    }

    for (const sourceLink of existingLinks.filter(
      (link) => !sourceIds.includes(link.source_id)
    )) {
      const { error } = await supabase.rpc('detach_question_source', {
        p_question_source_id: sourceLink.id,
      });

      if (error) throw error;
    }
  }

  function questionOptionsPayload(form: QuestionForm) {
    if (form.question_type === 'true_false') {
      const trueOption = form.options.find((option) => option.option_text === 'True');
      const falseOption = form.options.find((option) => option.option_text === 'False');

      return [
        {
          option_text: 'True',
          is_correct: Boolean(trueOption?.is_correct),
          sort_order: 0,
        },
        {
          option_text: 'False',
          is_correct: Boolean(falseOption?.is_correct),
          sort_order: 1,
        },
      ];
    }

    return form.options
      .map((option, index) => ({
        option_text: option.option_text.trim(),
        is_correct: option.is_correct,
        sort_order: index,
      }))
      .filter((option) => option.option_text);
  }

  function acceptedAnswersPayload(form: QuestionForm) {
    return form.acceptedAnswers
      .map((answer, index) => ({
        answer_text: answer.answer_text.trim(),
        sort_order: index,
      }))
      .filter((answer) => answer.answer_text);
  }

  async function saveQuestion(questionId: string) {
    const form = questionForms[questionId];

    if (!form) return;

    if (!form.prompt.trim()) {
      setQuestionMessage(form.concept_id, 'Question prompt is required.');
      return;
    }

    setQuestionMessage(form.concept_id, 'Saving question...');

    try {
      let savedQuestionId = form.id;
      const targetStatus = form.status;
      const interimStatus = targetStatus === 'published' ? 'draft' : targetStatus;

      if (form.isNew) {
        const { data, error } = await supabase.rpc('create_question', {
          p_concept_id: form.concept_id,
          p_question_type: form.question_type,
          p_prompt: form.prompt.trim(),
          p_explanation: form.explanation.trim() || null,
          p_review_article_concept_id: form.review_article_concept_id || null,
          p_sort_order: form.sort_order,
        });

        if (error) throw error;

        savedQuestionId = (data as { id: string }).id;
      } else {
        const { error } = await supabase.rpc('update_question', {
          p_question_id: form.id,
          p_question_type: form.question_type,
          p_prompt: form.prompt.trim(),
          p_explanation: form.explanation.trim() || null,
          p_status: interimStatus,
          p_review_article_concept_id: form.review_article_concept_id || null,
          p_sort_order: form.sort_order,
        });

        if (error) throw error;
      }

      if (form.question_type === 'short_answer') {
        const { error } = await supabase.rpc('replace_question_accepted_answers', {
          p_question_id: savedQuestionId,
          p_answers: acceptedAnswersPayload(form),
        });

        if (error) throw error;

        const { error: optionError } = await supabase.rpc('replace_question_options', {
          p_question_id: savedQuestionId,
          p_options: [],
        });

        if (optionError) throw optionError;
      } else {
        const { error } = await supabase.rpc('replace_question_options', {
          p_question_id: savedQuestionId,
          p_options: questionOptionsPayload(form),
        });

        if (error) throw error;

        const { error: answerError } = await supabase.rpc(
          'replace_question_accepted_answers',
          {
            p_question_id: savedQuestionId,
            p_answers: [],
          }
        );

        if (answerError) throw answerError;
      }

      await reconcileQuestionSources(savedQuestionId, form.concept_id, form.sourceIds);

      if (targetStatus === 'published') {
        const { error } = await supabase.rpc('update_question', {
          p_question_id: savedQuestionId,
          p_question_type: form.question_type,
          p_prompt: form.prompt.trim(),
          p_explanation: form.explanation.trim() || null,
          p_status: 'published',
          p_review_article_concept_id: form.review_article_concept_id || null,
          p_sort_order: form.sort_order,
        });

        if (error) throw error;
      }

      setQuestionMessage(form.concept_id, 'Question saved.');
      setQuestionForms((current) => {
        const next = { ...current };
        delete next[questionId];
        return next;
      });
      setExpandedQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        next.add(savedQuestionId);
        return next;
      });
      await loadQuestionBankForConcept(form.concept_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save question.';
      setQuestionMessage(form.concept_id, `Error: ${message}`);
    }
  }

  async function archiveQuestion(question: QuestionRecord) {
    if (!window.confirm('Archive this question?')) return;

    setQuestionMessage(question.concept_id, 'Archiving question...');

    const { error } = await supabase.rpc('archive_question', {
      p_question_id: question.id,
    });

    if (error) {
      setQuestionMessage(question.concept_id, `Error: ${error.message}`);
      return;
    }

    setQuestionMessage(question.concept_id, 'Question archived.');
    await loadQuestionBankForConcept(question.concept_id);
  }

  async function deleteDraftQuestion(question: QuestionRecord) {
    if (!window.confirm('Delete this draft question?')) return;

    setQuestionMessage(question.concept_id, 'Deleting draft question...');

    if (question.id.startsWith('new-')) {
      setQuestionBanks((current) => ({
        ...current,
        [question.concept_id]: (current[question.concept_id] || []).filter(
          (item) => item.id !== question.id
        ),
      }));
      setQuestionForms((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      setQuestionMessage(question.concept_id, 'Draft question removed.');
      return;
    }

    const { error } = await supabase.rpc('delete_draft_question', {
      p_question_id: question.id,
    });

    if (error) {
      setQuestionMessage(question.concept_id, `Error: ${error.message}`);
      return;
    }

    setQuestionMessage(question.concept_id, 'Draft question deleted.');
    await loadQuestionBankForConcept(question.concept_id);
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
    setArticleSections(extractArticleSections(markdown));
    setMessage(nextStatus === 'published' ? 'Article published.' : 'Draft saved.');
    router.refresh();
  }

  function openCoreConceptMode(mode: 'link' | 'create') {
    refreshSectionOptions();
    setCoreConceptMode(mode);
    setCoreConceptMessage('');
  }

  async function linkExistingConcept() {
    if (!articleId) {
      setCoreConceptMessage('Save the article before linking core concepts.');
      return;
    }

    if (!selectedConceptId) {
      setCoreConceptMessage('Choose a concept to link.');
      return;
    }

    if (coreConcepts.some((concept) => concept.concept_id === selectedConceptId)) {
      setCoreConceptMessage('That concept is already linked to this article.');
      return;
    }

    setCoreConceptMessage('Linking concept...');

    const { error } = await supabase.rpc('link_article_core_concept', {
      p_article_id: articleId,
      p_concept_id: selectedConceptId,
      p_section_anchor: selectedSectionAnchor || null,
      p_role: 'discussed',
    });

    if (error) {
      setCoreConceptMessage(`Error: ${error.message}`);
      return;
    }

    setSelectedConceptId('');
    setSelectedSectionAnchor('');
    setConceptSearch('');
    setCoreConceptMode('closed');
    setCoreConceptMessage('Core concept linked.');
    await loadCoreConcepts(articleId);
  }

  function toggleNewConceptPlacement(placementId: string) {
    setNewConceptPlacementIds((current) =>
      current.includes(placementId)
        ? current.filter((id) => id !== placementId)
        : [...current, placementId]
    );
  }

  async function createNewCoreConcept() {
    if (!articleId) {
      setCoreConceptMessage('Save the article before creating core concepts.');
      return;
    }

    if (!newConceptName.trim()) {
      setCoreConceptMessage('Enter a concept name.');
      return;
    }

    if (newConceptPlacementIds.length === 0) {
      setCoreConceptMessage('Choose at least one concept placement.');
      return;
    }

    setCoreConceptMessage('Creating draft concept...');

    const { error } = await supabase.rpc('create_article_core_concept', {
      p_article_id: articleId,
      p_name: newConceptName.trim(),
      p_summary: newConceptSummary.trim() || null,
      p_active_library_id: activeLibrary.id,
      p_library_node_ids: newConceptPlacementIds,
      p_section_anchor: selectedSectionAnchor || null,
    });

    if (error) {
      setCoreConceptMessage(`Error: ${error.message}`);
      return;
    }

    setNewConceptName('');
    setNewConceptSummary('');
    setSelectedSectionAnchor('');
    setCoreConceptMode('closed');
    setCoreConceptMessage('Draft core concept created and linked.');
    await Promise.all([loadCoreConcepts(articleId), reloadAvailableConcepts()]);
  }

  async function reloadAvailableConcepts() {
    const nodeIds = placementNodes.map((node) => node.id);

    if (nodeIds.length === 0) {
      setAvailableConcepts([]);
      return;
    }

    const { data, error } = await supabase
      .from('concept_placements')
      .select(
        `
        concept_id,
        concepts (
          id,
          name,
          summary,
          concept_type,
          status
        )
      `
      )
      .in('library_node_id', nodeIds);

    if (error) {
      setCoreConceptMessage(`Unable to refresh concept list: ${error.message}`);
      return;
    }

    const conceptsById = new Map<string, AvailableConcept>();

    (data || []).forEach((placement) => {
      const concept = Array.isArray(placement.concepts)
        ? placement.concepts[0]
        : placement.concepts;

      if (concept?.id) {
        conceptsById.set(concept.id, concept);
      }
    });

    setAvailableConcepts(
      [...conceptsById.values()].sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async function unlinkCoreConcept(linkId: string) {
    if (!window.confirm('Unlink this concept from the article? The concept itself will be preserved.')) {
      return;
    }

    setCoreConceptMessage('Unlinking concept...');

    const { error } = await supabase.rpc('unlink_article_core_concept', {
      p_article_concept_id: linkId,
    });

    if (error) {
      setCoreConceptMessage(`Error: ${error.message}`);
      return;
    }

    setCoreConceptMessage('Core concept unlinked. The concept record was not deleted.');
    await loadCoreConcepts();
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

  function sourceTitle(sourceId: string) {
    return availableSources.find((source) => source.id === sourceId)?.title || 'Unknown source';
  }

  function reviewLinksForConcept(conceptId: string) {
    return coreConcepts.filter((concept) => concept.concept_id === conceptId);
  }

  function toggleQuestionEditor(question: QuestionRecord) {
    if (!expandedQuestionIds.has(question.id)) {
      ensureQuestionForm(question);
    }

    toggleExpandedQuestion(question.id);
  }

  function updateQuestionType(questionId: string, questionType: QuestionType) {
    updateQuestionForm(questionId, (form) => ({
      ...form,
      question_type: questionType,
      options:
        questionType === 'true_false'
          ? [
              {
                clientId: createClientId(),
                option_text: 'True',
                is_correct: true,
                sort_order: 0,
              },
              {
                clientId: createClientId(),
                option_text: 'False',
                is_correct: false,
                sort_order: 1,
              },
            ]
          : questionType === 'multiple_choice' && form.options.length === 0
            ? [
                createBlankOption(0),
                createBlankOption(1),
                createBlankOption(2),
                createBlankOption(3),
              ]
            : form.options,
      acceptedAnswers:
        questionType === 'short_answer' && form.acceptedAnswers.length === 0
          ? [createBlankAnswer(0)]
          : form.acceptedAnswers,
    }));
  }

  function renderQuestionEditor(question: QuestionRecord, conceptLink: LinkedCoreConcept) {
    const form = questionForms[question.id];

    if (!form) return null;

    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="form-grid">
          <label>
            Question Type
            <select
              value={form.question_type}
              onChange={(event) =>
                updateQuestionType(question.id, event.target.value as QuestionType)
              }
            >
              <option value="multiple_choice">Multiple Choice</option>
              <option value="true_false">True / False</option>
              <option value="short_answer">Short Answer</option>
            </select>
          </label>

          <label>
            Status
            <select
              value={form.status}
              onChange={(event) =>
                updateQuestionForm(question.id, (current) => ({
                  ...current,
                  status: event.target.value as QuestionStatus,
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>

        <label>
          Prompt
          <textarea
            value={form.prompt}
            onChange={(event) =>
              updateQuestionForm(question.id, (current) => ({
                ...current,
                prompt: event.target.value,
              }))
            }
            placeholder="Which respiratory change would tend to lower PaCO2?"
          />
        </label>

        <br />

        <label>
          Review Link
          <select
            value={form.review_article_concept_id}
            onChange={(event) =>
              updateQuestionForm(question.id, (current) => ({
                ...current,
                review_article_concept_id: event.target.value,
              }))
            }
          >
            <option value="">No specific article section</option>
            {reviewLinksForConcept(conceptLink.concept_id).map((link) => (
              <option key={link.id} value={link.id}>
                {title}
                {link.section_anchor ? ` / ${link.section_anchor}` : ' / Article level'}
              </option>
            ))}
          </select>
        </label>

        <br />

        {form.question_type === 'multiple_choice' && (
          <div className="card">
            <h4>Options</h4>
            <div className="stack">
              {form.options.map((option, index) => (
                <div
                  key={option.clientId}
                  style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  <strong>{String.fromCharCode(65 + index)}</strong>
                  <input
                    value={option.option_text}
                    onChange={(event) =>
                      updateQuestionForm(question.id, (current) => ({
                        ...current,
                        options: current.options.map((currentOption) =>
                          currentOption.clientId === option.clientId
                            ? { ...currentOption, option_text: event.target.value }
                            : currentOption
                        ),
                      }))
                    }
                    placeholder="Answer option"
                  />
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name={`correct-${question.id}`}
                      checked={option.is_correct}
                      onChange={() =>
                        updateQuestionForm(question.id, (current) => ({
                          ...current,
                          options: current.options.map((currentOption) => ({
                            ...currentOption,
                            is_correct: currentOption.clientId === option.clientId,
                          })),
                        }))
                      }
                    />
                    Correct
                  </label>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => removeQuestionOption(question.id, option.clientId)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn ghost"
              type="button"
              style={{ marginTop: 12 }}
              onClick={() => addQuestionOption(question.id)}
            >
              + Add Option
            </button>
          </div>
        )}

        {form.question_type === 'true_false' && (
          <div className="card">
            <h4>Correct Answer</h4>
            {['True', 'False'].map((answer) => (
              <label
                key={answer}
                style={{ display: 'flex', gap: 8, alignItems: 'center' }}
              >
                <input
                  type="radio"
                  name={`true-false-${question.id}`}
                  checked={form.options.some(
                    (option) => option.option_text === answer && option.is_correct
                  )}
                  onChange={() =>
                    updateQuestionForm(question.id, (current) => ({
                      ...current,
                      options: current.options.map((option) => ({
                        ...option,
                        is_correct: option.option_text === answer,
                      })),
                    }))
                  }
                />
                {answer}
              </label>
            ))}
          </div>
        )}

        {form.question_type === 'short_answer' && (
          <div className="card">
            <h4>Accepted Answers</h4>
            <div className="stack">
              {form.acceptedAnswers.map((answer) => (
                <div
                  key={answer.clientId}
                  style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  <input
                    value={answer.answer_text}
                    onChange={(event) =>
                      updateQuestionForm(question.id, (current) => ({
                        ...current,
                        acceptedAnswers: current.acceptedAnswers.map((currentAnswer) =>
                          currentAnswer.clientId === answer.clientId
                            ? { ...currentAnswer, answer_text: event.target.value }
                            : currentAnswer
                        ),
                      }))
                    }
                    placeholder="PaCO2"
                  />
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => removeAcceptedAnswer(question.id, answer.clientId)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn ghost"
              type="button"
              style={{ marginTop: 12 }}
              onClick={() => addAcceptedAnswer(question.id)}
            >
              + Add Accepted Answer
            </button>
          </div>
        )}

        <br />

        <label>
          Explanation
          <textarea
            value={form.explanation}
            onChange={(event) =>
              updateQuestionForm(question.id, (current) => ({
                ...current,
                explanation: event.target.value,
              }))
            }
            placeholder="Explain why the answer is correct."
          />
        </label>

        <br />
        <br />

        <div className="card">
          <h4>Sources</h4>
          {form.sourceIds.length === 0 ? (
            <p className="muted">No sources attached yet.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {form.sourceIds.map((sourceId) => (
                <button
                  className="btn ghost"
                  type="button"
                  key={sourceId}
                  onClick={() => removeQuestionSource(question.id, sourceId)}
                >
                  {sourceTitle(sourceId)} ×
                </button>
              ))}
            </div>
          )}

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Add Existing Source
              <select
                value={form.sourceSelectId}
                onChange={(event) =>
                  updateQuestionForm(question.id, (current) => ({
                    ...current,
                    sourceSelectId: event.target.value,
                  }))
                }
              >
                <option value="">Choose source</option>
                {availableSources.map((source) => (
                  <option
                    key={source.id}
                    value={source.id}
                    disabled={form.sourceIds.includes(source.id)}
                  >
                    {source.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            className="btn ghost"
            type="button"
            style={{ marginTop: 12 }}
            onClick={() => addQuestionSource(question.id)}
          >
            + Add Source
          </button>
          <p className="muted">
            Need a new source? Add it to a concept in Concepts, then return here.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            className="btn primary"
            type="button"
            onClick={() => saveQuestion(question.id)}
          >
            Save Question
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => archiveQuestion(question)}
            disabled={question.id.startsWith('new-')}
          >
            Archive
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => deleteDraftQuestion(question)}
            disabled={!question.id.startsWith('new-') && question.status !== 'draft'}
          >
            Delete Draft
          </button>
        </div>
      </div>
    );
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

      <div className="card">
        <h3>Core Concepts</h3>
        <p className="muted">
          Link reusable Socrates concepts taught by this article. These are structured
          relationships, separate from the article prose.
        </p>

        {!articleId && (
          <p className="muted">Save the article draft before adding core concepts.</p>
        )}

        {coreConcepts.length === 0 ? (
          <p className="muted">No core concepts linked yet.</p>
        ) : (
          <div className="stack">
            {coreConcepts.map((link) => {
              const isConceptExpanded = expandedConceptIds.has(link.concept_id);
              const questions = questionBanks[link.concept_id] || [];
              const newQuestionType =
                newQuestionTypeByConcept[link.concept_id] || 'multiple_choice';

              return (
                <div className="card" key={link.id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => toggleExpandedConcept(link.concept_id)}
                    >
                      {isConceptExpanded ? '▼' : '▶'}
                    </button>
                    <div style={{ flex: 1 }}>
                      <strong>{link.concept?.name || 'Unknown concept'}</strong>
                      <p className="muted" style={{ marginBottom: 0 }}>
                        {link.concept?.concept_type || 'Concept'} ·{' '}
                        {link.concept?.status || 'draft'}
                        {link.section_anchor ? ` · Section: ${link.section_anchor}` : ''}
                      </p>
                      {link.concept?.summary && <p>{link.concept.summary}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link
                        className="btn ghost"
                        href={`/creator/concepts/${link.concept_id}`}
                      >
                        Edit
                      </Link>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => unlinkCoreConcept(link.id)}
                      >
                        Unlink
                      </button>
                    </div>
                  </div>

                  {isConceptExpanded && (
                    <div className="card" style={{ marginTop: 12 }}>
                      <h4>Question Bank</h4>
                      {questions.length === 0 ? (
                        <p className="muted">No questions yet.</p>
                      ) : (
                        <div className="stack">
                          {questions.map((question, questionIndex) => {
                            const isQuestionExpanded = expandedQuestionIds.has(question.id);

                            return (
                              <div className="card" key={question.id}>
                                <button
                                  className="btn ghost"
                                  type="button"
                                  onClick={() => toggleQuestionEditor(question)}
                                >
                                  {isQuestionExpanded ? '▼' : '▶'} Question{' '}
                                  {questionIndex + 1}
                                </button>
                                <p className="muted" style={{ marginBottom: 0 }}>
                                  {questionTypeLabels[question.question_type]} ·{' '}
                                  {question.status}
                                </p>
                                <p>
                                  {question.prompt || 'Untitled draft question'}
                                </p>
                                {isQuestionExpanded &&
                                  renderQuestionEditor(question, link)}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          gap: 10,
                          flexWrap: 'wrap',
                          marginTop: 12,
                        }}
                      >
                        <select
                          value={newQuestionType}
                          onChange={(event) =>
                            setNewQuestionTypeByConcept((current) => ({
                              ...current,
                              [link.concept_id]: event.target.value as QuestionType,
                            }))
                          }
                        >
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="true_false">True / False</option>
                          <option value="short_answer">Short Answer</option>
                        </select>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => addQuestion(link, newQuestionType)}
                        >
                          + Add Question
                        </button>
                      </div>

                      {questionMessageByConcept[link.concept_id] && (
                        <p className="muted">{questionMessageByConcept[link.concept_id]}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            className="btn ghost"
            type="button"
            disabled={!articleId}
            onClick={() => openCoreConceptMode('link')}
          >
            Link Existing Concept
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={!articleId}
            onClick={() => openCoreConceptMode('create')}
          >
            + Create New Concept
          </button>
        </div>

        {coreConceptMode !== 'closed' && (
          <div className="card" style={{ marginTop: 16 }}>
            <h4>
              {coreConceptMode === 'link'
                ? 'Link Existing Concept'
                : 'Create New Core Concept'}
            </h4>

            <label>
              Linked Article Section
              <select
                value={selectedSectionAnchor}
                onChange={(event) => setSelectedSectionAnchor(event.target.value)}
              >
                <option value="">Article-level concept</option>
                {articleSections.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn ghost"
              type="button"
              style={{ marginTop: 8 }}
              onClick={refreshSectionOptions}
            >
              Refresh Sections from Article
            </button>

            {coreConceptMode === 'link' ? (
              <>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label>
                    Search Concepts
                    <input
                      value={conceptSearch}
                      onChange={(event) => setConceptSearch(event.target.value)}
                      placeholder="Search active-library concepts"
                    />
                  </label>
                  <label>
                    Existing Concept
                    <select
                      value={selectedConceptId}
                      onChange={(event) => setSelectedConceptId(event.target.value)}
                    >
                      <option value="">Choose concept</option>
                      {availableConcepts
                        .filter((concept) => {
                          const search = conceptSearch.trim().toLowerCase();
                          return (
                            !search ||
                            concept.name.toLowerCase().includes(search) ||
                            concept.summary?.toLowerCase().includes(search)
                          );
                        })
                        .map((concept) => (
                          <option
                            key={concept.id}
                            value={concept.id}
                            disabled={coreConcepts.some(
                              (linked) => linked.concept_id === concept.id
                            )}
                          >
                            {concept.name}
                            {concept.status ? ` (${concept.status})` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <button
                  className="btn primary"
                  type="button"
                  style={{ marginTop: 12 }}
                  onClick={linkExistingConcept}
                >
                  Link Concept
                </button>
              </>
            ) : (
              <>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label>
                    Concept Name
                    <input
                      value={newConceptName}
                      onChange={(event) => setNewConceptName(event.target.value)}
                      placeholder="The lungs regulate acid-base balance through carbon dioxide"
                    />
                  </label>
                  <label>
                    Concept Summary / Mastery Statement
                    <textarea
                      value={newConceptSummary}
                      onChange={(event) => setNewConceptSummary(event.target.value)}
                      placeholder="Ventilation regulates PaCO2, which changes acid-base balance and affects pH."
                    />
                  </label>
                </div>

                <div style={{ marginTop: 12 }}>
                  <strong>Placement</strong>
                  <p className="muted">
                    Choose one or more active-library locations for this reusable concept.
                  </p>
                  <div className="stack">
                    {placementNodes.map((node) => (
                      <label
                        key={node.id}
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          fontWeight: 400,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newConceptPlacementIds.includes(node.id)}
                          onChange={() => toggleNewConceptPlacement(node.id)}
                        />
                        {getCategoryPath(node, availableNodes)}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  className="btn primary"
                  type="button"
                  style={{ marginTop: 12 }}
                  onClick={createNewCoreConcept}
                >
                  Create Draft Concept
                </button>
              </>
            )}

            <button
              className="btn ghost"
              type="button"
              style={{ marginTop: 12, marginLeft: 8 }}
              onClick={() => setCoreConceptMode('closed')}
            >
              Cancel
            </button>
          </div>
        )}

        {coreConceptMessage && <p className="muted">{coreConceptMessage}</p>}
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
