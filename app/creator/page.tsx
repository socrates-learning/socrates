'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';

type LibraryNode = {
  id: string;
  name: string;
  node_type: string | null;
};

type Concept = {
  id: string;
  name: string;
  concept_type: string | null;
};

export default function Creator() {
  const [status, setStatus] = useState('');
  const [assignStatus, setAssignStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);

  async function loadPageData() {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setLoading(false);
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .single();

    setRole(roleData?.role ?? null);

    const { data: nodeData } = await supabase
      .from('library_nodes')
      .select('id, name, node_type')
      .order('name');

    const { data: conceptData } = await supabase
      .from('concepts')
      .select('id, name, concept_type')
      .order('name');

    setNodes(nodeData || []);
    setConcepts(conceptData || []);
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

    const { error: overviewError } = await supabase
      .from('learn_sections')
      .insert({
        concept_id: data.id,
        title: 'Overview',
        body: String(form.get('overview')),
        sort_order: 0,
      });

    if (overviewError) {
      setStatus(
        `Concept and placement saved, but Overview failed: ${overviewError.message}`
      );
      return;
    }

    setStatus('Concept and Overview saved as draft in the selected category.');
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
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} {node.node_type ? `(${node.node_type})` : ''}
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
                name="summary"
                placeholder="Original summary in your own words"
                required
              />

              <br />
              <br />

              <textarea name="why_it_matters" placeholder="Why this matters" />

              <br />
              <br />

              <textarea
                name="overview"
                placeholder="Wikipedia-style Overview"
                required
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
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} {node.node_type ? `(${node.node_type})` : ''}
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
        </section>
      </main>
    </>
  );
}
