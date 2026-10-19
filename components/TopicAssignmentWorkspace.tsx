'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { locationKey, requireTopicGraph, topicOccurrencePath, type OfficialTopicGraph } from '@/lib/topic-placement-graph';
import { containTopicDialogFocus, topicDetachmentError, type TopicManagementRpc } from '@/lib/topic-detachment';
import styles from './TopicDetachment.module.css';

type UnassignedTopic = { id: string; name: string; concept_count: number; question_count: number };
type Page = { library_id: string; revision: string; total: number; topics: UnassignedTopic[] };

export function TopicAssignmentWorkspace({ children, graph, rpc, canManage, onReassigned }: {
  children: ReactNode; graph: OfficialTopicGraph | null; rpc: TopicManagementRpc; canManage: boolean;
  onReassigned: (graph: OfficialTopicGraph, topicId: string, locationId: string) => void;
}) {
  const [view,setView] = useState<'assigned'|'unassigned'>('assigned');
  const [search,setSearch] = useState(''), [offset,setOffset] = useState(0);
  const [page,setPage] = useState<Page | null>(null), [selected,setSelected] = useState('');
  const [error,setError] = useState(''), [loading,setLoading] = useState(false);
  const [request,setRequest] = useState<{ topic: UnassignedTopic; revision: string } | null>(null);
  const enabled = canManage && graph?.detachment_version === 134;
  useEffect(() => {
    if (!enabled || view !== 'unassigned' || !graph) return;
    let disposed=false;
    setLoading(true); setError(''); setPage(null); setSelected('');
    void (async () => {
      try {
        const result=await rpc('list_unassigned_official_topics',{p_library_id:graph.library_id,p_search:search,p_offset:offset});
        if (result.error) throw result.error;
        const next=result.data as Page | null;
        if (!next || next.library_id!==graph.library_id || !next.revision || !Number.isInteger(next.total) || next.total<0
          || !Array.isArray(next.topics) || next.topics.some(t=>!t.id || typeof t.name!=='string' || !Number.isInteger(t.concept_count) || !Number.isInteger(t.question_count))) throw new Error('Unassigned Topics could not be confirmed. Reload Topics.');
        if (!disposed) setPage(next);
      } catch(e) { if (!disposed) setError(topicDetachmentError(e)); }
      finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed=true; };
  }, [enabled,view,graph,rpc,search,offset]);
  if (!enabled || !graph) return children;
  const topic=page?.topics.find(t=>t.id===selected);
  return <>
    <div className={styles.filters} aria-label="Topic assignment filter">
      <button data-topic-assignment-filter="assigned" type="button" aria-pressed={view==='assigned'} onClick={()=>setView('assigned')}>Assigned</button>
      <button type="button" aria-pressed={view==='unassigned'} onClick={()=>setView('unassigned')}>Unassigned</button>
    </div>
    {view==='assigned' ? children : <div className={styles.workspace} aria-label="Unassigned Topics">
      <p>These Topics retain their Concepts, Questions, preferences, and learning history. Reassign a Topic to return it to the active tree.</p>
      <label>Search unassigned Topics<input value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setOffset(0);}} /></label>
      {loading && <p role="status">Loading unassigned Topics…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {page && <>
        <p role="status">{page.total===0?'No unassigned Topics match this search.':`${page.total} unassigned Topic${page.total===1?'':'s'}`}</p>
        <div className={styles.results}>{page.topics.map(t=><button key={t.id} type="button" className={styles.row} aria-pressed={selected===t.id} onClick={()=>setSelected(t.id)}>
          <strong>{t.name}</strong><small>{t.concept_count} Concepts · {t.question_count} Questions</small>
        </button>)}</div>
        <div className={styles.actions}>
          {page.total>50 && <><button type="button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous Topics</button><button type="button" disabled={offset+50>=page.total} onClick={()=>setOffset(offset+50)}>Next Topics</button></>}
          <button type="button" className={styles.primary} disabled={!topic} onClick={()=>{if(topic) setRequest({topic,revision:page.revision});}}>Reassign Topic</button>
        </div>
      </>}
    </div>}
    {request && <ReassignTopicDialog graph={graph} topic={request.topic} revision={request.revision} rpc={rpc} onCancel={()=>setRequest(null)}
      onSaved={(next,topicId,locationId)=>{onReassigned(next,topicId,locationId);setRequest(null);setView('assigned');}} />}
  </>;
}

function ReassignTopicDialog({graph,topic,revision,rpc,onCancel,onSaved}: {
  graph:OfficialTopicGraph; topic:UnassignedTopic; revision:string; rpc:TopicManagementRpc; onCancel:()=>void;
  onSaved:(graph:OfficialTopicGraph,topicId:string,locationId:string)=>void;
}) {
  const modal=useRef<HTMLDialogElement>(null), cancel=useRef<HTMLButtonElement>(null), pending=useRef(false);
  const [destination,setDestination]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const choices=useMemo(()=>(graph.locations||[]).map(l=>({id:l.id,path:topicOccurrencePath(graph,locationKey(l.id))?.map(t=>t.name).join(' › ')||''})).sort((a,b)=>a.path.localeCompare(b.path)),[graph]);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const dialog=modal.current; dialog?.showModal();cancel.current?.focus();
    return ()=>{dialog?.close();requestAnimationFrame(()=>{
      if(previous?.isConnected && !previous.matches(':disabled')) previous.focus();
      else document.querySelector<HTMLElement>('[data-topic-assignment-filter="assigned"]')?.focus();
    });};
  },[]);
  async function save() {
    if(pending.current || !destination) return;
    pending.current=true;setBusy(true);setError('');modal.current?.focus();
    try {
      const result=await rpc('reassign_official_topic',{p_library_id:graph.library_id,p_topic_id:topic.id,p_parent_location_id:destination,p_expected_revision:revision});
      if(result.error) throw result.error;
      const data=result.data as {topic_id?:string;location_id?:string;graph?:unknown}|null;
      const next=requireTopicGraph(data?.graph,graph.library_id);
      if(data?.topic_id!==topic.id || !data.location_id || !next.locations?.some(l=>l.id===data.location_id && l.topic_id===topic.id && l.parent_location_id===destination)) throw new Error('Reassignment could not be confirmed. Reload Topics before trying again.');
      onSaved(next,topic.id,data.location_id);
    } catch(e) {setError(topicDetachmentError(e));}
    finally {pending.current=false;setBusy(false);}
  }
  return <dialog ref={modal} tabIndex={-1} onKeyDown={containTopicDialogFocus} className={styles.dialog} aria-labelledby="reassign-topic-title" aria-describedby="reassign-topic-description"
    onCancel={e=>{e.preventDefault();if(!pending.current)onCancel();}}>
    <h2 id="reassign-topic-title">Reassign {topic.name}</h2>
    <p id="reassign-topic-description">Choose an active destination for this Topic. Its Concepts, Questions, saved preferences, and learning history will remain unchanged. Former child Topics remain Unassigned until you reassign them separately.</p>
    <p>Study inclusion follows the new parent’s existing selection rules. Old placement selections are retained but are not restored automatically.</p>
    <label>Destination<select value={destination} disabled={busy} onChange={e=>setDestination(e.target.value)}><option value="">Choose a Topic location</option>{choices.map(c=><option key={c.id} value={c.id}>{c.path}</option>)}</select></label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button ref={cancel} type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className={styles.primary} disabled={busy||!destination||!!error} onClick={()=>void save()}>{busy?'Reassigning…':'Reassign Topic'}</button></div>
    {busy && <p role="status">Waiting for reassignment confirmation…</p>}
  </dialog>;
}
