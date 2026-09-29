'use client';

import { useId, useRef, useState } from 'react';
import { applyMarkdownEdit, type MarkdownFormat } from '@/lib/markdown-editing';
import { MarkdownContent } from '@/components/MarkdownContent';
import styles from '../CreatorStudioV2Client.module.css';

const tools: ReadonlyArray<readonly [MarkdownFormat, string]> = [
  ['bold', 'Bold'], ['italic', 'Italic'], ['heading', 'Heading'],
  ['bulleted-list', 'Bulleted List'], ['numbered-list', 'Numbered List'],
  ['link', 'Link'], ['quote', 'Quote'],
];

// Controlled source only: the caller owns dirty/busy state, validation and saving.
export function CardMarkdownField({ label, value, onChange, disabled = false, maxLength, required = false }: {
  label: string; value: string; onChange: (source: string) => void;
  disabled?: boolean; maxLength: number; required?: boolean;
}) {
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [error, setError] = useState('');
  function format(command: MarkdownFormat) {
    if (disabled) return;
    const start = Math.min(editor.current?.selectionStart ?? selection.current?.start ?? value.length, value.length);
    const end = Math.min(editor.current?.selectionEnd ?? selection.current?.end ?? value.length, value.length);
    const next = applyMarkdownEdit(value, start, end, command);
    if (next.source.length > maxLength) { setError(`${label} must be ${maxLength} characters or fewer.`); return; }
    setError(''); onChange(next.source); setMode('write');
    selection.current = { start: next.selectionStart, end: next.selectionEnd };
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(next.selectionStart, next.selectionEnd); });
  }
  return <div>
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <div role="group" aria-label={`${label} formatting tools`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {tools.map(([command, name]) => <button key={command} className={styles.toolButton} type="button" disabled={disabled} onClick={() => format(command)}>{name}</button>)}
      {(['write', 'preview'] as const).map(next => <button key={next} type="button" disabled={disabled} aria-pressed={mode === next}
        className={mode === next ? styles.primaryButton : styles.secondaryButton} onClick={() => setMode(next)}>{next === 'write' ? 'Write' : 'Preview'}</button>)}
    </div>
    {mode === 'write' ? <textarea id={id} ref={editor} className={styles.conceptEditor} value={value} disabled={disabled}
      required={required} maxLength={maxLength} aria-describedby={error ? `${id}-error` : undefined}
      onSelect={event => { selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
      onChange={event => { if (!disabled) { setError(''); onChange(event.target.value); } }} />
      : <div role="region" aria-label={`${label} preview`}>
        {value.trim() ? <MarkdownContent markdown={value} mode="card" /> : <p>Nothing to preview yet.</p>}
      </div>}
    {error && <p id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}
