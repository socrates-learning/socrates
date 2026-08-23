'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { supabase } from '@/lib/supabase';
import type { ActiveLibraryContext } from '@/lib/library-context';

type LibraryNode = {
  id: string;
  library_id: string;
  name: string;
  node_type: string | null;
  parent_id: string | null;
};

type Concept = {
  id: string;
  name: string;
  concept_type: string | null;
  created_by: string | null;
  status: string | null;
};

type ManagedConcept = Concept & {
  importance: string | null;
  difficulty: string | null;
  estimated_time: string | null;
  summary: string | null;
  why_it_matters: string | null;
  status: string | null;
  learn_sections: Array<{
    id: string;
    title: string;
    body: string;
    sort_order: number | null;
  }>;
};

type ConceptEditForm = {
  name: string;
  concept_type: string;
  importance: string;
  difficulty: string;
  estimated_time: string;
  summary: string;
  why_it_matters: string;
  overview: string;
  mechanism: string;
  clinical_uses: string;
  adverse_effects: string;
  contraindications: string;
  key_distinctions: string;
};

type Source = {
  id: string;
  title: string;
  author: string | null;
  url: string | null;
  license: string | null;
  source_type: string | null;
};

const sourceTypes = [
  'public_domain',
  'open_educational_resource',
  'government',
  'original_author',
  'ai_assisted',
  'faculty_notes',
  'other',
];

const relationshipTypes = [
  'related_to',
  'prerequisite_for',
  'treats',
  'causes',
  'acts_on',
  'compares_with',
];

const managedSectionFields = [
  { title: 'Overview', field: 'overview', sort_order: 0 },
  { title: 'Mechanism', field: 'mechanism', sort_order: 1 },
  { title: 'Clinical Uses', field: 'clinical_uses', sort_order: 2 },
  { title: 'Adverse Effects', field: 'adverse_effects', sort_order: 3 },
  { title: 'Contraindications', field: 'contraindications', sort_order: 4 },
  { title: 'Key Distinctions', field: 'key_distinctions', sort_order: 5 },
] as const;

const emptyConceptEditForm: ConceptEditForm = {
  name: '',
  concept_type: '',
  importance: 'Medium',
  difficulty: 'Beginner',
  estimated_time: '',
  summary: '',
  why_it_matters: '',
  overview: '',
  mechanism: '',
  clinical_uses: '',
  adverse_effects: '',
  contraindications: '',
  key_distinctions: '',
};

type LifecycleFilter = 'all' | 'draft' | 'published' | 'archived';

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

  return names.join(' / ');
}

function getDescendantIds(nodeId: string, nodes: LibraryNode[]) {
  const descendants = new Set<string>();

  function visit(parentId: string) {
    const children = nodes.filter((node) => node.parent_id === parentId);

    for (const child of children) {
      if (descendants.has(child.id)) continue;

      descendants.add(child.id);
      visit(child.id);
    }
  }

  visit(nodeId);
  return descendants;
}

