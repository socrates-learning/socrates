'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';

type UserRoleRow = {
  user_id: string;
  email: string;
  role: string | null;
  created_at: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [status, setStatus] = useState('Loading users...');

  async function loadUsers() {
    const { data, error } = await supabase.rpc('list_users_with_roles');

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setUsers(data || []);
    setStatus('');
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function updateRole(email: string, role: string) {
    setStatus(`Updating ${email}...`);

    const { error } = await supabase.rpc('set_user_role_by_email', {
      target_email: email,
      new_role: role,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setStatus(`Updated ${email} to ${role}.`);
    await loadUsers();
  }

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar />

        <section className="panel">
          <h2>Admin User Management</h2>
          <p className="muted">
            Manage admin, editor, and learner roles without touching Supabase.
          </p>

          {status && <p className="muted">{status}</p>}

          <div className="grid">
            {users.map((user) => (
              <div className="card" key={user.user_id}>
                <h3>{user.email}</h3>
                <p className="muted">
                  Current role: {user.role || 'learner / none'}
                </p>

                <select
                  defaultValue={user.role || 'learner'}
                  onChange={(event) => updateRole(user.email, event.target.value)}
                >
                  <option value="learner">Learner</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}