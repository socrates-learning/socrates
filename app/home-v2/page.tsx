'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

type DeckMode = 'Learn' | 'Study' | 'Cram';

type ProgressRow = {
  id: string;
  name: string;
  progress: number;
  canExpand?: boolean;
};

type TopicNode = {
  id: string;
  name: string;
  progress: number;
  children?: TopicNode[];
};

const railItems = [
  { label: 'Deck Menu', icon: 'document' },
  { label: 'Set Up Deck', icon: 'gear' },
  { label: 'Make Cards', icon: 'edit' },
  { label: 'Stats', icon: 'bars' },
  { label: 'Menu', icon: 'people' },
  { label: 'Buttons', icon: 'dots' },
];

const progressRows: ProgressRow[] = [
  { id: 'clinical-practice', name: 'Clinical Practice', progress: 68, canExpand: true },
  { id: 'mother-baby', name: 'Mother Baby', progress: 52, canExpand: true },
  { id: 'cardiac', name: 'Cardiac', progress: 37, canExpand: true },
  { id: 'ecg', name: 'ECG', progress: 74, canExpand: true },
];

const topicTree: TopicNode[] = [
  {
    id: 'nursing',
    name: 'Nursing',
    progress: 64,
    children: [
      {
        id: 'clinical-practice-tree',
        name: 'Clinical Practice',
        progress: 68,
        children: [
          { id: 'monitors', name: 'Monitors', progress: 54 },
          { id: 'invasive-lines', name: 'Invasive Lines', progress: 41 },
        ],
      },
      {
        id: 'mother-baby-tree',
        name: 'Mother Baby',
        progress: 52,
        children: [{ id: 'newborn-care', name: 'Newborn Care', progress: 38 }],
      },
      { id: 'cardiac-tree', name: 'Cardiac', progress: 37 },
      { id: 'ecg-tree', name: 'ECG', progress: 74 },
    ],
  },
];

function NavIcon({ icon }: { icon: string }) {
  return (
    <span className="home-v2-nav-icon" aria-hidden="true">
      {icon === 'home' && (
        <svg viewBox="0 0 24 24">
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h5v-6h4v6h5V10" />
        </svg>
      )}
      {icon === 'learn' && (
        <svg viewBox="0 0 24 24">
          <path d="M4 5c3 0 5 .8 8 3v12c-3-2.2-5-3-8-3zM20 5c-3 0-5 .8-8 3v12c3-2.2 5-3 8-3z" />
        </svg>
      )}
      {icon === 'study' && (
        <svg viewBox="0 0 24 24">
          <path d="M3 8l9-4 9 4-9 4z" />
          <path d="M7 10v5c3 2 7 2 10 0v-5" />
        </svg>
      )}
      {icon === 'progress' && (
        <svg viewBox="0 0 24 24">
          <path d="M5 20V9M12 20V4M19 20v-8" />
          <path d="M3 20h18" />
        </svg>
      )}
      {icon === 'creator' && (
        <svg viewBox="0 0 24 24">
          <path d="M4 20l4-1 11-11-3-3L5 16z" />
          <path d="M14 7l3 3" />
        </svg>
      )}
      {icon === 'admin' && (
        <svg viewBox="0 0 24 24">
          <path d="M12 3l8 4v5c0 5-3 8-8 10-5-2-8-5-8-10V7z" />
          <path d="M9 12l2 2 4-5" />
        </svg>
      )}
      {icon === 'account' && (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-5 4-7 8-7s6.5 2 8 7" />
        </svg>
      )}
    </span>
  );
}