function renderKnowledgeTree(
  nodes: LibraryNode[],
  addingChildToId: string | null,
  newChildName: string,
  renamingTopicId: string | null,
  renamedTopicName: string,
  movingTopicId: string | null,
  moveTargetId: string,
  onStartAddChild: (nodeId: string) => void,
  onCancelAddChild: () => void,
  onChildNameChange: (value: string) => void,
  onAddChild: (parentId: string) => void,
  onStartRename: (node: LibraryNode) => void,
  onCancelRename: () => void,
  onRenameNameChange: (value: string) => void,
  onRenameSave: (nodeId: string) => void,
  onStartMove: (nodeId: string) => void,
  onCancelMove: () => void,
  onMoveTargetChange: (value: string) => void,
  onMoveSave: (nodeId: string) => void,

removingTopicId: string | null,
onStartRemove: (nodeId: string) => void,
onCancelRemove: () => void,
onRemoveSave: (nodeId: string) => void,

parentId: string | null = null,
depth = 0
): React.ReactNode {
  const children = nodes
    .filter((node) => node.parent_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (children.length === 0) {
    return null;
  }

  return (
    <div>
      {children.map((node) => (
        <div key={node.id}>
          <div
            style={{
              paddingLeft: `${depth * 20}px`,
              paddingTop: '6px',
              paddingBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span>{node.name}</span>

<button
  className="btn ghost"
  type="button"
  onClick={() => onStartAddChild(node.id)}
>
  + Add Subtopic
</button>

<button
  className="btn ghost"
  type="button"
  onClick={() => onStartRename(node)}
>
  Rename
</button>

<button
  className="btn ghost"
  type="button"
  onClick={() => onStartMove(node.id)}
>
  Move
</button>

<button
  className="btn ghost"
  type="button"
  onClick={() => onStartRemove(node.id)}
>
  Remove
</button>
</div>

{renamingTopicId === node.id && (
  <div
    style={{
      paddingLeft: `${(depth + 1) * 20}px`,
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '8px',
    }}
  >
    <input
      value={renamedTopicName}
      onChange={(event) => onRenameNameChange(event.target.value)}
      aria-label={`Rename topic ${node.name}`}
    />

    <button
      className="btn primary"
      type="button"
      onClick={() => onRenameSave(node.id)}
    >
      Save
    </button>

    <button
      className="btn ghost"
      type="button"
      onClick={onCancelRename}
    >
      Cancel
    </button>
  </div>
)}

          {movingTopicId === node.id && (
  <div
    style={{
      paddingLeft: `${(depth + 1) * 20}px`,
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '8px',
    }}
  >
    <select
      value={moveTargetId}
      onChange={(event) => onMoveTargetChange(event.target.value)}
      aria-label={`Move topic ${node.name}`}
    >
      <option value="">Choose new location</option>

      {nodes
        .filter((candidate) => {
          if (candidate.id === node.id) return false;

          const descendants = getDescendantIds(node.id, nodes);
          if (descendants.has(candidate.id)) return false;

          return true;
        })
        .sort((a, b) =>
          getCategoryPath(a, nodes).localeCompare(
            getCategoryPath(b, nodes)
          )
        )
        .map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {getCategoryPath(candidate, nodes)}
          </option>
        ))}
    </select>

    <button
      className="btn primary"
      type="button"
      onClick={() => onMoveSave(node.id)}
    >
      Move Topic
    </button>

    <button
      className="btn ghost"
      type="button"
      onClick={onCancelMove}
    >
      Cancel
    </button>
  </div>
)}

{removingTopicId === node.id && (
  <div
    style={{
      paddingLeft: `${(depth + 1) * 20}px`,
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '8px',
    }}
  >
    <span>
      Remove “{node.name}”? This only works if the topic is empty and unused.
    </span>

    <button
      className="btn primary"
      type="button"
      onClick={() => onRemoveSave(node.id)}
    >
      Remove Topic
    </button>

    <button
      className="btn ghost"
      type="button"
      onClick={onCancelRemove}
    >
      Cancel
    </button>
  </div>
)}

          {addingChildToId === node.id && (
            <div
              style={{
                paddingLeft: `${(depth + 1) * 20}px`,
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <input
                value={newChildName}
                onChange={(event) => onChildNameChange(event.target.value)}
               placeholder="New subtopic"
              />

              <button
                className="btn primary"
                type="button"
                onClick={() => onAddChild(node.id)}
              >
                Add
              </button>

              <button
                className="btn ghost"
                type="button"
                onClick={onCancelAddChild}
              >
                Cancel
              </button>
            </div>
          )}

         {renderKnowledgeTree(
  nodes,
  addingChildToId,
  newChildName,
  renamingTopicId,
  renamedTopicName,
  movingTopicId,
  moveTargetId,
  onStartAddChild,
  onCancelAddChild,
  onChildNameChange,
  onAddChild,
  onStartRename,
  onCancelRename,
  onRenameNameChange,
  onRenameSave,
  onStartMove,
  onCancelMove,
  onMoveTargetChange,
  onMoveSave,
  removingTopicId,
  onStartRemove,
  onCancelRemove,
  onRemoveSave,
  node.id,
  depth + 1
)}
        </div>
      ))}
    </div>
  );
}

export function CreatorStudioClient({
  activeLibraryContext,
  initialConceptId,
  children,
}: {
  activeLibraryContext: ActiveLibraryContext;
  initialConceptId?: string;
  children?: React.ReactNode;
}) {
  const activeLibrary = activeLibraryContext.library;
  const [workflow, setWorkflow] = useState<
    | 'dashboard'
    | 'create'
    | 'edit'
    | 'relationships'
    | 'sources'
    | 'categories'
  >('dashboard');
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [status, setStatus] = useState('');
  const [assignStatus, setAssignStatus] = useState('');
  const [sourceStatus, setSourceStatus] = useState('');
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);
  const [attributionStatus, setAttributionStatus] = useState('');
  const [relationshipStatus, setRelationshipStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [ownedConcepts, setOwnedConcepts] = useState<ManagedConcept[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [conceptSearch, setConceptSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] =
    useState<LifecycleFilter>('all');
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [conceptEditForm, setConceptEditForm] = useState<ConceptEditForm>(
    emptyConceptEditForm
  );
  const [managementStatus, setManagementStatus] = useState('');
  const [categoryStatus, setCategoryStatus] = useState('');
  const [addingChildToId, setAddingChildToId] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState('');
  const [renamingTopicId, setRenamingTopicId] = useState<string | null>(null);
  const [renamedTopicName, setRenamedTopicName] = useState('');
  const [movingTopicId, setMovingTopicId] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [removingTopicId, setRemovingTopicId] = useState<string | null>(null);

  useEffect(() => {
    function openCreatorDashboard() {
      setWorkflow('dashboard');
    }

    window.addEventListener('socrates-open-creator-dashboard', openCreatorDashboard);

    return () => {
      window.removeEventListener(
        'socrates-open-creator-dashboard',
        openCreatorDashboard
      );
    };
  }, []);

  async function loadSources(userId: string) {
    const { data, error } = await supabase
      .from('sources')
      .select('id, title, author, url, license, source_type')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) {
      setSourceStatus(`Unable to load sources: ${error.message}`);
      return;
    }

    setSources(data || []);
  }

  async function loadConcepts(conceptIds: string[]) {
    if (activeLibrary && conceptIds.length === 0) {
      setConcepts([]);
      return;
    }

    let query = supabase
      .from('concepts')
      .select('id, name, concept_type, created_by, status')
      .order('name');

    if (activeLibrary) {
      query = query.in('id', conceptIds);
    }

    const { data, error } = await query;

    if (error) {
      setManagementStatus(`Unable to load concepts: ${error.message}`);
      return;
    }

    setConcepts(data || []);
  }

  async function loadManagedConcepts(conceptIds: string[]) {
    if (activeLibrary && conceptIds.length === 0) {
      setOwnedConcepts([]);
      return;
    }

    let query = supabase
      .from('concepts')
      .select(`
        id,
        name,
        concept_type,
        created_by,
        importance,
        difficulty,
        estimated_time,
        summary,
        why_it_matters,
        status,
        learn_sections (
          id,
          title,
          body,
          sort_order
        )
      `)
      .order('name');

    if (activeLibrary) {
      query = query.in('id', conceptIds);
    }

    const { data, error } = await query;

    if (error) {
      setManagementStatus(`Unable to load concepts: ${error.message}`);
      return;
    }

    const managedData = data || [];
    setOwnedConcepts(managedData);

    if (initialConceptId) {
      const initialConcept = managedData.find(
        (concept) => concept.id === initialConceptId
      );

      if (initialConcept) {
        setWorkflow('edit');
        handleEditConcept(initialConcept);
        setManagementStatus('Opened linked core concept from Article Editor.');
      }
    }
  }

  async function loadPageData() {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setLoading(false);
      return;
    }

    setUserId(userData.user.id);

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .single();

    setRole(roleData?.role ?? null);

    await loadSources(userData.user.id);

    const nodeQuery = supabase
      .from('library_nodes')
      .select('id, library_id, name, node_type, parent_id')
      .order('name');

    const { data: nodeData } = activeLibrary
      ? await nodeQuery.eq('library_id', activeLibrary.id)
      : await nodeQuery;
    const nodeIds = (nodeData || []).map((node) => node.id);
    const { data: placementData, error: placementError } = nodeIds.length
      ? await supabase
          .from('concept_placements')
          .select('concept_id')
          .in('library_node_id', nodeIds)
      : { data: [], error: null };

    if (placementError) {
      setManagementStatus(
        `Unable to load active-library placements: ${placementError.message}`
      );
    }

    const conceptIds = [
      ...new Set((placementData || []).map((placement) => placement.concept_id)),
    ];

    setNodes(nodeData || []);
    await Promise.all([loadConcepts(conceptIds), loadManagedConcepts(conceptIds)]);
    setLoading(false);
  }

  useEffect(() => {
    loadPageData();
  }, [activeLibrary?.id]);

  async function handleCreateConcept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    setStatus('Creating draft...');

    const form = new FormData(formElement);
    const libraryNodeId = String(form.get('library_node_id'));
    const name = String(form.get('name') || '').trim();
    const conceptType = String(form.get('concept_type') || '').trim();
    const difficulty = String(form.get('difficulty') || 'Beginner');

    if (!userId || !name || !libraryNodeId || !activeLibrary) {
      setStatus('Please provide a name and choose a category.');
      return;
    }

    const placementNode = nodes.find((node) => node.id === libraryNodeId);

    if (!placementNode || placementNode.library_id !== activeLibrary.id) {
      setStatus('Error: Choose a category from the active working library.');
      return;
    }

    const concept = {
      name,
      concept_type: conceptType || null,
      difficulty,
      is_public: false,
      status: 'draft',
    };

    const { data, error } = await supabase
      .from('concepts')
      .insert(concept)
      .select('id')
      .single();

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    const { error: placementError } = await supabase
      .from('concept_placements')
      .insert({
        concept_id: data.id,
        library_node_id: libraryNodeId,
        sort_order: 0,
      });

    if (placementError) {
      setStatus(`Concept saved, but placement failed: ${placementError.message}`);
      return;
    }

    await loadPageData();
    setEditingConceptId(data.id);
    setConceptEditForm({
      ...emptyConceptEditForm,
      name,
      concept_type: conceptType,
      difficulty,
    });
    setStatus('Draft created. Complete the concept details below.');
    setManagementStatus('');
    setCreateStep(2);
  }

  async function handleAssignExisting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    setAssignStatus('Assigning concept...');

    const form = new FormData(formElement);
    const conceptId = String(form.get('existing_concept_id'));
    const libraryNodeId = String(form.get('existing_library_node_id'));

    if (!conceptId || !libraryNodeId || !activeLibrary) {
      setAssignStatus('Please choose both a concept and a category.');
      return;
    }

    const placementNode = nodes.find((node) => node.id === libraryNodeId);

    if (!placementNode || placementNode.library_id !== activeLibrary.id) {
      setAssignStatus(
        'Error: Choose a category from the active working library.'
      );
      return;
    }

    const { error } = await supabase
      .from('concept_placements')
      .insert({
        concept_id: conceptId,
        library_node_id: libraryNodeId,
        sort_order: 0,
      });

    if (error) {
      if (error.message.includes('duplicate')) {
        setAssignStatus('That concept is already assigned to that category.');
        return;
      }

      setAssignStatus(`Error: ${error.message}`);
      return;
    }

    setAssignStatus('Concept assigned to the selected category.');
    formElement.reset();
    await loadPageData();
  }

  async function handleCategoryCreate(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('category_name') || '').trim();
    const parentId = String(form.get('parent_category_id') || '');
    const parent = nodes.find((node) => node.id === parentId);

    if (!name || !parent || !activeLibrary) {
      setCategoryStatus('Error: Provide a name and choose a parent category.');
      return;
    }

    if (parent.library_id !== activeLibrary.id) {
      setCategoryStatus(
        'Error: Choose a parent category from the active working library.'
      );
      return;
    }

    setCategoryStatus('Creating category...');

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
      setCategoryStatus(`Error creating category: ${error.message}`);
      return;
    }

    const createdNode = data as LibraryNode;

    setNodes((current) =>
      current.some((node) => node.id === createdNode.id)
        ? current
        : [...current, createdNode].sort((a, b) => a.name.localeCompare(b.name))
    );
    formElement.reset();
    setCategoryStatus('Category created successfully.');
  }

  async function handleInlineChildCreate(parentId: string) {
  const name = newChildName.trim();
  const parent = nodes.find((node) => node.id === parentId);

  if (!name || !parent || !activeLibrary) {
    setCategoryStatus('Error: Provide a name and choose a valid parent topic.');
    return;
  }

  if (parent.library_id !== activeLibrary.id) {
    setCategoryStatus(
      'Error: Choose a parent topic from the active working library.'
    );
    return;
  }

  setCategoryStatus('Creating child topic...');

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
    setCategoryStatus(`Error creating child topic: ${error.message}`);
    return;
  }

  const createdNode = data as LibraryNode;

  setNodes((current) =>
    current.some((node) => node.id === createdNode.id)
      ? current
      : [...current, createdNode].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
  );

  setAddingChildToId(null);
  setNewChildName('');
  setCategoryStatus('Child topic created successfully.');
}

  function handleStartInlineRename(node: LibraryNode) {
    setRenamingTopicId(node.id);
    setRenamedTopicName(node.name);
  }

  function handleCancelInlineRename() {
    setRenamingTopicId(null);
    setRenamedTopicName('');
  }

  async function handleInlineTopicRename(nodeId: string) {
    const name = renamedTopicName.trim();

    if (!name) {
      setCategoryStatus('Error: Provide a topic name.');
      return;
    }

    setCategoryStatus('Renaming topic...');

    const { data, error } = await supabase
      .from('library_nodes')
      .update({ name })
      .eq('id', nodeId)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      setCategoryStatus(
        `Error renaming topic: ${error?.message || 'the update was not permitted'}`
      );
      return;
    }

    setNodes((current) =>
      current
        .map((node) => (node.id === nodeId ? { ...node, name } : node))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    handleCancelInlineRename();
    setCategoryStatus('Topic renamed successfully.');
  }

  function handleStartInlineMove(nodeId: string) {
  setMovingTopicId(nodeId);
  setMoveTargetId('');
}

