'use client';

import { StudyCreatorFlaggedBrowser } from '@/components/StudyCreatorFlaggedBrowser';
import type { CreatorPersonalContent } from '@/lib/creator-personal-content';
import styles from '../CreatorStudioV2Client.module.css';

export type CreatorStudioTab = 'content' | 'questions' | 'tags' | 'flagged' | 'search';

export function CreatorStudioFlaggedTab({
  material,
  ownerId,
  learnerPresentation = false,
}: {
  material: Pick<CreatorPersonalContent, 'topics' | 'concepts' | 'cards' | 'overlays' | 'standaloneCards'>;
  ownerId: string;
  learnerPresentation?: boolean;
}) {
  if (learnerPresentation) return <StudyCreatorFlaggedBrowser material={material} ownerId={ownerId} neutralPresentation learnerPresentation />;
  return <StudyCreatorFlaggedBrowser material={material} ownerId={ownerId} neutralPresentation />;
}

export function CreatorStudioLocalHeader({
  onBack,
  onClearConcept,
  onOpenLibraryOrganizer,
  showClearConcept,
  canManageLibrary = true,
  canClearConcept = true,
  learnerPresentation = false,
}: {
  onBack: () => void;
  onClearConcept: () => void;
  onOpenLibraryOrganizer: () => void;
  showClearConcept: boolean;
  canManageLibrary?: boolean;
  canClearConcept?: boolean;
  learnerPresentation?: boolean;
}) {
  if (learnerPresentation) return <header className={styles.localHeader}><h1>Creator Studio</h1><div className={styles.headerActions}><button className={styles.secondaryButton} type="button" onClick={onBack}>← Back</button></div></header>;
  return (
    <header className={styles.localHeader}>
      <h1>Creator Studio</h1>
      <div className={styles.headerActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onBack}
        >
          ← Back
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onOpenLibraryOrganizer}
          disabled={!canManageLibrary}
          title={!canManageLibrary ? 'Library Organizer is available to editors and admins.' : undefined}
        >
          Library Organizer
        </button>
        {showClearConcept && (
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onClearConcept}
            disabled={!canClearConcept}
            title={!canClearConcept ? 'Published content is read-only.' : undefined}
          >
            Clear Concept
          </button>
        )}
      </div>
    </header>
  );
}

export function CreatorStudioSaveToolbar({
  buttonLabel,
  disabled,
  message,
  onSave,
}: {
  buttonLabel: string;
  disabled: boolean;
  message: string;
  onSave: () => void;
}) {
  return (
    <div className={styles.saveToolbar}>
      <span role="status" aria-live="polite">
        {message}
      </span>
      <button
        className={styles.primaryButton}
        type="button"
        onClick={onSave}
        disabled={disabled}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

const creatorStudioTabs: ReadonlyArray<{
  id: CreatorStudioTab;
  label: string;
}> = [
  { id: 'content', label: 'Content' },
  { id: 'questions', label: 'Questions' },
  { id: 'tags', label: 'Tags' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'search', label: 'Search' },
];

export function CreatorStudioTabs({
  activeTab,
  onSelect,
  learnerPresentation = false,
}: {
  activeTab: CreatorStudioTab;
  learnerPresentation?: boolean;
  onSelect: (tab: CreatorStudioTab) => void;
}) {
  return (
    <nav
      aria-label="Creator Studio sections"
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 0,
        padding: '0 12px',
        flexWrap: 'wrap',
        borderBottom: '1px solid #d9dde3',
        background: 'linear-gradient(180deg, #f8fbff, #eef4fc)',
      }}
    >
      {creatorStudioTabs.filter(tab => !learnerPresentation || tab.id === 'questions' || tab.id === 'flagged').map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            style={{
              position: 'relative',
              zIndex: isActive ? 1 : 0,
              minHeight: '48px',
              margin: '0 -1px -1px 0',
              border: '1px solid',
              borderColor: isActive ? '#9fb8dc' : '#c7d5e8',
              borderBottomColor: isActive ? '#ffffff' : '#d9dde3',
              borderRadius: '10px 10px 0 0',
              padding: '12px clamp(10px, 2vw, 28px) 11px',
              background: isActive ? '#ffffff' : '#eaf2ff',
              color: isActive ? '#061846' : '#24405f',
              font: 'inherit',
              fontWeight: 800,
              cursor: 'pointer',
              clipPath:
                'polygon(0 0, calc(100% - 14px) 0, 100% 100%, 0 100%)',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
