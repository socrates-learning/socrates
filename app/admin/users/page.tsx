'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SocratesShell } from '@/components/application-shell/SocratesShell';
import { supabase } from '@/lib/supabase';
import styles from './AdminUsers.module.css';

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

  async function updateRole(
    email: string,
    role: string,
    currentRole: string | null
  ) {
    setStatus(`Updating ${email}...`);

    const { error } = role === 'learner' && !currentRole
      ? await supabase.rpc('provision_invited_learner', {
          target_email: email,
        })
      : await supabase.rpc('set_user_role_by_email', {
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
    // The existing server Admin layout authorizes this page before rendering it.
    <SocratesShell variant="header" active="admin" role="admin">
      <main className={styles.page}>
        <section className={styles.panel} aria-labelledby="user-management-title">
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>Administration</p>
              <h1 id="user-management-title">User Management</h1>
            </div>
            <div className={styles.accessNote}>
              <ShieldCheck aria-hidden="true" />
              <span>Manage user roles and permissions.</span>
            </div>
          </div>
          <p className={styles.description}>
            Permanent role-management interface for approved Socrates access.
            Users with no role are pending approval and cannot enter the app.
          </p>

          {status && <p className={styles.status} role="status">{status}</p>}

          <div className={styles.userList} role="region" aria-label="User accounts" tabIndex={0}>
            {users.map((user) => (
              <div className={styles.userCard} key={user.user_id}>
                <h2>{user.email}</h2>
                <p className={styles.currentRole}>
                  Current role: {user.role || 'Pending approval / no role'}
                </p>

                <select
                  aria-label={`Role for ${user.email}`}
                  defaultValue={user.role || ''}
                  onChange={(event) => {
                    if (event.target.value) {
                      updateRole(user.email, event.target.value, user.role);
                    }
                  }}
                >
                  <option value="" disabled>
                    Assign role
                  </option>
                  <option value="learner">Learner</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      </main>
    </SocratesShell>
  );
}
