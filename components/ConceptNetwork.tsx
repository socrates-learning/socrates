'use client';

import Link from 'next/link';

type Concept = {
  id: string;
  name: string;
};

type Relationship = {
  id: string;
  relationship_type: string;
  source_concept: Concept;
  target_concept: Concept;
};

type PositionedConcept = Concept & {
  hop: 1 | 2;
  x: number;
  y: number;
};

const canvas = {
  width: 960,
  height: 620,
  centerX: 480,
  centerY: 310,
};

function positionRing(
  concepts: Concept[],
  hop: 1 | 2,
  radiusX: number,
  radiusY: number,
  angleOffset: number
) {
  return concepts.map((concept, index): PositionedConcept => {
    const angle =
      (index / concepts.length) * Math.PI * 2 + angleOffset;

    return {
      ...concept,
      hop,
      x: canvas.centerX + Math.cos(angle) * radiusX,
      y: canvas.centerY + Math.sin(angle) * radiusY,
    };
  });
}

export function ConceptNetwork({
  conceptId,
  conceptName,
  relationships,
}: {
  conceptId: string;
  conceptName: string;
  relationships: Relationship[];
}) {
  const conceptsById = new Map<string, Concept>();

  for (const relationship of relationships) {
    conceptsById.set(
      relationship.source_concept.id,
      relationship.source_concept
    );
    conceptsById.set(
      relationship.target_concept.id,
      relationship.target_concept
    );
  }

  const directConceptIds = new Set<string>();

  for (const relationship of relationships) {
    if (relationship.source_concept.id === conceptId) {
      directConceptIds.add(relationship.target_concept.id);
    }

    if (relationship.target_concept.id === conceptId) {
      directConceptIds.add(relationship.source_concept.id);
    }
  }

  const secondHopConceptIds = new Set<string>();

  for (const relationship of relationships) {
    const { source_concept: source, target_concept: target } = relationship;

    if (
      directConceptIds.has(source.id) &&
      target.id !== conceptId &&
      !directConceptIds.has(target.id)
    ) {
      secondHopConceptIds.add(target.id);
    }

    if (
      directConceptIds.has(target.id) &&
      source.id !== conceptId &&
      !directConceptIds.has(source.id)
    ) {
      secondHopConceptIds.add(source.id);
    }
  }

  const directConcepts = [...directConceptIds]
    .map((id) => conceptsById.get(id))
    .filter((concept): concept is Concept => Boolean(concept))
    .sort((a, b) => a.name.localeCompare(b.name));
  const secondHopConcepts = [...secondHopConceptIds]
    .map((id) => conceptsById.get(id))
    .filter((concept): concept is Concept => Boolean(concept))
    .sort((a, b) => a.name.localeCompare(b.name));
  const positionedConcepts = [
    ...positionRing(directConcepts, 1, 245, 135, -Math.PI / 2),
    ...positionRing(
      secondHopConcepts,
      2,
      390,
      235,
      -Math.PI / 2 + Math.PI / Math.max(secondHopConcepts.length, 1)
    ),
  ];
  const positionsByConceptId = new Map(
    positionedConcepts.map((concept) => [concept.id, concept])
  );
  const visibleConceptIds = new Set([
    conceptId,
    ...directConceptIds,
    ...secondHopConceptIds,
  ]);
  const visibleRelationships = relationships.filter(
    (relationship) =>
      visibleConceptIds.has(relationship.source_concept.id) &&
      visibleConceptIds.has(relationship.target_concept.id)
  );

  if (directConcepts.length === 0) {
    return <p className="muted">No network connections yet.</p>;
  }

  function getPosition(id: string) {
    return id === conceptId
      ? { x: canvas.centerX, y: canvas.centerY }
      : positionsByConceptId.get(id);
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          minWidth: `${canvas.width}px`,
          height: `${canvas.height}px`,
          position: 'relative',
        }}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${canvas.width} ${canvas.height}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {visibleRelationships.map((relationship) => {
            const source = getPosition(relationship.source_concept.id);
            const target = getPosition(relationship.target_concept.id);

            if (!source || !target) return null;

            return (
              <g key={relationship.id}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#94a3b8"
                  strokeWidth="2"
                />
                <text
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 8}
                  fill="#64748b"
                  fontSize="11"
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
            left: `${(canvas.centerX / canvas.width) * 100}%`,
            top: `${(canvas.centerY / canvas.height) * 100}%`,
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
              left: `${(concept.x / canvas.width) * 100}%`,
              top: `${(concept.y / canvas.height) * 100}%`,
              width: concept.hop === 1 ? '160px' : '148px',
              minHeight: concept.hop === 1 ? '70px' : '62px',
              transform: 'translate(-50%, -50%)',
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              background: concept.hop === 1 ? '#ffffff' : '#f8fafc',
              borderColor: concept.hop === 1 ? '#94a3b8' : '#cbd5e1',
            }}
          >
            <strong>{concept.name}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
