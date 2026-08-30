'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Archive, Folder, Library as LibraryIcon } from 'lucide-react';
import { Header } from '@/components/Header';
import { supabase } from '@/lib/supabase';

type LibraryGroup = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  status: 'active' | 'inactive' | 'archived';
};

type LibraryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
};

type LibraryPlacement = {
  group_id: string;
  library_id: string;
  sort_order: number;
};

type LibraryNode = {
  id: string;
  library_id: string;
  parent_id: string | null;
  name: string;
};

type StatusMessage = {
  tone: 'error' | 'success' | 'info';
  text: string;
} | null;

const fieldStyle = {
  border: '1px solid #cfd5dd',
  borderRadius: 6,
  font: 'inherit',
  minHeight: 42,
  padding: '9px 11px',
  width: '100%',
};

const labelStyle = {
  display: 'grid',
  gap: 7,
};

function statusColor(tone: NonNullable<StatusMessage>['tone']) {
  if (tone === 'error') return '#a12a2a';
  if (tone === 'success') return '#176b3a';
  return '#36526f';
}

export function LibraryOrganizerClient() {
  const [groups, setGroups] = useState<LibraryGroup[]>([]);
  const [libraries, setLibraries] = useState<LibraryRecord[]>([]);
  const [placements, setPlacements] = useState<LibraryPlacement[]>([]);
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupParentDraft, setGroupParentDraft] = useState('');
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryDescription, setNewLibraryDescription] = useState('');
  const [newLibraryGroupId, setNewLibraryGroupId] = useState('');
  const [libraryNameDraft, setLibraryNameDraft] = useState('');
  const [libraryGroupDraft, setLibraryGroupDraft] = useState('');
  const [libraryStatusDraft, setLibraryStatusDraft] =
    useState<LibraryRecord['status']>('active');
  const [pendingArchiveGroupId, setPendingArchiveGroupId] = useState<
    string | null
  >(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const selectedLibrary =
    libraries.find((library) => library.id === selectedLibraryId) || null;
  const activeGroups = groups.filter((group) => group.status === 'active');
  const placementByLibraryId = useMemo(
    () => new Map(placements.map((placement) => [placement.library_id, placement])),
    [placements]
  );
  const rootsByLibraryId = useMemo(() => {
    const roots = new Map<string, LibraryNode[]>();
    nodes.forEach((node) => {
      if (node.parent_id !== null) return;
      const current = roots.get(node.library_id) || [];
      current.push(node);
      roots.set(node.library_id, current);
    });
    return roots;
  }, [nodes]);
  const nodeCountByLibraryId = useMemo(() => {
    const counts = new Map<string, number>();
    nodes.forEach((node) => {
      counts.set(node.library_id, (counts.get(node.library_id) || 0) + 1);
    });
    return counts;
  }, [nodes]);

  async function loadOrganization(preferredGroupId?: string | null) {
    const [groupResult, placementResult, libraryResult, nodeResult] =
      await Promise.all([
        supabase
          .from('library_groups')
          .select('id, parent_id, name, slug, sort_order, status')
          .order('sort_order')
          .order('name'),
        supabase
          .from('library_group_libraries')
          .select('group_id, library_id, sort_order')
          .order('sort_order'),
        supabase
          .from('libraries')
          .select('id, name, slug, description, status')
          .order('name'),
        supabase
          .from('library_nodes')
          .select('id, library_id, parent_id, name'),
      ]);

    const error =
      groupResult.error ||
      placementResult.error ||
      libraryResult.error ||
      nodeResult.error;

    if (error) {
      setStatus({ tone: 'error', text: error.message });
      setIsLoading(false);
      return false;
    }

    const nextGroups = (groupResult.data || []) as LibraryGroup[];
    setGroups(nextGroups);
    setPlacements((placementResult.data || []) as LibraryPlacement[]);
    setLibraries((libraryResult.data || []) as LibraryRecord[]);
    setNodes((nodeResult.data || []) as LibraryNode[]);
    setSelectedGroupId((current) => {
      const preferred = preferredGroupId || current;
      if (preferred && nextGroups.some((group) => group.id === preferred)) {
        return preferred;
      }
      return (
        nextGroups.find((group) => group.slug === 'health-sciences')?.id ||
        nextGroups[0]?.id ||
        null
      );
    });
    setIsLoading(false);
    return true;
  }

  useEffect(() => {
    void loadOrganization();
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    setGroupNameDraft(selectedGroup.name);
    setGroupParentDraft(selectedGroup.parent_id || '');
    setNewLibraryGroupId((current) => current || selectedGroup.id);
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedLibrary) return;
    setLibraryNameDraft(selectedLibrary.name);
    setLibraryGroupDraft(
      placementByLibraryId.get(selectedLibrary.id)?.group_id || ''
    );
    setLibraryStatusDraft(selectedLibrary.status);
  }, [placementByLibraryId, selectedLibrary]);

  async function runMutation(
    action: () => PromiseLike<{ error: { message: string } | null }>,
    successText: string,
    preferredGroupId?: string | null
  ) {
    if (isMutating) return false;
    setIsMutating(true);
    setStatus(null);

    const result = await action();
    if (result.error) {
      setStatus({ tone: 'error', text: result.error.message });
      setIsMutating(false);
      return false;
    }

    const loaded = await loadOrganization(preferredGroupId);
    setIsMutating(false);
    if (loaded) setStatus({ tone: 'success', text: successText });
    return loaded;
  }

  async function createGroup(parentId: string | null) {
    const name = groupNameDraft.trim();
    if (!name) {
      setStatus({ tone: 'error', text: 'Enter a Group name.' });
      return;
    }

    if (isMutating) return;
    setIsMutating(true);
    setStatus(null);

    const { data, error } = await supabase.rpc('create_library_group', {
      p_parent_id: parentId,
      p_name: name,
    });

    if (error) {
      setStatus({ tone: 'error', text: error.message });
      setIsMutating(false);
      return;
    }

    const createdGroupId = (data as { id?: string } | null)?.id || null;
    setGroupNameDraft('');
    await loadOrganization(createdGroupId);
    setIsMutating(false);
    setStatus({ tone: 'success', text: 'Library Group created.' });
  }

  async function renameSelectedGroup() {
    if (!selectedGroup) return;
    await runMutation(
      () =>
        supabase.rpc('rename_library_group', {
          p_group_id: selectedGroup.id,
          p_name: groupNameDraft.trim(),
        }),
      'Library Group renamed.',
      selectedGroup.id
    );
  }

  async function moveSelectedGroup() {
    if (!selectedGroup) return;
    await runMutation(
      () =>
        supabase.rpc('move_library_group', {
          p_group_id: selectedGroup.id,
          p_new_parent_id: groupParentDraft || null,
        }),
      'Library Group moved.',
      selectedGroup.id
    );
  }

  async function reorderSelectedGroup(direction: 'up' | 'down') {
    if (!selectedGroup) return;
    await runMutation(
      () =>
        supabase.rpc('reorder_library_group', {
          p_group_id: selectedGroup.id,
          p_direction: direction,
        }),
      `Library Group moved ${direction}.`,
      selectedGroup.id
    );
  }

  async function archiveSelectedGroup() {
    if (!selectedGroup) return;
    if (pendingArchiveGroupId !== selectedGroup.id) {
      setPendingArchiveGroupId(selectedGroup.id);
      return;
    }

    const archived = await runMutation(
      () =>
        supabase.rpc('archive_library_group', {
          p_group_id: selectedGroup.id,
        }),
      'Library Group archived.',
      selectedGroup.id
    );
    if (archived) setPendingArchiveGroupId(null);
  }

  async function createLibrary() {
    const name = newLibraryName.trim();
    if (!name || !newLibraryGroupId) {
      setStatus({
        tone: 'error',
        text: 'Enter a Library name and choose an active Group.',
      });
      return;
    }
    if (isMutating) return;

    setIsMutating(true);
    setStatus(null);
    const { data, error } = await supabase.rpc('create_library_with_root', {
      p_group_id: newLibraryGroupId,
      p_name: name,
      p_description: newLibraryDescription.trim() || null,
    });

    if (error) {
      setStatus({ tone: 'error', text: error.message });
      setIsMutating(false);
      return;
    }

    const created = data as { library_id?: string } | null;
    setNewLibraryName('');
    setNewLibraryDescription('');
    setSelectedLibraryId(created?.library_id || null);
    await loadOrganization(newLibraryGroupId);
    setIsMutating(false);
    setStatus({
      tone: 'success',
      text: 'Library, root Topic Tree node, and Group placement created.',
    });
  }

  async function renameSelectedLibrary() {
    if (!selectedLibrary) return;
    await runMutation(
      () =>
        supabase.rpc('rename_library_with_root', {
          p_library_id: selectedLibrary.id,
          p_name: libraryNameDraft.trim(),
        }),
      'Library and its root Topic Tree node renamed.',
      placementByLibraryId.get(selectedLibrary.id)?.group_id
    );
  }

  async function moveSelectedLibrary() {
    if (!selectedLibrary || !libraryGroupDraft) return;
    await runMutation(
      () =>
        supabase.rpc('move_library_to_group', {
          p_library_id: selectedLibrary.id,
          p_group_id: libraryGroupDraft,
        }),
      'Library moved to its new canonical Group.',
      libraryGroupDraft
    );
  }

  async function saveSelectedLibraryStatus() {
    if (!selectedLibrary) return;
    await runMutation(
      () =>
        supabase.rpc('set_library_organizer_status', {
          p_library_id: selectedLibrary.id,
          p_status: libraryStatusDraft,
        }),
      'Library status updated.',
      placementByLibraryId.get(selectedLibrary.id)?.group_id
    );
  }

  const descendantGroupIds = useMemo(() => {
    if (!selectedGroup) return new Set<string>();
    const descendants = new Set<string>();
    const queue = [selectedGroup.id];
    while (queue.length) {
      const parentId = queue.shift();
      groups.forEach((group) => {
        if (group.parent_id === parentId && !descendants.has(group.id)) {
          descendants.add(group.id);
          queue.push(group.id);
        }
      });
    }
    return descendants;
  }, [groups, selectedGroup]);

  function groupChildren(parentId: string | null) {
    return groups
      .filter((group) => group.parent_id === parentId)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.name.localeCompare(right.name)
      );
  }

  function librariesForGroup(groupId: string) {
    return placements
      .filter((placement) => placement.group_id === groupId)
      .sort((left, right) => left.sort_order - right.sort_order)
      .flatMap((placement) => {
        const library = libraries.find((item) => item.id === placement.library_id);
        return library ? [library] : [];
      });
  }

  function renderGroup(group: LibraryGroup, depth = 0): React.ReactNode {
    const isSelected = selectedGroupId === group.id;
    return (
      <div key={group.id}>
        <button
          type="button"
          onClick={() => {
            setSelectedGroupId(group.id);
            setSelectedLibraryId(null);
            setPendingArchiveGroupId(null);
          }}
          style={{
            alignItems: 'center',
            background: isSelected ? '#eaf2ff' : 'transparent',
            border: isSelected ? '1px solid #a9c5ed' : '1px solid transparent',
            borderRadius: 6,
            color: group.status === 'archived' ? '#7c8797' : '#172234',
            cursor: 'pointer',
            display: 'flex',
            gap: 8,
            marginLeft: depth * 20,
            padding: '8px 10px',
            textAlign: 'left',
            width: `calc(100% - ${depth * 20}px)`,
          }}
        >
          <Folder size={17} aria-hidden="true" />
          <strong style={{ flex: 1 }}>{group.name}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Group{group.status !== 'active' ? ` · ${group.status}` : ''}
          </span>
        </button>

        {librariesForGroup(group.id).map((library) => {
          const librarySelected = selectedLibraryId === library.id;
          return (
            <button
              key={library.id}
              type="button"
              onClick={() => {
                setSelectedGroupId(group.id);
                setSelectedLibraryId(library.id);
                setPendingArchiveGroupId(null);
              }}
              style={{
                alignItems: 'center',
                background: librarySelected ? '#f0f7ee' : 'transparent',
                border: librarySelected
                  ? '1px solid #b8d4b1'
                  : '1px solid transparent',
                borderRadius: 6,
                color: library.status === 'active' ? '#263244' : '#7c8797',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                marginLeft: (depth + 1) * 20,
                padding: '8px 10px',
                textAlign: 'left',
                width: `calc(100% - ${(depth + 1) * 20}px)`,
              }}
            >
              <LibraryIcon size={16} aria-hidden="true" />
              <span style={{ flex: 1 }}>{library.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Library{library.status !== 'active' ? ` · ${library.status}` : ''}
              </span>
            </button>
          );
        })}

        {groupChildren(group.id).map((child) => renderGroup(child, depth + 1))}
      </div>
    );
  }

  const ungroupedLibraries = libraries.filter(
    (library) => !placementByLibraryId.has(library.id)
  );
  const selectedLibraryRoots = selectedLibrary
    ? rootsByLibraryId.get(selectedLibrary.id) || []
    : [];

  return (
    <>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section
          className="stack"
          style={{ margin: '0 auto', width: 'min(1240px, 100%)' }}
        >
          <div
            className="panel"
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              justifyContent: 'space-between',
            }}
          >
            <div>
              <p className="muted" style={{ margin: '0 0 5px' }}>
                Creator Studio · Global organization
              </p>
              <h2 style={{ margin: 0 }}>Library Organizer</h2>
              <p className="muted" style={{ margin: '7px 0 0' }}>
                Groups organize Libraries. Each Library keeps its own independent Topic Tree.
              </p>
            </div>
            <Link className="btn ghost" href="/creator/concepts/new">
              Back to Creator Studio
            </Link>
          </div>

          {status && (
            <div
              className="panel"
              role="status"
              style={{ color: statusColor(status.tone), paddingBlock: 13 }}
            >
              {status.text}
            </div>
          )}

          <div
            style={{
              alignItems: 'start',
              display: 'grid',
              gap: 18,
              gridTemplateColumns: 'minmax(340px, 0.9fr) minmax(480px, 1.1fr)',
            }}
          >
            <section className="panel">
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Global Library hierarchy</h3>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  Folder Groups and actual Libraries are deliberately separate.
                </p>
              </div>

              {isLoading ? (
                <p className="muted">Loading Library organization…</p>
              ) : (
                <div aria-label="Global Library hierarchy">
                  {groupChildren(null).map((group) => renderGroup(group))}
                  {ungroupedLibraries.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <strong className="muted">Unorganized Libraries</strong>
                      {ungroupedLibraries.map((library) => (
                        <button
                          key={library.id}
                          type="button"
                          onClick={() => {
                            setSelectedGroupId(null);
                            setSelectedLibraryId(library.id);
                          }}
                          style={{
                            alignItems: 'center',
                            background:
                              selectedLibraryId === library.id
                                ? '#f0f7ee'
                                : 'transparent',
                            border: '1px solid transparent',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            gap: 8,
                            marginTop: 6,
                            padding: '8px 10px',
                            width: '100%',
                          }}
                        >
                          <LibraryIcon size={16} aria-hidden="true" />
                          {library.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="stack">
              <section className="panel">
                <h3 style={{ marginTop: 0 }}>Group operations</h3>
                <label style={labelStyle}>
                  <strong>Group name</strong>
                  <input
                    aria-label="Group name"
                    style={fieldStyle}
                    value={groupNameDraft}
                    onChange={(event) => setGroupNameDraft(event.target.value)}
                  />
                </label>
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}
                >
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={isMutating}
                    onClick={() => void createGroup(null)}
                  >
                    Create top-level Group
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={!selectedGroup || isMutating}
                    onClick={() => void createGroup(selectedGroup?.id || null)}
                  >
                    Create child Group
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={!selectedGroup || isMutating}
                    onClick={() => void createGroup(selectedGroup?.parent_id || null)}
                  >
                    Create sibling Group
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={!selectedGroup || isMutating}
                    onClick={() => void renameSelectedGroup()}
                  >
                    Rename Group
                  </button>
                </div>

                {selectedGroup && (
                  <div
                    style={{
                      borderTop: '1px solid #e0e5ec',
                      display: 'grid',
                      gap: 11,
                      marginTop: 16,
                      paddingTop: 16,
                    }}
                  >
                    <label style={labelStyle}>
                      <strong>Move beneath</strong>
                      <select
                        aria-label="Group parent"
                        style={fieldStyle}
                        value={groupParentDraft}
                        onChange={(event) => setGroupParentDraft(event.target.value)}
                      >
                        <option value="">Top level</option>
                        {activeGroups
                          .filter(
                            (group) =>
                              group.id !== selectedGroup.id &&
                              !descendantGroupIds.has(group.id)
                          )
                          .map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={isMutating}
                        onClick={() => void moveSelectedGroup()}
                      >
                        Move Group
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={isMutating}
                        onClick={() => void reorderSelectedGroup('up')}
                      >
                        Move up
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={isMutating}
                        onClick={() => void reorderSelectedGroup('down')}
                      >
                        Move down
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={isMutating || selectedGroup.status === 'archived'}
                        onClick={() => void archiveSelectedGroup()}
                      >
                        <Archive size={15} aria-hidden="true" />
                        {pendingArchiveGroupId === selectedGroup.id
                          ? 'Confirm archive'
                          : 'Archive Group'}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="panel">
                <h3 style={{ marginTop: 0 }}>Create Library</h3>
                <div style={{ display: 'grid', gap: 11 }}>
                  <label style={labelStyle}>
                    <strong>Library name</strong>
                    <input
                      aria-label="New Library name"
                      style={fieldStyle}
                      value={newLibraryName}
                      onChange={(event) => setNewLibraryName(event.target.value)}
                    />
                  </label>
                  <label style={labelStyle}>
                    <strong>Description</strong>
                    <input
                      aria-label="New Library description"
                      style={fieldStyle}
                      value={newLibraryDescription}
                      onChange={(event) =>
                        setNewLibraryDescription(event.target.value)
                      }
                    />
                  </label>
                  <label style={labelStyle}>
                    <strong>Organizational Group</strong>
                    <select
                      aria-label="New Library Group"
                      style={fieldStyle}
                      value={newLibraryGroupId}
                      onChange={(event) => setNewLibraryGroupId(event.target.value)}
                    >
                      <option value="">Choose a Group</option>
                      {activeGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={isMutating}
                    onClick={() => void createLibrary()}
                  >
                    Create Library with root Topic Tree
                  </button>
                </div>
              </section>

              {selectedLibrary && (
                <section className="panel">
                  <h3 style={{ marginTop: 0 }}>Selected Library</h3>
                  <p className="muted">
                    Stable Library UUID: <code>{selectedLibrary.id}</code>
                  </p>
                  <p className="muted">
                    Root Topic Tree node:{' '}
                    {selectedLibraryRoots.length === 1 ? (
                      <>
                        <strong>{selectedLibraryRoots[0].name}</strong>{' '}
                        <code>{selectedLibraryRoots[0].id}</code>
                      </>
                    ) : (
                      <strong>{selectedLibraryRoots.length} roots found</strong>
                    )}
                  </p>
                  <p className="muted">
                    Internal Topic Tree nodes:{' '}
                    {nodeCountByLibraryId.get(selectedLibrary.id) || 0}
                  </p>
                  <div style={{ display: 'grid', gap: 11 }}>
                    <label style={labelStyle}>
                      <strong>Library name</strong>
                      <input
                        aria-label="Selected Library name"
                        style={fieldStyle}
                        value={libraryNameDraft}
                        onChange={(event) => setLibraryNameDraft(event.target.value)}
                      />
                    </label>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={isMutating}
                      onClick={() => void renameSelectedLibrary()}
                    >
                      Rename Library and root
                    </button>
                    <label style={labelStyle}>
                      <strong>Canonical Group</strong>
                      <select
                        aria-label="Selected Library Group"
                        style={fieldStyle}
                        value={libraryGroupDraft}
                        onChange={(event) => setLibraryGroupDraft(event.target.value)}
                      >
                        <option value="">Choose a Group</option>
                        {activeGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={isMutating || !libraryGroupDraft}
                      onClick={() => void moveSelectedLibrary()}
                    >
                      Move Library
                    </button>
                    <label style={labelStyle}>
                      <strong>Library status</strong>
                      <select
                        aria-label="Selected Library status"
                        style={fieldStyle}
                        value={libraryStatusDraft}
                        onChange={(event) =>
                          setLibraryStatusDraft(
                            event.target.value as LibraryRecord['status']
                          )
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={isMutating}
                      onClick={() => void saveSelectedLibraryStatus()}
                    >
                      Save Library status
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
