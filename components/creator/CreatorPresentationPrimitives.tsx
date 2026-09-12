'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './CreatorPresentationPrimitives.module.css';

export function CreatorWorkspaceShell({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className={styles.workspace} aria-label={title}>
      <header className={styles.workspaceHeader}>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export type CreatorTab = Readonly<{
  id: string;
  label: string;
  panelId: string;
}>;

export function CreatorTopTabs({
  activeId,
  ariaLabel,
  onSelect,
  tabs,
}: {
  activeId: string;
  ariaLabel: string;
  onSelect: (id: string) => void;
  tabs: readonly CreatorTab[];
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          aria-controls={tab.panelId}
          aria-selected={activeId === tab.id}
          className={activeId === tab.id ? styles.activeTab : undefined}
          id={`${tab.panelId}-tab`}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CreatorSectionHeading({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <div>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {action ? <div className={styles.headingAction}>{action}</div> : null}
    </header>
  );
}

export function CreatorOwnershipBadge({ source }: { source: 'official' | 'personal' }) {
  return (
    <span
      className={`${styles.ownershipBadge} ${
        source === 'official' ? styles.officialBadge : styles.personalBadge
      }`}
    >
      {source === 'official' ? 'Socrates' : 'Mine'}
    </span>
  );
}

export function CreatorMaterialRow({
  badge,
  description,
  label,
  onSelect,
  selected = false,
  trailing,
}: {
  badge?: ReactNode;
  description?: string;
  label: string;
  onSelect: () => void;
  selected?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      aria-current={selected ? 'true' : undefined}
      className={`${styles.materialRow} ${selected ? styles.selectedRow : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className={styles.materialCopy}>
        <span className={styles.materialTitle}>
          {label}
          {badge}
        </span>
        {description ? <span className={styles.materialDescription}>{description}</span> : null}
      </span>
      {trailing ? <span className={styles.materialTrailing}>{trailing}</span> : null}
    </button>
  );
}

export function CreatorSearchToolbar({
  actions,
  label,
  onChange,
  placeholder,
  value,
}: {
  actions?: ReactNode;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className={styles.searchToolbar}>
      <label>
        <span className={styles.visuallyHidden}>{label}</span>
        <input
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
      </label>
      {actions}
    </div>
  );
}

export function CreatorStatusNotice({
  children,
  tone = 'status',
}: {
  children: ReactNode;
  tone?: 'status' | 'error';
}) {
  return (
    <div
      className={`${styles.notice} ${tone === 'error' ? styles.errorNotice : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function CreatorDialogShell({
  children,
  descriptionId,
  onClose,
  title,
  titleId,
}: {
  children: ReactNode;
  descriptionId?: string;
  onClose: () => void;
  title: string;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = dialog?.querySelector<HTMLElement>(focusableSelector);
    (firstFocusable ?? dialog)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector)
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id={titleId}>{title}</h2>
          <button aria-label={`Close ${title}`} onClick={onClose} type="button">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function CreatorOverflowMenu({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <details className={styles.overflowMenu}>
      <summary aria-label={label}>•••</summary>
      <div aria-label={label} className={styles.overflowPanel} role="menu">
        {children}
      </div>
    </details>
  );
}
