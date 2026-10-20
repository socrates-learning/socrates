'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { PersonalCardSession } from '@/lib/personal-card-authoring';
import { safeLink } from '@/lib/official-content-format';
import { MarkdownContent } from '@/components/MarkdownContent';
import OfficialAuthoringToolbar, { type OfficialAuthoringMode } from './OfficialAuthoringToolbar';
import styles from '../CreatorStudioV2Client.module.css';
import visualStyles from './OfficialVisualField.module.css';

/** Editing only. The owner-qualified caller retains all persistence and navigation. */
export function PersonalCardField({ label, value, onChange, disabled = false, maxLength,
  literal = false, onComposing, media }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
  maxLength: number; literal?: boolean; onComposing?: (active: boolean) => void;
  media?: (preview: boolean) => ReactNode;
}) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({value, onChange, disabled, onComposing});
  const editor = useRef<{view: EditorView; session: PersonalCardSession} | null>(null);
  const [mode, setMode] = useState<OfficialAuthoringMode>(literal ? 'source' : 'write');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const sourceHistory = useRef({undo: [] as string[], redo: [] as string[]});
  useEffect(() => { current.current = {value, onChange, disabled, onComposing}; });
  useEffect(() => () => { current.current.onComposing?.(false); }, []);
  useEffect(() => {
    if (literal) return;
    let disposed = false;
    let view: EditorView | undefined;
    setReady(false);
    void Promise.all([import('@/lib/personal-card-authoring'), import('prosemirror-view')]).then(([model, browser]) => {
      if (disposed || !host.current) return;
      const session = new model.PersonalCardSession(current.current.value, maxLength);
      view = new browser.EditorView(host.current, {
        state: session.state,
        editable: () => !current.current.disabled,
        attributes: {id, role: 'textbox', 'aria-label': label, 'aria-multiline': 'true'},
        dispatchTransaction(tr) {
          if (current.current.disabled) return;
          session.apply(tr); view?.updateState(session.state); setError(session.error);
          if (session.source !== current.current.value) current.current.onChange(session.source);
        },
        handlePaste(view, event) {
          event.preventDefault();
          if (!current.current.disabled) view.dispatch(view.state.tr.insertText(event.clipboardData?.getData('text/plain') || ''));
          return true;
        },
        handleDrop(_view, event) { event.preventDefault(); return true; },
        handleClickOn(_view, _pos, _node, _nodePos, event) {
          if ((event.target as Element).closest('a')) { event.preventDefault(); return true; }
          return false;
        },
        handleDOMEvents: {
          compositionstart() { current.current.onComposing?.(true); return false; },
          compositionend() { queueMicrotask(() => { if (!disposed) current.current.onComposing?.(false); }); return false; },
        },
      });
      editor.current = {session, view}; setReady(true); setError('');
    }).catch(() => { if (!disposed) { setMode('source'); setError('This Card remains available in Source. Its saved text has not been converted.'); } });
    return () => { disposed = true; view?.destroy(); editor.current = null; current.current.onComposing?.(false); };
  }, [id, label, literal, maxLength, revision]);
  useEffect(() => { editor.current?.view.setProps({editable: () => !disabled && mode === 'write'}); }, [disabled, mode, ready]);
  useEffect(() => {
    if (ready && editor.current && editor.current.session.source !== value) setRevision(n => n + 1);
  }, [value, ready]);
  function command(name: string) {
    if (disabled || editor.current?.view.composing) return;
    if (mode === 'source') {
      const history = sourceHistory.current;
      const from = name === 'undo' ? history.undo : history.redo;
      const to = name === 'undo' ? history.redo : history.undo;
      const next = from.pop(); if (next !== undefined) { to.push(value); onChange(next); }
      return;
    }
    const active = editor.current;
    if (!active || mode !== 'write') return;
    active.session.command(name); active.view.updateState(active.session.state); setError(active.session.error);
    if (active.session.source !== value) onChange(active.session.source);
    active.view.focus();
  }
  function changeMode(next: OfficialAuthoringMode) {
    if (editor.current?.view.composing) return;
    setMode(next); setLink(null);
  }
  return <div className={visualStyles.field} style={{'--creator-navy': 'var(--appearance-text, #081c40)'} as CSSProperties}>
    <label htmlFor={mode === 'source' ? `${id}-source` : id}><strong>{label}</strong></label>
    {!literal ? <OfficialAuthoringToolbar presentation="compact" label={label} mode={mode}
      disabled={disabled} readOnly={false} visualAvailable={ready}
      onFormat={name => name === 'link' ? setLink('https://') : command(name)} onMode={changeMode} />
      : <div className={visualStyles.actions} role="group" aria-label={`${label} editor mode`}>
        <button type="button" className={styles.secondaryButton} disabled={disabled} aria-pressed={mode === 'source'} onClick={() => changeMode('source')}>Write</button>
        <button type="button" className={styles.secondaryButton} disabled={disabled} aria-pressed={mode === 'preview'} onClick={() => changeMode('preview')}>Preview</button>
      </div>}
    <div className={visualStyles.actions} role="group" aria-label={`${label} history`}>
      <button type="button" className={styles.toolButton} disabled={disabled || mode === 'preview'} onMouseDown={e => e.preventDefault()} onClick={() => command('undo')}>Undo</button>
      <button type="button" className={styles.toolButton} disabled={disabled || mode === 'preview'} onMouseDown={e => e.preventDefault()} onClick={() => command('redo')}>Redo</button>
    </div>
    {link !== null && <div className={visualStyles.link} role="group" aria-label={`${label} link`}>
      <label>Link URL<input type="url" value={link} onChange={e => setLink(e.target.value)} /></label>
      <button type="button" disabled={disabled} onClick={() => {
        const active = editor.current;
        if (!active || active.view.composing || !safeLink(link) || active.session.state.selection.empty) { setError('Select text and enter a complete https:// or http:// address.'); return; }
        const {state} = active.session;
        active.session.apply(state.tr.addMark(state.selection.from, state.selection.to, state.schema.marks.link.create({href: link})));
        active.view.updateState(active.session.state); setError(active.session.error);
        if (active.session.source !== value) onChange(active.session.source);
        setLink(null); active.view.focus();
      }}>Apply Link</button>
      <button type="button" onClick={() => { setLink(null); editor.current?.view.focus(); }}>Cancel</button>
    </div>}
    <div ref={host} hidden={mode !== 'write'} className={`${styles.conceptEditor} ${visualStyles.editor}`} style={{minHeight: 180}} />
    {mode === 'source' && <textarea id={`${id}-source`} aria-label={`${label} source`} className={styles.conceptEditor} style={{minHeight: 180}}
      onCompositionStart={() => onComposing?.(true)} onCompositionEnd={() => onComposing?.(false)}
      value={value} disabled={disabled} maxLength={maxLength} onChange={e => {
        sourceHistory.current.undo.push(value); sourceHistory.current.redo = []; onChange(e.target.value); setError('');
      }} />}
    {mode === 'preview' && <div role="region" aria-label={`${label} preview`} className={styles.conceptEditor} style={{minHeight: 180}}>
      {literal ? <p style={{whiteSpace: 'pre-wrap'}}>{value || 'Nothing to preview yet.'}</p> : value ? <MarkdownContent markdown={value} mode="card" /> : <p>Nothing to preview yet.</p>}
    </div>}
    {error && <p role="status">{error}</p>}
    {media?.(mode === 'preview')}
  </div>;
}
