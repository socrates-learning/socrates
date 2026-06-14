import Link from 'next/link';
import { demoConcepts } from '@/lib/demo-data';

export function Sidebar({ activeId }: { activeId?: string }) {
  return <aside className="panel sidebar"><h3>Knowledge Library</h3><strong>Pharmacology</strong><div className="sub"><strong>Cardiovascular Pharmacology</strong><div className="sub"><strong>Hypertension Drugs</strong>{demoConcepts.filter(c=>['ace-inhibitors','arbs','hyperkalemia'].includes(c.id)).map(c=><Link key={c.id} className={`tree-item ${activeId===c.id?'active':''}`} href={`/concepts/${c.id}`}>{c.name}<br/><small className="muted">{c.type}</small></Link>)}</div></div><br/><strong>Physiology</strong><div className="sub"><Link className={`tree-item ${activeId==='raas'?'active':''}`} href="/concepts/raas">Renin-Angiotensin-Aldosterone System<br/><small className="muted">Physiology System</small></Link></div></aside>;
}
