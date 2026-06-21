'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';

type LibraryNode = {
  id: string;
  name: string;
  node_type: string | null;
  parent_id: string | null;
};

type Concept = {
  id: string;
  name: string;
  concept_type: string | null;
  created_by: string | null;
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

export default function Creator() {
  const [workflow, setWorkflow] = useState<
    'dashboard' | 'create' | 'edit' | 'relationships' | 'sources'
  >('dashboard');
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [status, setStatus] = useState('');
  const [assignStatus, setAssignStatus] = useState('');
  const [sourceStatus, setSourceStatus] = useState('');
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
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [conceptEditForm, setConceptEditForm] = useState<ConceptEditForm>(
    emptyConceptEditForm
  );
  const [managementStatus, setManagementStatus] = useState('');

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

  async function loadConcepts() {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, name, concept_type, created_by')
      .order('name');

    if (error) {
      setManagementStatus(`Unable to load concepts: ${error.message}`);
      return;
    }

    setConcepts(data || []);
  }

  async function loadManagedConcepts(userId: string) {
    const { data, error } = await supabase
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
      .eq('created_by', userId)
      .order('name');

    if (error) {
      setManagementStatus(`Unable to load concepts: ${error.message}`);
      return;
    }

    setOwnedConcepts(data || []);
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

    const { data: nodeData } = await supabase
      .from('library_nodes')
      .select('id, name, node_type, parent_id')
      .order('name');

    setNodes(nodeData || []);
    await Promise.all([loadConcepts(), loadManagedConcepts(userData.user.id)]);
    setLoading(false);
  }

  useEffect(() => {
    loadPageData();
  }, []);

  async function handleCreateConcept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    setStatus('Creating draft...');

    const form = new FormData(formElement);
    const libraryNodeId = String(form.get('library_node_id'));
    const name = String(form.get('name') || '').trim();
    const conceptType = String(form.get('concept_type') || '').trim();
    const difficulty = String(form.get('difficulty') || 'Beginner');

    if (!userId || !name || !libraryNodeId) {
      setStatus('Please provide a name and choose a category.');
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

    await Promise.all([loadConcepts(), loadManagedConcepts(userId)]);
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

    if (!conceptId || !libraryNodeId) {
      setAssignStatus('Please choose both a concept and a category.');
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
      setManagementStatus('Error: Choose one of your concepts to edit.');
      return;
    }

    const name = conceptEditForm.name.trim();

    if (!name) {
      setManagementStatus('Error: Concept name is required.');
      return;
    }

    setManagementStatus('Saving changes...');

    const { error: conceptError } = await supabase
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
      .eq('created_by', userId);

    if (conceptError) {
      setManagementStatus(`Error updating concept: ${conceptError.message}`);
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
          await loadManagedConcepts(userId);
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
          await loadManagedConcepts(userId);
          return;
        }
      }
    }

    await loadManagedConcepts(userId);
    setManagementStatus('Concept changes saved successfully.');
  }

  if (loading) {
    return <p>Loading...</p>;
  }

  if (role !== 'admin' && role !== 'editor') {
    return (
      <>
        <Header />
        <main className="layout">
          <Sidebar />
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
  const attributionConcepts = concepts.filter(
    (concept) => concept.created_by === userId
  );
  const managedConcepts = ownedConcepts.filter((concept) =>
    concept.name.toLowerCase().includes(conceptSearch.trim().toLowerCase())
  );

  function openWorkflow(
    nextWorkflow: 'dashboard' | 'create' | 'edit' | 'relationships' | 'sources'
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
      <main className="layout">
        <Sidebar />

        <section className="stack">
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
                    Find your concepts, update content, or add categories.
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

                <h2>Edit Concepts</h2>
                <p className="muted">Search and edit concepts you created.</p>

                <input
                  type="search"
                  placeholder="Search concepts by name"
                  value={conceptSearch}
                  onChange={(event) => setConceptSearch(event.target.value)}
                />

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
                        {concept.status || 'draft'}
                      </p>
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

              <div className="panel">
                <h2>Assign Another Category</h2>
                <p className="muted">
                  Keep concepts discoverable in every relevant category.
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
                        Choose additional category
                      </option>
                      {placementNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {getCategoryPath(node, nodes)}{' '}
                          {node.node_type ? `(${node.node_type})` : ''}
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
              <p className="muted">Connect two concepts you created.</p>

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
                    </div>
                  ))
                )}
              </div>

              <div className="panel">
                <h2>Attach Source to Concept</h2>
                <p className="muted">
                  Connect one of your sources to one of your concepts.
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
