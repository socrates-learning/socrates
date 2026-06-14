import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import Link from 'next/link';

export default function Home() {
  return <><Header/><main className="layout"><Sidebar activeId="ace-inhibitors"/><section className="stack"><div className="dashboard"><div className="panel hero"><h2>Welcome back</h2><p>This is the first real architecture foundation. Next step: connect this UI to Supabase tables and authentication.</p><Link className="btn primary" href="/concepts/ace-inhibitors">Continue Learning: ACE Inhibitors</Link></div><div className="panel"><h3>Weakest Concepts</h3>{['ACE Inhibitors','ARBs','RAAS'].map(n=><p key={n}><strong>{n}</strong> <span className="muted">50%</span><span className="bar"><span style={{width:'50%'}}/></span></p>)}</div></div></section></main></>;
}