function handleCancelInlineMove() {
  setMovingTopicId(null);
  setMoveTargetId('');
}

async function handleInlineTopicMove(nodeId: string) {
  if (!moveTargetId || !activeLibrary) {
    setCategoryStatus('Error: Choose where to move this topic.');
    return;
  }

  setCategoryStatus('Moving topic...');

  const { data, error } = await supabase
    .rpc('move_library_node_in_library', {
      p_library_id: activeLibrary.id,
      p_node_id: nodeId,
      p_new_parent_id: moveTargetId,
    })
    .single();

  if (error) {
    setCategoryStatus(`Error moving topic: ${error.message}`);
    return;
  }

  const movedNode = data as LibraryNode;

  setNodes((current) =>
    current.map((node) =>
      node.id === movedNode.id
        ? { ...node, parent_id: movedNode.parent_id }
        : node
    )
  );

  handleCancelInlineMove();
  setCategoryStatus('Topic moved successfully.');
}

function handleStartInlineRemove(nodeId: string) {
  setRemovingTopicId(nodeId);
}

function handleCancelInlineRemove() {
  setRemovingTopicId(null);
}

async function handleInlineTopicRemove(nodeId: string) {
  if (!activeLibrary) {
    setCategoryStatus('Error: No active library is selected.');
    return;
  }

  setCategoryStatus('Removing topic...');

  const { data, error } = await supabase
    .rpc('delete_empty_library_node_in_library', {
      p_library_id: activeLibrary.id,
      p_node_id: nodeId,
    })
    .single();

  if (error) {
    setCategoryStatus(`Unable to remove topic: ${error.message}`);
    return;
  }

  const deletedNode = data as LibraryNode;

  setNodes((current) =>
    current.filter((node) => node.id !== deletedNode.id)
  );

  handleCancelInlineRemove();
  setCategoryStatus('Topic removed successfully.');
}

