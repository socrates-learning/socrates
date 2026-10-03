'use client';

import type { Format } from '@/lib/official-authoring/session';
import styles from '../CreatorStudioV2Client.module.css';

export type OfficialAuthoringMode = 'write' | 'preview' | 'source';
const tools: ReadonlyArray<readonly [Format | 'link', string]> = [
  ['bold', 'Bold'], ['italic', 'Italic'], ['heading', 'Heading'],
  ['bulleted-list', 'Bulleted List'], ['numbered-list', 'Numbered List'],
  ['link', 'Link'], ['quote', 'Quote'],
];

export default function OfficialAuthoringToolbar({ label, mode, disabled, readOnly, visualAvailable, onFormat, onMode, onImage }: {
  label: string; mode: OfficialAuthoringMode; disabled: boolean; readOnly: boolean; visualAvailable: boolean;
  onFormat: (format: Format | 'link') => void; onMode: (mode: OfficialAuthoringMode) => void; onImage?: () => void;
}) {
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
