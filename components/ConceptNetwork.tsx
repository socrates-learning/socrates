'use client';

import Link from 'next/link';

type Relationship = {
  id: string;
  relationship_type: string;
  concept: {
    id: string;
    name: string;
  };
};

type PositionedConcept = Relationship['concept'] & {
  x: number;
  y: number;
};

export function ConceptNetwork({
  conceptId,
  conceptName,
  relationships,
}: {
  conceptId: string;
  conceptName: string;
  relationships: Relationship[];
}) {
  const relatedConcepts = [
    ...new Map(
      relationships.map((relationship) => [
        relationship.concept.id,
        relationship.concept,
      ])
    ).values(),
  ];
  const positionedConcepts: PositionedConcept[] = relatedConcepts.map(
    (concept, index) => {
      const angle = (index / relatedConcepts.length) * Math.PI * 2 - Math.PI / 2;

      return {
        ...concept,
        x: 400 + Math.cos(angle) * 290,
        y: 210 + Math.sin(angle) * 140,
      };
    }
  );
  const positionsByConceptId = new Map(
    positionedConcepts.map((concept) => [concept.id, concept])
  );

  if (relationships.length === 0) {
    return <p className="muted">No network connections yet.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          minWidth: '680px',
          height: '420px',
          position: 'relative',
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 800 420"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {relationships.map((relationship) => {
            const connectedConcept = positionsByConceptId.get(
              relationship.concept.id
            );

            if (!connectedConcept) return null;

            return (
              <g key={relationship.id}>
                <line
                  x1="400"
                  y1="210"
                  x2={connectedConcept.x}
                  y2={connectedConcept.y}
                  stroke="#94a3b8"
                  strokeWidth="2"
                />
                <text
                  x={(400 + connectedConcept.x) / 2}
                  y={(210 + connectedConcept.y) / 2 - 8}
                  fill="#64748b"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {relationship.relationship_type.replaceAll('_', ' ')}
                </text>
              </g>
            );
          })}
        </svg>

        <Link
          href={`/concepts/${conceptId}`}
          className="card"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '170px',
            minHeight: '76px',
            transform: 'translate(-50%, -50%)',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            background: '#eff6ff',
            borderColor: '#2563eb',
          }}
        >
          <strong>{conceptName}</strong>
        </Link>

        {positionedConcepts.map((concept) => (
          <Link
            key={concept.id}
            href={`/concepts/${concept.id}`}
            className="card"
            style={{
              position: 'absolute',
              left: `${(concept.x / 800) * 100}%`,
              top: `${(concept.y / 420) * 100}%`,
              width: '160px',
              minHeight: '70px',
              transform: 'translate(-50%, -50%)',
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
            }}
          >
            <strong>{concept.name}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