async function handleCategoryRename(
  event: React.FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const categoryId = String(form.get('rename_category_id') || '');
  const name = String(form.get('renamed_category_name') || '').trim();

  if (!categoryId || !name) {
    setCategoryStatus('Error: Choose a category and provide its new name.');
    return;
  }

  setCategoryStatus('Renaming category...');

  const { data, error } = await supabase
    .from('library_nodes')
    .update({ name })
    .eq('id', categoryId)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    setCategoryStatus(
      `Error renaming category: ${
        error?.message || 'the update was not permitted'
      }`
    );
    return;
  }

  setNodes((current) =>
    current
      .map((node) => (node.id === categoryId ? { ...node, name } : node))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  formElement.reset();
  setCategoryStatus('Category renamed successfully.');
}

  async function handleSourceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    setSourceStatus('Saving source...');

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      setSourceStatus('Error: You must be signed in to create a source.');
      return;
    }

    const form = new FormData(formElement);
    const optionalValue = (name: string) => {
      const value = String(form.get(name) || '').trim();
      return value || null;
    };
    const title = String(form.get('source_title') || '').trim();

    if (!title) {
      setSourceStatus('Error: Source title is required.');
      return;
    }

    const { error } = await supabase.from('sources').insert({
      title,
      author: optionalValue('source_author'),
      url: optionalValue('source_url'),
      license: optionalValue('source_license'),
      source_type: optionalValue('source_type'),
      created_by: userData.user.id,
    });

    if (error) {
      setSourceStatus(`Error: ${error.message}`);
      return;
    }

    formElement.reset();
    setSourceStatus('Source saved successfully.');
    await loadSources(userData.user.id);
  }

  function handleStartSourceRemove(sourceId: string) {
  setRemovingSourceId(sourceId);
}

function handleCancelSourceRemove() {
  setRemovingSourceId(null);
}

