import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { demoConcepts, demoObjects } from '@/lib/demo-data';
import Link from 'next/link';

export default function ConceptPage({ params }: { params: { id: string } }) {
  const concept = demoConcepts.find(c => c.id === params.id) || demoConcepts[0];
  const objects = demoObjects.filter(o => o.concept_id === concept.id);
  return <><Header/><main className="layout"><Sidebar activeId={concept.id}/><section className="stack"><div className="panel concept-title"><div><h2>{concept.name}</h2><p className="muted">{concept.type} · {concept.importance} importance · {concept.difficulty} · {concept.estimated_time}</p></div><div className="mastery"><strong>Overall Mastery</strong><h2 style={{margin:'4px 0'}}>50%</h2><div className="bar"><span style={{width:'50%'}}/></div></div></div><div className="tabs"><button className="tab active">Learn</button><button className="tab">Review</button><button className="tab">Distinctions</button><button className="tab">Notes</button><button className="tab">Network</button><Link className="tab" href="/creator">Create</Link></div><div className="grid"><div className="card"><h3>Summary</h3><p>{concept.summary}</p></div><div className="card"><h3>Why this matters</h3><p>{concept.why_it_matters}</p></div><div className="card"><h3>Learning Objects</h3>{objects.map(o=><p key={o.id}><strong>{o.object_type}</strong><br/>{o.prompt}</p>)}</div><div className="card"><h3>Sub-Mastery</h3>{['Mechanism','Clinical Uses','Adverse Effects','Contraindications','Distinctions'].map(s=><p key={s}><strong>{s}</strong><br/><span className="muted">50%</span><span className="bar"><span style={{width:'50%'}}/></span></p>)}</div><div className="card"><h3>Connected Concepts</h3><p><Link href="/concepts/raas">RAAS</Link></p><p><Link href="/concepts/hyperkalemia">Hyperkalemia</Link></p><p><Link href="/concepts/arbs">ARBs</Link></p></div></div></section></main></>;
}