function HomeV2Header() {
  function handleHomeClick() {
    window.dispatchEvent(new Event('socrates-open-deck-dashboard'));
  }

  function handleStudyClick() {
    window.history.replaceState(null, '', '#set-up-deck');
    window.dispatchEvent(new Event('socrates-open-deck-setup'));
  }

  function handleCreatorClick() {
    window.dispatchEvent(new Event('socrates-open-creator-dashboard'));
  }

  return (
    <header className="home-v2-header">
      <Link className="home-v2-brand" href="/" onClick={handleHomeClick}>
        <Image
          alt="Socrates — Learn anything."
          className="home-v2-brand-logo"
          height={152}
          priority
          src="/brand/socrates-logo-dark.png"
          width={270}
        />
      </Link>

      <nav className="home-v2-nav" aria-label="Socrates prototype navigation">
        <Link className="home-v2-nav-item" href="/" onClick={handleHomeClick}>
          <NavIcon icon="home" />
          Home
        </Link>
        <button className="home-v2-nav-item" type="button" disabled>
          <NavIcon icon="learn" />
          Learn
        </button>
        <button className="home-v2-nav-item" type="button" onClick={handleStudyClick}>
          <NavIcon icon="study" />
          Study
        </button>
        <button className="home-v2-nav-item" type="button" disabled>
          <NavIcon icon="progress" />
          Progress
        </button>
        <Link className="home-v2-nav-item" href="/creator" onClick={handleCreatorClick}>
          <NavIcon icon="creator" />
          Creator Studio
        </Link>
        <Link className="home-v2-nav-item" href="/admin/users">
          <NavIcon icon="admin" />
          Admin
        </Link>
        <button className="home-v2-nav-item home-v2-nav-account" type="button">
          <NavIcon icon="account" />
          Account
          <span aria-hidden="true">⌄</span>
        </button>
      </nav>
    </header>
  );
}