async function handleSourceRemove(sourceId: string) {
  setSourceStatus('Removing source...');

  const { data, error } = await supabase
    .rpc('delete_unused_source', {
      p_source_id: sourceId,
    })
    .single();

  if (error) {
    setSourceStatus(`Unable to remove source: ${error.message}`);
    return;
  }

  const deletedSource = data as Source;

  setSources((current) =>
    current.filter((source) => source.id !== deletedSource.id)
  );

  handleCancelSourceRemove();
  setSourceStatus('Source removed successfully.');
}

  async function handleAttributionSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const formElement = event.currentTarget;
    setAttributionStatus('Saving attribution...');

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      setAttributionStatus('Error: You must be signed in to add attribution.');
      return;
    }

    const form = new FormData(formElement);
    const conceptId = String(form.get('attribution_concept_id') || '');
    const sourceId = String(form.get('attribution_source_id') || '');
    const noteValue = String(form.get('attribution_note') || '').trim();

    if (!conceptId || !sourceId) {
      setAttributionStatus('Error: Choose both a concept and a source.');
      return;
    }

    const { error } = await supabase.from('content_source_notes').insert({
      concept_id: conceptId,
      source_id: sourceId,
      note: noteValue || null,
      created_by: userData.user.id,
    });

    if (error) {
      setAttributionStatus(`Error: ${error.message}`);
      return;
    }

    formElement.reset();
    setAttributionStatus('Source attached to concept successfully.');
  }

  async function handleRelationshipSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sourceConceptId = String(form.get('source_concept_id') || '');
    const targetConceptId = String(form.get('target_concept_id') || '');
    const relationshipType = String(form.get('relationship_type') || '');

    if (!userId) {
      setRelationshipStatus('Error: You must be signed in.');
      return;
    }

    if (!sourceConceptId || !targetConceptId || !relationshipType) {
      setRelationshipStatus('Error: Complete all relationship fields.');
      return;
    }

    if (sourceConceptId === targetConceptId) {
      setRelationshipStatus('Error: Choose two different concepts.');
      return;
    }

    setRelationshipStatus('Saving relationship...');

    const { error } = await supabase.from('concept_relationships').insert({
      source_concept_id: sourceConceptId,
      target_concept_id: targetConceptId,
      relationship_type: relationshipType,
      created_by: userId,
    });

    if (error) {
      if (error.message.includes('duplicate')) {
        setRelationshipStatus('That relationship already exists.');
        return;
      }

      setRelationshipStatus(`Error: ${error.message}`);
      return;
    }

    formElement.reset();
    setRelationshipStatus('Relationship saved successfully.');
  }

  async function handleLifecycleUpdate(
    conceptId: string,
    nextStatus: 'draft' | 'published' | 'archived'
  ) {
    if (!userId) {
      setManagementStatus('Error: You must be signed in.');
      return;
    }

    if (
      nextStatus === 'archived' &&
      !window.confirm(
        'Archive this concept? It will be hidden from normal navigation, but its placements, relationships, notes, reviews, and source links will be preserved.'
      )
    ) {
      return;
    }

    setManagementStatus(`Updating lifecycle to ${nextStatus}...`);

    const { data, error } = await supabase
      .from('concepts')
      .update({
        status: nextStatus,
        is_public: nextStatus === 'published',
      })
      .eq('id', conceptId)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      setManagementStatus(
        `Error updating lifecycle: ${
          error?.message || 'the update was not permitted'
        }`
      );
      return;
    }

    await loadPageData();
    setManagementStatus(`Concept lifecycle updated to ${nextStatus}.`);
  }

  function handleEditConcept(concept: ManagedConcept) {
    const sectionBody = (title: string) =>
      concept.learn_sections.find(
        (section) => section.title.toLowerCase() === title.toLowerCase()
      )?.body || '';

    setEditingConceptId(concept.id);
    setConceptEditForm({
      name: concept.name,
      concept_type: concept.concept_type || '',
      importance: concept.importance || 'Medium',
      difficulty: concept.difficulty || 'Beginner',
      estimated_time: concept.estimated_time || '',
      summary: concept.summary || '',
      why_it_matters: concept.why_it_matters || '',
      overview: sectionBody('Overview'),
      mechanism: sectionBody('Mechanism'),
      clinical_uses: sectionBody('Clinical Uses'),
      adverse_effects: sectionBody('Adverse Effects'),
      contraindications: sectionBody('Contraindications'),
      key_distinctions: sectionBody('Key Distinctions'),
    });
    setManagementStatus('');
  }

  function updateConceptEditField(field: keyof ConceptEditForm, value: string) {
    setConceptEditForm((current) => ({ ...current, [field]: value }));
  }

  async function handleConceptUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const concept = ownedConcepts.find((item) => item.id === editingConceptId);

    if (!concept || !userId) {
      setManagementStatus('Error: Choose a library concept to edit.');
      return;
    }

    const name = conceptEditForm.name.trim();

    if (!name) {
      setManagementStatus('Error: Concept name is required.');
      return;
    }

    setManagementStatus('Saving changes...');

    const { data: updatedConcept, error: conceptError } = await supabase
      .from('concepts')
      .update({
        name,
        concept_type: conceptEditForm.concept_type.trim() || null,
        importance: conceptEditForm.importance,
        difficulty: conceptEditForm.difficulty,
        estimated_time: conceptEditForm.estimated_time.trim() || null,
        summary: conceptEditForm.summary.trim() || null,
        why_it_matters: conceptEditForm.why_it_matters.trim() || null,
      })
      .eq('id', concept.id)
      .select('id')
      .maybeSingle();

    if (conceptError || !updatedConcept) {
      setManagementStatus(
        `Error updating concept: ${
          conceptError?.message || 'the update was not permitted'
        }`
      );
      return;
    }

    for (const sectionField of managedSectionFields) {
      const body = conceptEditForm[sectionField.field].trim();
      const existingSection = concept.learn_sections.find(
        (section) =>
          section.title.toLowerCase() === sectionField.title.toLowerCase()
      );

      if (existingSection && existingSection.body !== body) {
        const { data, error } = await supabase
          .from('learn_sections')
          .update({ body })
          .eq('id', existingSection.id)
          .eq('concept_id', concept.id)
          .select('id')
          .maybeSingle();

        if (error || !data) {
          setManagementStatus(
            `Concept fields saved, but ${sectionField.title} could not be updated: ${
              error?.message || 'the update was not permitted'
            }`
          );
          await loadPageData();
          return;
        }
      } else if (!existingSection && body) {
        const { error } = await supabase.from('learn_sections').insert({
          concept_id: concept.id,
          title: sectionField.title,
          body,
          sort_order: sectionField.sort_order,
          created_by: userId,
        });

        if (error) {
          setManagementStatus(
            `Concept fields saved, but ${sectionField.title} could not be added: ${error.message}`
          );
          await loadPageData();
          return;
        }
      }
    }

    await loadPageData();
    setManagementStatus('Concept changes saved successfully.');
  }

  if (loading) {
    return <p>Loading...</p>;
  }

  if (role !== 'admin' && role !== 'editor') {
    return (
      <>
        <Header />
        <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
          <section className="panel">
            <h2>Access Denied</h2>
            <p className="muted">
              Only Editors and Admins can access Creator Studio.
            </p>
          </section>
        </main>
      </>
    );
  }

  const placementNodes = nodes.filter((node) => node.parent_id !== null);
  const attributionConcepts = concepts;
  const managedConcepts = ownedConcepts.filter((concept) => {
    const matchesSearch = concept.name
      .toLowerCase()
      .includes(conceptSearch.trim().toLowerCase());
    const matchesLifecycle =
      lifecycleFilter === 'all' || (concept.status || 'draft') === lifecycleFilter;

    return matchesSearch && matchesLifecycle;
  });
  const selectedConcept = ownedConcepts.find(
    (concept) => concept.id === editingConceptId
  );

  function openWorkflow(
    nextWorkflow:
      | 'dashboard'
      | 'create'
      | 'edit'
      | 'relationships'
      | 'sources'
      | 'categories'
  ) {
    setWorkflow(nextWorkflow);

    if (nextWorkflow === 'create') {
      setCreateStep(1);
      setEditingConceptId(null);
      setConceptEditForm(emptyConceptEditForm);
      setStatus('');
      setManagementStatus('');
    }
  }

  const conceptEditor = editingConceptId ? (
    <form onSubmit={handleConceptUpdate}>
      <h3>Full Concept Editor</h3>
      {selectedConcept && (
        <p className="muted">
          Editing {selectedConcept.name} · {selectedConcept.status || 'draft'}
        </p>
      )}

      <div className="form-grid">
        <label>
          Name
          <input
            value={conceptEditForm.name}
            onChange={(event) =>
              updateConceptEditField('name', event.target.value)
            }
            required
          />
        </label>

        <label>
          Type
          <input
            value={conceptEditForm.concept_type}
            onChange={(event) =>
              updateConceptEditField('concept_type', event.target.value)
            }
            placeholder="e.g. Drug Class"
          />
        </label>

        <label>
          Importance
          <select
            value={conceptEditForm.importance}
            onChange={(event) =>
              updateConceptEditField('importance', event.target.value)
            }
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </label>

        <label>
          Difficulty
          <select
            value={conceptEditForm.difficulty}
            onChange={(event) =>
              updateConceptEditField('difficulty', event.target.value)
            }
          >
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </label>

        <label>
          Estimated study time
          <input
            value={conceptEditForm.estimated_time}
            onChange={(event) =>
              updateConceptEditField('estimated_time', event.target.value)
            }
            placeholder="e.g. 15 min"
          />
        </label>
      </div>

      <br />

      <label>
        Summary
        <textarea
          value={conceptEditForm.summary}
          onChange={(event) =>
            updateConceptEditField('summary', event.target.value)
          }
        />
      </label>

      <br />

      <label>
        Why this matters
        <textarea
          value={conceptEditForm.why_it_matters}
          onChange={(event) =>
            updateConceptEditField('why_it_matters', event.target.value)
          }
        />
      </label>

      {managedSectionFields.map((sectionField) => (
        <div key={sectionField.field}>
          <br />
          <label>
            {sectionField.title}
            <textarea
              value={conceptEditForm[sectionField.field]}
              onChange={(event) =>
                updateConceptEditField(
                  sectionField.field,
                  event.target.value
                )
              }
            />
          </label>
        </div>
      ))}

      <br />

      <button className="btn primary" type="submit">
        Save Changes
      </button>

      {managementStatus && <p className="muted">{managementStatus}</p>}
    </form>
  ) : null;

  return (
    <>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section className="stack">
          <div className="panel">
            <p className="muted" style={{ marginTop: 0 }}>
              Creator Studio context
            </p>
            <h2>Working Library: {activeLibrary?.name || 'No active library'}</h2>
            <p className="muted">
              Normal category and placement actions are scoped to this library.
            </p>
            {children}
          </div>

          {workflow === 'dashboard' && (
            <div className="panel">
              <h2>Creator Studio</h2>
              <p className="muted">
                Choose the task you want to complete.
              </p>

              <div className="grid">
                <div className="card">
                  <h3>Create Concept</h3>
                  <p className="muted">
                    Start a draft, choose its category, then add full content.
                  </p>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => openWorkflow('create')}
                  >
                    Create Concept
                  </button>
                </div>

	                <div className="card">
	                  <h3>Edit Concepts</h3>
	                  <p className="muted">
	                    Find concepts in the working library and update their content.
	                  </p>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => openWorkflow('edit')}
                  >
                    Edit Concepts
                  </button>
                </div>

                <div className="card">
                  <h3>Build Relationships</h3>
                  <p className="muted">
                    Connect concepts into the knowledge network.
                  </p>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => openWorkflow('relationships')}
                  >
                    Build Relationships
                  </button>
                </div>

                <div className="card">
                  <h3>Manage Sources</h3>
                  <p className="muted">
                    Create reusable sources and attach them to concepts.
                  </p>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => openWorkflow('sources')}
                  >
                    Manage Sources
                  </button>
                </div>

                <div className="card">
                  <h3>Manage Categories</h3>
                  <p className="muted">
                    Create nested categories, rename them, and place concepts.
                  </p>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => openWorkflow('categories')}
                  >
                    Manage Categories
                  </button>
                </div>

                <div className="card">
                  <h3>Create Article</h3>
                  <p className="muted">
                    Start a sourced, concept-linked wiki article.
                  </p>
                  <Link className="btn primary" href="/creator/articles/new">
                    Create Article
                  </Link>
                </div>

                <div className="card">
                  <h3>Manage Articles</h3>
                  <p className="muted">
                    Edit drafts, review revisions, and publish articles.
                  </p>
                  <Link className="btn primary" href="/creator/articles">
                    Manage Articles
                  </Link>
                </div>
              </div>
            </div>
          )}

          {workflow === 'create' && (
            <div className="panel">
              <button
                className="btn ghost"
                type="button"
                onClick={() => openWorkflow('dashboard')}
              >
                Back to Creator Studio
              </button>

              <h2>Create Concept</h2>
              <p className="muted">Step {createStep} of 2</p>

              {createStep === 1 ? (
                <form onSubmit={handleCreateConcept}>
                  <div className="form-grid">
                    <label>
                      Name
                      <input name="name" placeholder="Concept name" required />
                    </label>

                    <label>
                      Type
                      <input
                        name="concept_type"
                        placeholder="e.g. Drug Class"
                      />
                    </label>

                    <label>
                      Category
                      <select name="library_node_id" defaultValue="" required>
                        <option value="" disabled>
                          Choose category
                        </option>
                        {placementNodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {getCategoryPath(node, nodes)}{' '}
                            {node.node_type ? `(${node.node_type})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Difficulty
                      <select name="difficulty" defaultValue="Beginner">
                        <option>Beginner</option>
                        <option>Intermediate</option>
                        <option>Advanced</option>
                      </select>
                    </label>
                  </div>

                  <br />

                  <button className="btn primary" type="submit">
                    Create Draft and Continue
                  </button>

                  {status && <p className="muted">{status}</p>}
                </form>
              ) : (
                <>
                  {status && <p className="muted">{status}</p>}
                  {conceptEditor}
                </>
              )}
            </div>
          )}

          {workflow === 'edit' && (
            <>
              <div className="panel">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => openWorkflow('dashboard')}
                >
                  Back to Creator Studio
                </button>

	                <h2>Library Concepts</h2>
	                <p className="muted">
	                  Search and edit concepts placed in the working library.
	                </p>

	                <div className="form-grid">
	                  <input
	                    type="search"
	                    placeholder="Search concepts by name"
	                    value={conceptSearch}
	                    onChange={(event) => setConceptSearch(event.target.value)}
	                  />

	                  <select
	                    aria-label="Filter concepts by lifecycle"
	                    value={lifecycleFilter}
	                    onChange={(event) =>
	                      setLifecycleFilter(event.target.value as LifecycleFilter)
	                    }
	                  >
	                    <option value="all">All lifecycle states</option>
	                    <option value="draft">Draft</option>
	                    <option value="published">Published</option>
	                    <option value="archived">Archived</option>
	                  </select>
	                </div>

	                <br />
	                <br />

                {managedConcepts.length === 0 ? (
                  <p className="muted">No matching concepts found.</p>
                ) : (
	                  managedConcepts.map((concept) => (
	                    <div className="card" key={concept.id}>
	                      <strong>{concept.name}</strong>
	                      <p className="muted">
	                        {concept.concept_type || 'Concept'} ·{' '}
	                        Lifecycle: {concept.status || 'draft'}
	                        <br />
	                        Creator:{' '}
	                        {concept.created_by === userId
	                          ? 'You'
	                          : concept.created_by
	                            ? concept.created_by.slice(0, 8)
	                            : 'Unknown'}
	                      </p>
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          marginBottom: '10px',
                        }}
                      >
                        {concept.status !== 'published' && (
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              handleLifecycleUpdate(concept.id, 'published')
                            }
                          >
                            Publish
                          </button>
                        )}

                        {concept.status === 'published' && (
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              handleLifecycleUpdate(concept.id, 'draft')
                            }
                          >
                            Move back to draft
                          </button>
                        )}

                        {concept.status === 'archived' ? (
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              handleLifecycleUpdate(concept.id, 'draft')
                            }
                          >
                            Restore to draft
                          </button>
                        ) : (
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              handleLifecycleUpdate(concept.id, 'archived')
                            }
                          >
                            Archive
                          </button>
                        )}
                      </div>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => handleEditConcept(concept)}
                      >
                        Edit
                      </button>
                    </div>
                  ))
                )}

                {conceptEditor}
                {!editingConceptId && managementStatus && (
                  <p className="muted">{managementStatus}</p>
                )}
              </div>

            </>
          )}

          {workflow === 'categories' && (
            <>
              <div className="panel">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => openWorkflow('dashboard')}
                >
                  Back to Creator Studio
                </button>

                <div className="panel">
  <h2>Knowledge Tree</h2>
  <p className="muted">
    Current topic hierarchy for {activeLibrary?.name || 'the active library'}.
  </p>

  {nodes.length === 0 ? (
  <p className="muted">No topics have been created yet.</p>
) : (
  renderKnowledgeTree(
    nodes,
    addingChildToId,
    newChildName,
    renamingTopicId,
    renamedTopicName,
    movingTopicId,
    moveTargetId,
    (nodeId: string) => {
      setAddingChildToId(nodeId);
      setNewChildName('');
    },
    () => {
      setAddingChildToId(null);
      setNewChildName('');
    },
    setNewChildName,
    handleInlineChildCreate,
    handleStartInlineRename,
    handleCancelInlineRename,
    setRenamedTopicName,
    handleInlineTopicRename,
    handleStartInlineMove,
    handleCancelInlineMove,
    setMoveTargetId,
    handleInlineTopicMove,
    removingTopicId,
    handleStartInlineRemove,
    handleCancelInlineRemove,
    handleInlineTopicRemove
  )
)}
</div>
                <h2>Manage Categories</h2>
                <p className="muted">
                  Nest categories to any depth by choosing an existing parent.
                </p>

                <h3>Create Category</h3>
                <form onSubmit={handleCategoryCreate}>
                  <div className="form-grid">
                    <input
                      name="category_name"
                      placeholder="Category name"
                      required
                    />

                    <select name="parent_category_id" defaultValue="" required>
                      <option value="" disabled>
                        Choose parent category
                      </option>
                      {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {getCategoryPath(node, nodes)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <br />

                  <button className="btn primary" type="submit">
                    Create Category
                  </button>
                </form>

                <h3>Rename Category</h3>
                <form onSubmit={handleCategoryRename}>
                  <div className="form-grid">
                    <select name="rename_category_id" defaultValue="" required>
                      <option value="" disabled>
                        Choose category
                      </option>
                      {placementNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {getCategoryPath(node, nodes)}
                        </option>
                      ))}
                    </select>

                    <input
                      name="renamed_category_name"
                      placeholder="New category name"
                      required
                    />
                  </div>

                  <br />

                  <button className="btn primary" type="submit">
                    Rename Category
                  </button>
                </form>

                {categoryStatus && (
                  <p className="muted">{categoryStatus}</p>
                )}
              </div>

              <div className="panel">
                <h2>Assign Concept to Category</h2>
                <p className="muted">
                  One concept can appear in as many categories as needed.
                </p>

                <form onSubmit={handleAssignExisting}>
                  <div className="form-grid">
                    <select
                      name="existing_concept_id"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Choose existing concept
                      </option>
                      {concepts.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.name}{' '}
                          {concept.concept_type
                            ? `(${concept.concept_type})`
                            : ''}
                        </option>
                      ))}
                    </select>

                    <select
                      name="existing_library_node_id"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Choose category
                      </option>
                      {placementNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {getCategoryPath(node, nodes)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <br />

                  <button className="btn primary" type="submit">
                    Assign Concept
                  </button>

                  {assignStatus && <p className="muted">{assignStatus}</p>}
                </form>
              </div>
            </>
          )}

          {workflow === 'relationships' && (
            <div className="panel">
              <button
                className="btn ghost"
                type="button"
                onClick={() => openWorkflow('dashboard')}
              >
                Back to Creator Studio
              </button>

              <h2>Build Relationships</h2>
              <p className="muted">
                Connect concepts currently placed in the working library.
              </p>

              <form onSubmit={handleRelationshipSubmit}>
                <div className="form-grid">
                  <select name="source_concept_id" defaultValue="" required>
                    <option value="" disabled>
                      Choose source concept
                    </option>
                    {ownedConcepts.map((concept) => (
                      <option key={concept.id} value={concept.id}>
                        {concept.name}
                      </option>
                    ))}
                  </select>

                  <select name="relationship_type" defaultValue="" required>
                    <option value="" disabled>
                      Choose relationship type
                    </option>
                    {relationshipTypes.map((relationshipType) => (
                      <option key={relationshipType} value={relationshipType}>
                        {relationshipType}
                      </option>
                    ))}
                  </select>

                  <select name="target_concept_id" defaultValue="" required>
                    <option value="" disabled>
                      Choose target concept
                    </option>
                    {ownedConcepts.map((concept) => (
                      <option key={concept.id} value={concept.id}>
                        {concept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <br />

                <button className="btn primary" type="submit">
                  Save Relationship
                </button>

                {relationshipStatus && (
                  <p className="muted">{relationshipStatus}</p>
                )}
              </form>
            </div>
          )}

          {workflow === 'sources' && (
            <>
              <div className="panel">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => openWorkflow('dashboard')}
                >
                  Back to Creator Studio
                </button>

                <h2>Manage Sources</h2>
                <p className="muted">
                  Add reusable source records for content attribution.
                </p>

                <form onSubmit={handleSourceSubmit}>
                  <div className="form-grid">
                    <input name="source_title" placeholder="Title" required />
                    <input name="source_author" placeholder="Author" />
                    <input name="source_url" type="url" placeholder="URL" />
                    <input name="source_license" placeholder="License" />
                    <select name="source_type" defaultValue="" required>
                      <option value="" disabled>
                        Choose source type
                      </option>
                      {sourceTypes.map((sourceType) => (
                        <option key={sourceType} value={sourceType}>
                          {sourceType}
                        </option>
                      ))}
                    </select>
                  </div>

                  <br />

                  <button className="btn primary" type="submit">
                    Save Source
                  </button>

                  {sourceStatus && <p className="muted">{sourceStatus}</p>}
                </form>

                <h3>Your Sources</h3>

{sources.length === 0 ? (
  <p className="muted">No sources added yet.</p>
) : (
  sources.map((source) => (
    <div className="card" key={source.id}>
      <strong>{source.title}</strong>

      <p className="muted">
        {[source.author, source.source_type, source.license]
          .filter(Boolean)
          .join(' · ') || 'No additional details'}
      </p>

      {source.url && (
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.url}
        </a>
      )}

      <button
        className="btn ghost"
        type="button"
        onClick={() => handleStartSourceRemove(source.id)}
      >
        Remove
      </button>

      {removingSourceId === source.id && (
        <div
          style={{
            marginTop: '10px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>
            Remove “{source.title}”? This only works if the source is not
            currently attached to any content.
          </span>

          <button
            className="btn primary"
            type="button"
            onClick={() => handleSourceRemove(source.id)}
          >
            Remove Source
          </button>

          <button
            className="btn ghost"
            type="button"
            onClick={handleCancelSourceRemove}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  ))
)}
              </div>

              <div className="panel">
                <h2>Attach Source to Concept</h2>
                <p className="muted">
	                  Connect one of your sources to a working-library concept.
                </p>

                <form onSubmit={handleAttributionSubmit}>
                  <div className="form-grid">
                    <select
                      name="attribution_concept_id"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Choose concept
                      </option>
                      {attributionConcepts.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.name}
                        </option>
                      ))}
                    </select>

                    <select
                      name="attribution_source_id"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Choose source
                      </option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <br />

                  <textarea
                    name="attribution_note"
                    placeholder="Attribution note"
                  />

                  <br />
                  <br />

                  <button className="btn primary" type="submit">
                    Attach Source
                  </button>

                  {attributionStatus && (
                    <p className="muted">{attributionStatus}</p>
                  )}
                </form>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
