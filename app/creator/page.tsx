'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';

export default function Creator() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    async function checkRole() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .single();

      setRole(data?.role ?? null);
      setLoading(false);
    }

    checkRole();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    setStatus('Saving...');

    const form = new FormData(formElement);

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
        library_node_id: 'e3f6ad89-7616-4ea0-bc5d-5f4b0e02b2c6',
        sort_order: 0,
      });

    if (placementError) {
      setStatus(`Concept saved, but placement failed: ${placementError.message}`);
      return;
    }

    setStatus('Concept saved as draft under Pharmacology.');
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

        <section className="panel">
          <h2>Creator Studio</h2>
          <p className="muted">Add draft concepts to the Socrates database.</p>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <input name="name" placeholder="Concept name" required />
              <input name="concept_type" placeholder="Type, e.g. Drug Class" />

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

            <button className="btn primary" type="submit">
              Save Draft Concept
            </button>

            {status && <p className="muted">{status}</p>}
          </form>
        </section>
      </main>
    </>
  );
}