function RailIcon({ icon }: { icon: string }) {
  return (
    <span className="home-v2-rail-icon" aria-hidden="true">
      {icon === 'document' && (
        <svg viewBox="0 0 40 40">
          <path d="M12 7h12l5 5v21H12z" />
          <path d="M24 7v7h7M16 19h10M16 24h10M16 29h7" />
        </svg>
      )}
      {icon === 'gear' && (
        <svg viewBox="0 0 40 40">
          <path d="M20 13a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" />
          <path d="M20 5v6M20 29v6M5 20h6M29 20h6M9 9l4 4M27 27l4 4M31 9l-4 4M13 27l-4 4" />
        </svg>
      )}
      {icon === 'edit' && (
        <svg viewBox="0 0 40 40">
          <path d="M10 30h20M12 26l2-8 13-13 6 6-13 13zM25 7l6 6" />
        </svg>
      )}
      {icon === 'bars' && (
        <svg viewBox="0 0 40 40">
          <path d="M9 31V19h6v12M17 31V11h6v20M25 31V5h6v26" />
        </svg>
      )}
      {icon === 'people' && (
        <svg viewBox="0 0 40 40">
          <path d="M15 19a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM5 33c1-7 5-10 10-10s9 3 10 10" />
          <path d="M27 20a5 5 0 1 0-1-10M26 24c4 1 7 4 8 9" />
        </svg>
      )}
      {icon === 'dots' && (
        <svg viewBox="0 0 40 40">
          <path d="M11 20h.1M20 20h.1M29 20h.1" />
        </svg>
      )}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="home-v2-progress" aria-label={`${value}% progress`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function TopicTreeRow({
  node,
  depth,
  expandedIds,
  selectedIds,
  onToggleExpanded,
  onToggleSelected,
}: {
  node: TopicNode;
  depth: number;
  expandedIds: Set<string>;
  selectedIds: Set<string>;
  onToggleExpanded: (id: string) => void;
  onToggleSelected: (id: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expandedIds.has(node.id);

  return (
    <>
      <div className="home-v2-tree-row" style={{ paddingLeft: 10 + depth * 34 }}>
        <button
          aria-label={hasChildren ? `${isExpanded ? 'Collapse' : 'Expand'} ${node.name}` : undefined}
          className="home-v2-chevron"
          disabled={!hasChildren}
          type="button"
          onClick={() => onToggleExpanded(node.id)}
        >
          {hasChildren ? (isExpanded ? '⌄' : '›') : ''}
        </button>
        <span className="home-v2-topic-name">{node.name}</span>
        <ProgressBar value={node.progress} />
        <span className="home-v2-percent">{node.progress}%</span>
        <input
          aria-label={`Select ${node.name}`}
          checked={selectedIds.has(node.id)}
          className="home-v2-checkbox"
          type="checkbox"
          onChange={() => onToggleSelected(node.id)}
        />
      </div>
      {hasChildren &&
        isExpanded &&
        node.children?.map((child) => (
          <TopicTreeRow
            depth={depth + 1}
            expandedIds={expandedIds}
            key={child.id}
            node={child}
            selectedIds={selectedIds}
            onToggleExpanded={onToggleExpanded}
            onToggleSelected={onToggleSelected}
          />
        ))}
    </>
  );
}

export default function HomeV2Page() {
  const [modes, setModes] = useState<Set<DeckMode>>(new Set(['Study']));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['nursing', 'clinical-practice-tree'])
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleMode(mode: DeckMode) {
    setModes((current) => {
      const next = new Set(current);
      if (next.has(mode)) {
        next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <>
      <HomeV2Header />
      <main className="home-v2-shell">
        <aside className="home-v2-rail" aria-label="Deck navigation prototype">
          <div className="home-v2-rail-list">
            {railItems.map((item) => (
              <button className="home-v2-rail-card" key={item.label} type="button">
                <RailIcon icon={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <button className="home-v2-logout" type="button">
            <RailIcon icon="edit" />
            <span>Log Out</span>
          </button>
        </aside>

        <section className="home-v2-workspace">
          <div className="home-v2-topline">
            <h2>Welcome back, Itxier!</h2>
            <button className="home-v2-account" type="button">
              <RailIcon icon="gear" />
              <span>Account Settings</span>
              <span aria-hidden="true">⌄</span>
            </button>
          </div>

          <div className="home-v2-hero">
            <button className="home-v2-study" type="button">
              STUDY
            </button>

            <div className="home-v2-modes" aria-label="Study mode prototype controls">
              {(['Learn', 'Study', 'Cram'] as DeckMode[]).map((mode) => (
                <label key={mode}>
                  <input
                    checked={modes.has(mode)}
                    type="checkbox"
                    onChange={() => toggleMode(mode)}
                  />
                  <span>{mode}</span>
                </label>
              ))}
            </div>
          </div>

          <section className="home-v2-deck-card" aria-labelledby="progress-summary-title">
            <h3 id="progress-summary-title">
              Current Deck: <span>Nursing</span>
            </h3>
            <div className="home-v2-progress-list">
              {progressRows.map((row) => (
                <div className="home-v2-progress-row" key={row.id}>
                  <span className="home-v2-chevron">{row.canExpand ? '›' : ''}</span>
                  <span className="home-v2-topic-name">{row.name}</span>
                  <ProgressBar value={row.progress} />
                  <span className="home-v2-percent">{row.progress}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="home-v2-deck-card" aria-labelledby="tree-title">
            <h3 id="tree-title">
              Current Deck: <span>Nursing</span>
            </h3>
            <div className="home-v2-tree">
              {topicTree.map((node) => (
                <TopicTreeRow
                  depth={0}
                  expandedIds={expandedIds}
                  key={node.id}
                  node={node}
                  selectedIds={selectedIds}
                  onToggleExpanded={toggleExpanded}
                  onToggleSelected={toggleSelected}
                />
              ))}
            </div>
          </section>
        </section>
      </main>

      <style jsx global>{`
        .home-v2-header {
          align-items: center;
          background: linear-gradient(180deg, #061846, #041238);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: flex;
          gap: 24px;
          justify-content: space-between;
          min-height: 88px;
          padding: 16px 28px;
        }

        .home-v2-brand {
          align-items: center;
          color: #ffffff;
          display: flex;
          min-width: 0;
          width: fit-content;
        }

        .home-v2-brand-logo {
          flex: 0 0 auto;
          height: auto;
          object-fit: contain;
          width: clamp(220px, 20vw, 270px);
        }

        .home-v2-brand strong {
          display: block;
          font-size: 31px;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1;
        }

        .home-v2-brand small {
          color: #c8d4ee;
          display: block;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.01em;
          line-height: 1.15;
          margin-top: 4px;
        }

        .home-v2-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .home-v2-nav-item {
          align-items: center;
          background: rgba(7, 25, 70, 0.72);
          border: 1px solid rgba(198, 210, 236, 0.32);
          border-radius: 8px;
          color: #ffffff;
          display: inline-flex;
          font: inherit;
          font-size: 16px;
          font-weight: 650;
          gap: 8px;
          min-height: 46px;
          padding: 10px 14px;
          white-space: nowrap;
        }

        .home-v2-nav-item:disabled {
          cursor: default;
          opacity: 1;
        }

        .home-v2-nav-account {
          background: rgba(19, 55, 129, 0.7);
          border-color: rgba(219, 226, 242, 0.42);
        }

        .home-v2-nav-icon {
          display: inline-flex;
          height: 22px;
          width: 22px;
        }

        .home-v2-nav-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.1;
          width: 100%;
        }

        .home-v2-shell {
          background: #f8fafc;
          display: grid;
          grid-template-columns: 376px minmax(0, 1fr);
          min-height: calc(100vh - 88px);
        }

        .home-v2-rail {
          background: #ffffff;
          border-right: 1px solid #dbe3ef;
          display: flex;
          flex-direction: column;
          gap: 28px;
          justify-content: space-between;
          padding: 28px 32px;
        }

        .home-v2-rail-list {
          display: grid;
          gap: 22px;
        }

        .home-v2-rail-card,
        .home-v2-logout,
        .home-v2-account {
          align-items: center;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          color: #08143b;
          display: flex;
          font: inherit;
          font-size: 22px;
          font-weight: 800;
          gap: 28px;
          min-height: 112px;
          padding: 20px 34px;
          text-align: left;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            transform 0.15s ease;
          width: 100%;
        }

        .home-v2-rail-card {
          background: linear-gradient(180deg, #155ee8, #0f4fc7);
          border-color: #0d47b7;
          box-shadow: 0 14px 26px rgba(15, 79, 199, 0.18);
          color: #ffffff;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1;
        }

        .home-v2-rail-card:hover,
        .home-v2-logout:hover,
        .home-v2-account:hover {
          border-color: #2563eb;
          box-shadow: 0 12px 30px rgba(37, 99, 235, 0.12);
          transform: translateY(-1px);
        }

        .home-v2-logout {
          border: 0;
          border-radius: 0;
          border-top: 1px solid #dbe3ef;
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.035em;
          min-height: 86px;
          padding: 28px 34px 0;
        }

        .home-v2-rail-icon {
          color: #0b5ee8;
          display: inline-flex;
          flex: 0 0 46px;
          height: 46px;
          width: 46px;
        }

        .home-v2-rail-card .home-v2-rail-icon {
          color: #ffffff;
        }

        .home-v2-rail-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.3;
          width: 100%;
        }

        .home-v2-workspace {
          padding: 38px 34px 54px 40px;
        }

        .home-v2-topline {
          align-items: center;
          display: flex;
          gap: 24px;
          justify-content: space-between;
          margin: 0 auto 28px;
          max-width: 1050px;
        }

        .home-v2-topline h2 {
          color: #08143b;
          font-size: 31px;
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1.08;
          margin: 0;
        }

        .home-v2-account {
          border: 0;
          color: #475569;
          font-size: 16px;
          font-weight: 600;
          gap: 12px;
          justify-content: flex-end;
          min-height: auto;
          padding: 8px 0;
          width: auto;
        }

        .home-v2-account .home-v2-rail-icon {
          color: #475569;
          flex-basis: 26px;
          height: 26px;
          width: 26px;
        }

        .home-v2-hero {
          align-items: center;
          display: grid;
          gap: 54px;
          grid-template-columns: minmax(320px, 596px) 180px;
          justify-content: center;
          margin-bottom: 30px;
        }

        .home-v2-study {
          background: linear-gradient(180deg, #2563eb, #1555d5);
          border: 1px solid #0f4fc7;
          border-radius: 8px;
          box-shadow: 0 16px 30px rgba(37, 99, 235, 0.22);
          color: #ffffff;
          font-size: 58px;
          font-weight: 900;
          letter-spacing: 0.01em;
          line-height: 0.95;
          min-height: 144px;
          text-shadow: 0 2px 6px rgba(8, 20, 59, 0.24);
          width: 100%;
        }

        .home-v2-modes {
          display: grid;
          gap: 18px;
        }

        .home-v2-modes label {
          align-items: center;
          color: #0f172a;
          display: flex;
          font-size: 20px;
          gap: 16px;
        }

        .home-v2-modes input,
        .home-v2-checkbox {
          accent-color: #2563eb;
          height: 25px;
          width: 25px;
        }

        .home-v2-deck-card {
          background: #ffffff;
          border: 1px solid #dbe3ef;
          border-radius: 8px;
          margin: 0 auto 18px;
          max-width: 840px;
          padding: 24px 28px;
        }

        .home-v2-deck-card h3 {
          color: #08143b;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.12;
          margin: 0 0 20px;
        }

        .home-v2-deck-card h3 span {
          color: #0b5ee8;
          font-weight: 900;
          margin-left: 8px;
        }

        .home-v2-progress-list,
        .home-v2-tree {
          display: grid;
          gap: 12px;
        }

        .home-v2-progress-row,
        .home-v2-tree-row {
          align-items: center;
          color: #172554;
          display: grid;
          gap: 16px;
          grid-template-columns: 22px minmax(170px, 1fr) minmax(220px, 382px) 48px;
          min-height: 32px;
        }

        .home-v2-tree-row {
          grid-template-columns: 22px minmax(150px, 1fr) minmax(170px, 326px) 54px 34px;
          position: relative;
        }

        .home-v2-tree-row:not(:first-child)::before {
          background: #e2e8f0;
          content: '';
          height: 1px;
          left: 42px;
          position: absolute;
          top: -6px;
          width: 44px;
        }

        .home-v2-chevron {
          background: transparent;
          border: 0;
          color: #08143b;
          font: inherit;
          font-size: 24px;
          line-height: 1;
          padding: 0;
          text-align: center;
        }

        .home-v2-chevron:disabled {
          cursor: default;
        }

        .home-v2-topic-name {
          color: #101b43;
          font-size: 17px;
          font-weight: 500;
          letter-spacing: -0.01em;
        }

        .home-v2-progress {
          background: #e8edf5;
          border-radius: 999px;
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
          height: 10px;
          overflow: hidden;
          width: 100%;
        }

        .home-v2-progress span {
          background: linear-gradient(90deg, #0b5ee8, #155ee8);
          border-radius: inherit;
          display: block;
          height: 100%;
        }

        .home-v2-percent {
          color: #172554;
          font-size: 17px;
          font-weight: 650;
          text-align: right;
        }

        @media (max-width: 1100px) {
          .home-v2-header,
          .home-v2-brand,
          .home-v2-nav {
            align-items: flex-start;
          }

          .home-v2-header {
            flex-direction: column;
          }

          .home-v2-brand {
            min-width: 0;
          }

          .home-v2-shell {
            grid-template-columns: 1fr;
          }

          .home-v2-rail {
            border-right: 0;
            border-bottom: 1px solid #dbe3ef;
          }

          .home-v2-rail-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .home-v2-hero {
            grid-template-columns: 1fr;
            gap: 24px;
          }

          .home-v2-modes {
            grid-template-columns: repeat(3, max-content);
            justify-content: center;
          }
        }

        @media (max-width: 720px) {
          .home-v2-rail,
          .home-v2-workspace {
            padding: 20px;
          }

          .home-v2-rail-list {
            grid-template-columns: 1fr;
          }

          .home-v2-topline {
            align-items: flex-start;
            flex-direction: column;
          }

          .home-v2-study {
            font-size: 40px;
            min-height: 112px;
          }

          .home-v2-progress-row,
          .home-v2-tree-row {
            grid-template-columns: 22px minmax(0, 1fr) 48px;
          }

          .home-v2-progress-row .home-v2-progress,
          .home-v2-tree-row .home-v2-progress,
          .home-v2-tree-row .home-v2-checkbox {
            grid-column: 2 / -1;
          }

          .home-v2-tree-row .home-v2-checkbox {
            justify-self: start;
          }
        }
      `}</style>
    </>
  );
}
