'use client';

import type { Format } from '@/lib/official-authoring/session';
import styles from '../CreatorStudioV2Client.module.css';

export type OfficialAuthoringMode = 'write' | 'preview' | 'source';
const tools: ReadonlyArray<readonly [Format | 'link', string]> = [
  ['bold', 'Bold'], ['italic', 'Italic'], ['heading', 'Heading'],
  ['bulleted-list', 'Bulleted List'], ['numbered-list', 'Numbered List'],
  ['link', 'Link'], ['quote', 'Quote'],
];

function ToolIcon({ name }: { name: Format | 'link' | 'image' }) {
  const paths: Record<string, string> = {
    bold: 'M7 4h6a4 4 0 0 1 0 8H7m6 0a4 4 0 0 1 0 8H7V4',
    italic: 'M11 4h8M5 20h8M15 4 9 20',
    heading: 'M5 4v16M19 4v16M5 12h14',
    'bulleted-list': 'M9 5h12M9 12h12M9 19h12M3 5h.1M3 12h.1M3 19h.1',
    'numbered-list': 'M10 5h11M10 12h11M10 19h11M3 4h1v5M2 9h4M2 15c0-3 4-3 4 0l-4 5h4',
    link: 'm9 15 6-6M7 13l-3 3a3 3 0 0 0 4 4l4-4m0-8 4-4a3 3 0 0 1 4 4l-3 3',
    quote: 'M4 5h6v8H4V5m6 8c0 4-2 6-6 6M15 5h6v8h-6V5m6 8c0 4-2 6-6 6',
    image: 'M3 3h18v18H3V3m0 13 6-6 5 5 3-3 4 4M15 7h.1',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function OfficialAuthoringToolbar({ label, mode, disabled, readOnly, visualAvailable, onFormat, onMode, onImage, presentation }: {
  label: string; mode: OfficialAuthoringMode; disabled: boolean; readOnly: boolean; visualAvailable: boolean;
  onFormat: (format: Format | 'link') => void; onMode: (mode: OfficialAuthoringMode) => void; onImage?: () => void;
  presentation?: 'compact';
}) {
  if (presentation === 'compact') return <div className={styles.compactToolbar}>
    <div className={styles.compactTools} role="group" aria-label={`${label} formatting tools`}>
      {tools.map(([format, name]) => <button key={format} type="button" className={styles.compactTool}
        aria-label={name} title={name} disabled={disabled || readOnly || mode !== 'write' || !visualAvailable}
        onMouseDown={event => event.preventDefault()} onClick={() => onFormat(format)}><ToolIcon name={format} /><span className={styles.srOnly}>{name}</span></button>)}
      {onImage ? <button type="button" className={styles.compactTool} data-concept-image-action="true" aria-label="Image" title="Image"
        disabled={disabled || readOnly} onMouseDown={event => event.preventDefault()} onClick={onImage}><ToolIcon name="image" /><span className={styles.srOnly}>Image</span></button> : null}
    </div>
    <div className={styles.compactModes} role="group" aria-label={`${label} editor mode`}>
      {(['write', 'preview', 'source'] as const).map(value => <button key={value} type="button"
        disabled={disabled || value === 'write' && !visualAvailable} aria-pressed={mode === value}
        title={value === 'source' ? 'Advanced source compatibility mode' : undefined}
        onClick={() => onMode(value)}>{value === 'write' ? 'Write' : value === 'preview' ? 'Preview' : 'Source'}</button>)}
    </div>
  </div>;
  return <div role="group" aria-label={`${label} formatting tools`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
    {tools.map(([format, name]) => <button key={format} type="button" className={styles.toolButton}
      disabled={disabled || readOnly || mode !== 'write' || !visualAvailable}
      onMouseDown={event => event.preventDefault()} onClick={() => onFormat(format)}>{name}</button>)}
    {onImage ? <button type="button" className={styles.toolButton} data-concept-image-action="true"
      disabled={disabled || readOnly} onMouseDown={event => event.preventDefault()} onClick={onImage}>Image</button> : null}
    <span style={{ flex: 1 }} />
    {(['write', 'preview'] as const).map(value => <button key={value} type="button" disabled={disabled || value === 'write' && !visualAvailable}
      aria-pressed={mode === value} className={mode === value ? styles.primaryButton : styles.secondaryButton}
      onClick={() => onMode(value)}>{value === 'write' ? 'Write' : 'Preview'}</button>)}
    <button type="button" disabled={disabled} className={styles.secondaryButton} aria-pressed={mode === 'source'}
      title="Advanced source compatibility mode" onClick={() => onMode('source')}>Source</button>
  </div>;
}
