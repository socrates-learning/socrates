import Link from 'next/link';

const concepts = [
  {
    id: '8d017b8c-1bb7-4336-a40a-1ca1983e6023',
    name: 'Beta Blockers Demo',
    type: 'Drug Class',
  },
];

export function Sidebar({ activeId }: { activeId?: string }) {
  return (
    <aside className="panel sidebar">
      <h3>Knowledge Library</h3>

      <strong>Pharmacology</strong>

      <div className="sub">
        <strong>Cardiovascular Pharmacology</strong>

        <div className="sub">
          <strong>Hypertension Drugs</strong>

          {concepts.map((concept) => (
            <Link
              key={concept.id}
              className={`tree-item ${activeId === concept.id ? 'active' : ''}`}
              href={`/concepts/${concept.id}`}
            >
              {concept.name}
              <br />
              <small className="muted">{concept.type}</small>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}