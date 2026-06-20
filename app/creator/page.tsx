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
  summary: string | null;
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
  summary: string;
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
  summary: '',
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
  const [status, setStatus] = useState('');
  const [assignStatus, setAssignStatus] = useState('');
  const [sourceStatus, setSourceStatus] = useState('');
  const [attributionStatus, setAttributionStatus] = useState('');
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
        summary,
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    setStatus('Saving...');

    const form = new FormData(formElement);
    const libraryNodeId = String(form.get('library_node_id'));

    if (!libraryNodeId) {
      setStatus('Please choose a category.');
      return;
    }

    const concept = {
      name: String(form.get('name')),
      concept_type: String(form.get('concept_type')),
      importance: String(form.get('importance')),
      difficulty: String(form.get('difficulty')),
      estimated_time: String(form.get('estimated_time')),
      summary: String(form.get('summary')),
      why_it_matters: String(form.get('why_it_matters')),
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

    const sectionInputs = [
  { title: 'Overview', field: 'overview', sort_order: 0, required: true },
  { title: 'Mechanism', field: 'mechanism', sort_order: 1 },
  { title: 'Clinical Uses', field: 'clinical_uses', sort_order: 2 },
  { title: 'Adverse Effects', field: 'adverse_effects', sort_order: 3 },
  { title: 'Contraindications', field: 'contraindications', sort_order: 4 },
  { title: 'Key Distinctions', field: 'key_distinctions', sort_order: 5 },
];

const sections = sectionInputs
  .map((section) => ({
    concept_id: data.id,
    title: section.title,
    body: String(form.get(section.field) || '').trim(),
    sort_order: section.sort_order,
  }))
  .filter((section) => section.body.length > 0);

const { error: sectionsError } = await supabase
  .from('learn_sections')
  .insert(sections);

if (sectionsError) {
  setStatus(
    `Concept and placement saved, but article sections failed: ${sectionsError.message}`
  );
  return;
}

setStatus('Concept and article sections saved as draft in the selected category.');
    formElement.reset();
    await loadPageData();
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

  function handleEditConcept(concept: ManagedConcept) {
    const sectionBody = (title: string) =>
      concept.learn_sections.find(
        (section) => section.title.toLowerCase() === title.toLowerCase()
      )?.body || '';

    setEditingConceptId(concept.id);
    setConceptEditForm({
      name: concept.name,
      summary: concept.summary || '',
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
        summary: conceptEditForm.summary.trim() || null,
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

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar />

        <section className="stack">
          <div className="panel">
            <h2>Creator Studio</h2>
            <p className="muted">
              Add draft concepts and place them into a Socrates category.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <input name="name" placeholder="Concept name" required />
                <input name="concept_type" placeholder="Type, e.g. Drug Class" />

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

                <select name="importance" defaultValue="High">
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>

                <select name="difficulty" defaultValue="Beginner">
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>

                <input
                  name="estimated_time"
                  placeholder="Estimated study time, e.g. 15 min"
                />
              </div>

              <br />

              <textarea
  name="overview"
  placeholder="Wikipedia-style Overview"
  required
/>

<br />
<br />

<textarea
  name="mechanism"
  placeholder="Mechanism"
/>

<br />
<br />

<textarea
  name="clinical_uses"
  placeholder="Clinical Uses"
/>

<br />
<br />

<textarea
  name="adverse_effects"
  placeholder="Adverse Effects"
/>

<br />
<br />

<textarea
  name="contraindications"
  placeholder="Contraindications"
/>

<br />
<br />

<textarea
  name="key_distinctions"
  placeholder="Key Distinctions"
/>

<br />
<br />

<button className="btn primary" type="submit">
                Save Draft Concept
              </button>

              {status && <p className="muted">{status}</p>}
            </form>
          </div>

          <div className="panel">
            <h2>Assign Existing Concept to Another Category</h2>
            <p className="muted">
              Use this when one concept belongs in more than one place.
            </p>

            <form onSubmit={handleAssignExisting}>
              <div className="form-grid">
                <select name="existing_concept_id" defaultValue="" required>
                  <option value="" disabled>
                    Choose existing concept
                  </option>
                  {concepts.map((concept) => (
                    <option key={concept.id} value={concept.id}>
                      {concept.name}{' '}
                      {concept.concept_type ? `(${concept.concept_type})` : ''}
                    </option>
                  ))}
                </select>

                <select name="existing_library_node_id" defaultValue="" required>
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

          <div className="panel">
            <h2>Sources</h2>
            <p className="muted">
              Add source records for future content attribution.
            </p>

            <form onSubmit={handleSourceSubmit}>
              <div className="form-grid">
                <input
                  name="source_title"
                  placeholder="Title"
                  required
                />
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
              Connect one of your saved sources to one of your concepts.
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

          <div className="panel">
            <h2>Concept Management</h2>
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

            {editingConceptId && (
              <form onSubmit={handleConceptUpdate}>
                <h3>Edit Concept</h3>

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
              </form>
            )}

            {managementStatus && (
              <p className="muted">{managementStatus}</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
