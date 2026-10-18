'use client';

import { useEffect, useRef, useState } from 'react';
import { indexTopicLocations, locationId, topicOccurrencePath, locationKey, type OfficialTopicGraph } from '@/lib/topic-placement-graph';
import styles from './TopicLocationDialog.module.css';

export type LocationRequest = {
  kind: 'drop' | 'duplicate' | 'add-existing' | 'remove' | 'create';
  graph: OfficialTopicGraph;
  sourceId: string;
  destinationId?: string;
  beforeId?: string | null;
  name?: string;
  parentTopicId?: string;
};
export type LocationChange = {
  action: 'move' | 'duplicate' | 'remove' | 'create'; scope: 'this' | 'all';
  sourceId: string; destinationId: string | null; includeChildren: boolean; beforeId: string | null;
};

/** Native modal keeps the background inert and restores the originating focus. */
export function TopicLocationDialog({ request, busy, error, onCancel, onConfirm }: {
  request: LocationRequest; busy: boolean; error: string;
  onCancel: () => void; onConfirm: (change: LocationChange) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState(request.kind === 'add-existing' ? '' : request.sourceId);
  const [destination, setDestination] = useState(request.destinationId || '');
  const [scope, setScope] = useState<'this' | 'all' | ''>('');
  const index = indexTopicLocations(request.graph);
  const sourceLocation = index.locations.get(locationId(source));
  const destinationLocation = index.locations.get(locationId(destination));
  const name = sourceLocation ? index.nodes.get(sourceLocation.topic_id)!.name : '';
  const parent = request.kind === 'remove' ? index.locations.get(sourceLocation?.parent_location_id || '') : destinationLocation;
  const sharedParents = parent ? index.byTopic.get(parent.topic_id) || [] : [];
  const sharedSourceParents = sourceLocation?.parent_location_id ? index.byTopic.get(index.locations.get(sourceLocation.parent_location_id)!.topic_id) || [] : [];
  const needsScope = sharedParents.length > 1 || (request.kind === 'drop' && sharedSourceParents.length > 1);
  const label = (id: string) => topicOccurrencePath(request.graph,locationKey(id))?.map(n => n.name).join(' › ') || '';
  const affectedParents = [...new Set([...sharedParents.map(l => l.id), ...(request.kind === 'drop' ? sharedSourceParents.map(l => l.id) : [])])];
  const title = request.kind === 'create' ? 'Add child Topic' : request.kind === 'remove' ? 'Remove Topic location'
    : request.kind === 'add-existing' ? 'Add existing Topic here' : request.kind === 'duplicate' ? 'Duplicate Topic location' : 'Move or duplicate Topic';
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = dialog.current;
    modal?.showModal();
    return () => {
      modal?.close();
      // The movement panel is replaced by this modal and its handles are disabled
      // while it is open. Restore focus after React enables the surviving handle.
      requestAnimationFrame(() => {
        if (previous?.isConnected && previous !== document.body && !previous.matches(':disabled')) previous.focus();
        else document.querySelector<HTMLElement>(`[data-topic-drop-key="${CSS.escape(locationKey(request.sourceId))}"] [data-topic-drag-handle]`)?.focus();
      });
    };
  }, [request.sourceId]);
  const ready = !busy && (!needsScope || !!scope) && (request.kind === 'create' || !!source) && (request.kind === 'remove' || !!destination);
  function confirm(action: LocationChange['action'], includeChildren = false) {
    if (!ready) return;
    void onConfirm({ action, includeChildren, scope: needsScope ? scope as 'this' | 'all' : 'this',
      sourceId: locationId(source), destinationId: destination ? locationId(destination) : null, beforeId: request.beforeId || null });
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="topic-location-title" aria-describedby="topic-location-description"
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="topic-location-title">{title}</h2>
    <p id="topic-location-description">{request.kind === 'create' ? `Add “${request.name}” beneath the chosen Topic location.`
      : request.kind === 'remove' ? `Remove “${name}” and its descendant locations here. Shared content and learning progress are preserved. A Topic's final location cannot be removed.`
      : 'Move keeps the selected location and its children together. Duplicate creates another location of the same Topic; its content and learning progress remain shared.'}</p>
    {request.kind === 'add-existing' && <label>Existing Topic location<select aria-label="Existing Topic location" value={source} disabled={busy} onChange={event => { setSource(event.target.value); setScope(''); }}>
      <option value="">Choose a Topic location</option>{[...index.locations.values()].filter(l => l.parent_location_id).map(l => <option key={l.id} value={l.id}>{label(l.id)}</option>)}
    </select></label>}
    {(request.kind === 'duplicate' || request.kind === 'drop' && !request.destinationId || request.kind === 'create' && request.parentTopicId) && <label>Destination<select aria-label="Destination" value={destination} disabled={busy} onChange={event => { setDestination(event.target.value); setScope(''); }}>
      <option value="">Choose a parent location</option>{[...index.locations.values()].filter(l => !request.parentTopicId || l.topic_id === request.parentTopicId).map(l => <option key={l.id} value={l.id}>{label(l.id)}</option>)}
    </select></label>}
    {destinationLocation && <p className={styles.destination}>Destination: <strong>{label(destinationLocation.id)}</strong></p>}
    {needsScope && <fieldset disabled={busy}><legend>Apply this child-structure change to</legend>
      <label className={styles.choice}><input type="radio" name="location-scope" checked={scope==='this'} onChange={() => setScope('this')} />This Location</label>
      <label className={styles.choice}><input type="radio" name="location-scope" checked={scope==='all'} onChange={() => setScope('all')} />All Shared Locations</label>
      {scope === 'all' && <><p>These parent locations will be checked together. If their structures conflict, nothing will change.</p><ul>{affectedParents.map(id => <li key={id}>{label(id)}</li>)}</ul></>}
    </fieldset>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      {request.kind === 'create' ? <button type="button" className={styles.primary} disabled={!ready} onClick={() => confirm('create')}>Add Topic</button>
        : request.kind === 'remove' ? <button type="button" className={styles.primary} disabled={!ready} onClick={() => confirm('remove')}>Remove Location</button>
        : <>{request.kind === 'drop' && <button type="button" className={styles.primary} disabled={!ready} onClick={() => confirm('move')}>Move Here</button>}
          <button type="button" disabled={!ready} onClick={() => confirm('duplicate')}>Duplicate Here — Topic Only</button>
          <button type="button" disabled={!ready} onClick={() => confirm('duplicate',true)}>Duplicate Here — Include Children</button></>}
    </div>
    {busy && <p role="status">Saving Topic locations…</p>}
  </dialog>;
}
