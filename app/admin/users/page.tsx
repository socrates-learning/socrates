'use client';

import { useEffect, useState } from 'react';
import { SocratesShell } from '@/components/application-shell/SocratesShell';
import { supabase } from '@/lib/supabase';
import { AdminWorkspace } from './AdminWorkspace';
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
    if (role !== 'admin' && role !== 'learner') {
      setStatus('Choose Administrator or Learner. New Editor assignments are disabled.');
      return;
    }
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
      <AdminWorkspace>
        <section className={styles.userPanel} aria-labelledby="user-management-title">
          <div className={styles.sectionHeading}>
            <h2 id="user-management-title">User Management</h2>
            <p>Manage user roles and permissions. Users with no role are pending approval and cannot enter the app.</p>
          </div>
          {status && <p className={styles.status} role="status">{status}</p>}
          <div className={styles.userList} role="region" aria-label="User accounts" tabIndex={0}>
            <table className={styles.userTable}>
              <caption className={styles.visuallyHidden}>Account email addresses, current roles and role assignment</caption>
              <thead><tr><th scope="col">Account email</th><th scope="col">Current role</th><th scope="col">Assign role</th></tr></thead>
              <tbody>
            {users.map((user) => (
              <tr key={user.user_id}>
                <th scope="row">{user.email}</th>
                <td data-label="Current role"><span className={styles.roleBadge}>{user.role || 'Pending approval / no role'}</span></td>
                <td data-label="Assign role">
                <select
                  aria-label={`Role for ${user.email}`}
                  value={user.role === 'admin' || user.role === 'learner' ? user.role : ''}
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
                  <option value="admin">Admin</option>
                </select>
                </td>
              </tr>
            ))}
              </tbody>
            </table>
            {!users.length && !status && <p className={styles.empty}>No accounts to display.</p>}
          </div>
          <p className={styles.tableFooter}>{users.length} {users.length === 1 ? 'account' : 'accounts'}</p>
        </section>
      </AdminWorkspace>
    </SocratesShell>
  );
}
