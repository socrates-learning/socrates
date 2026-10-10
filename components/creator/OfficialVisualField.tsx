'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { EditorView } from 'prosemirror-view';
import type { OfficialSession, Format } from '@/lib/official-authoring/session';
import type { OfficialContentFormat, OfficialFlavor, SourceProvenance } from '@/lib/official-content-format';
import { MarkdownContent } from '@/components/MarkdownContent';
import OfficialAuthoringToolbar, { type OfficialAuthoringMode } from './OfficialAuthoringToolbar';
import creatorStyles from '../CreatorStudioV2Client.module.css';
import styles from './OfficialVisualField.module.css';

/** Parent lifetime owns the session so internal Creator tabs never replace a draft. */
export type OfficialVisualMemory = { key: string; session: OfficialSession; view: EditorView | null };
export type OfficialVisualHandle = {
  capture: () => { source: string; format: OfficialContentFormat };
  selection: () => number;
  focus: () => void;
};
export type OfficialVisualFieldProps = {
  label: string; ariaLabel: string; placeholder: string; value: string; format: OfficialContentFormat;
  flavor: OfficialFlavor; documentKey: string; memory: RefObject<OfficialVisualMemory | null>;
  handle?: RefObject<OfficialVisualHandle | null>; mode: OfficialAuthoringMode;
  onMode: (mode: OfficialAuthoringMode) => void;
  onChange: (source: string, format: OfficialContentFormat) => void;
  disabled: boolean; readOnly: boolean; hideLabel?: boolean;
  presentation?: 'compact';
  onImage?: (selection: number) => void; between?: ReactNode; preview?: ReactNode;
  renderMedia?: (placementId: string) => ReactNode;
};

export default function OfficialVisualField(props: OfficialVisualFieldProps) {
  const { label, ariaLabel, value, format, flavor, documentKey, memory, handle, mode, onMode, onChange, disabled, readOnly } = props;
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const sourceField = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(props);
  const [ready, setReady] = useState(false);
  const [visualAvailable, setVisualAvailable] = useState(false);
  const [error, setError] = useState('');
  const [mounts, setMounts] = useState<{ id: string; dom: HTMLElement }[]>([]);
  const [link, setLink] = useState<{ href: string; label: string; empty: boolean } | null>(null);
  const [externalRevision, setExternalRevision] = useState(0);
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    let disposed = false;
    let view: EditorView | null = null;
    setReady(false);
    setLink(null);
    // No editor/view/history implementation is imported by rendering consumers.
    void Promise.all([import('@/lib/official-authoring/session'), import('prosemirror-view')]).then(([editing, browser]) => {
      if (disposed || !host.current) return;
      const current = latest.current;
      const retained = memory.current?.key === documentKey ? memory.current.session : null;
      const session = retained && retained.source === current.value && retained.formatMarker === current.format
        ? retained : new editing.OfficialSession(current.value, flavor, current.format);
      const record: OfficialVisualMemory = { key: documentKey, session, view: null };
      memory.current = record;
      const publish = () => {
        if (disposed) return;
        setError(session.error);
        if (session.source !== latest.current.value || session.formatMarker !== latest.current.format) {
          latest.current.onChange(session.source, session.formatMarker);
        }
      };
      if (session.state) {
        const foundation = editing.foundationViewProps(session);
        view = new browser.EditorView(host.current, {
          ...foundation,
          attributes: { ...foundation.attributes, id, 'aria-label': current.ariaLabel, 'data-placeholder': current.placeholder },
          editable: () => !latest.current.disabled && !latest.current.readOnly && session.mode === 'visual',
          dispatchTransaction(transaction) {
            if (latest.current.disabled || latest.current.readOnly) return;
            session.apply(transaction); view?.updateState(session.state!); publish();
          },
          handleDOMEvents: Object.fromEntries(Object.entries(foundation.handleDOMEvents || {}).map(([event, handler]) => [event, (editor: EditorView, eventObject: Event) => {
            if ((latest.current.disabled || latest.current.readOnly) && ['paste', 'cut', 'drop'].includes(event)) { eventObject.preventDefault(); return true; }
            const result = handler?.(editor, eventObject); publish(); return result;
          }])),
          handleClickOn(_view, _pos, _node, _nodePos, event) { if ((event.target as Element).closest('a')) { event.preventDefault(); return true; } return false; },
          nodeViews: flavor === 'concept' ? { concept_media(node) {
            const dom = document.createElement('div'); dom.contentEditable = 'false';
            const entry = { id: String(node.attrs.placementId), dom };
            setMounts(items => [...items, entry]);
            return { dom, ignoreMutation: () => true, stopEvent: () => true,
              destroy() { if (!disposed) setMounts(items => items.filter(item => item !== entry)); } };
          } } : undefined,
        });
        record.view = view;
      }
      session.setMode(current.mode === 'write' ? 'visual' : current.mode);
      if (!session.state && current.mode === 'write') current.onMode('source');
      if (handle) handle.current = {
        capture: () => session.captureSurface(record.view || undefined),
        selection() {
          if (session.mode === 'source') return sourceField.current?.selectionEnd ?? session.source.length;
          const provenance = session.state?.doc.attrs.provenance as SourceProvenance | undefined;
          if (!provenance || !session.state) return session.source.length;
          // Images are inserted after the current block, never inside its syntax.
          let offset = provenance.prefix.length;
          for (const region of provenance.regions) {
            offset += region.separator.length + region.raw.length;
            if (session.state.selection.to <= region.to) return offset;
          }
          return session.source.length;
        },
        focus: () => { if (session.mode === 'source') sourceField.current?.focus(); else record.view?.focus(); },
      };
      setVisualAvailable(Boolean(session.state)); setError(session.error); setReady(true);
    }).catch(() => { if (!disposed) setError('The visual editor could not load. Your source is preserved.'); });
    return () => {
      disposed = true; view?.destroy();
      if (memory.current?.key === documentKey) memory.current.view = null;
      if (handle) handle.current = null;
      setMounts([]);
    };
  }, [documentKey, flavor, memory, handle, id, externalRevision]);

  useEffect(() => {
    const current = memory.current;
    if (!ready || current?.key !== documentKey) return;
    current.session.setMode(mode === 'write' ? 'visual' : mode);
    if (current.session.state) current.view?.updateState(current.session.state);
    current.view?.setProps({ editable: () => !disabled && !readOnly && mode === 'write' });
  }, [mode, disabled, readOnly, ready, memory, documentKey]);

  // External replacement (load/reset or an Image action) creates a fresh session.
  // Ordinary typing has already updated this same session and does not reset it.
  useEffect(() => {
    const current = memory.current;
    if (!ready || current?.key !== documentKey || current.session.source === value && current.session.formatMarker === format) return;
    setExternalRevision(revision => revision + 1);
  }, [value, format, ready, documentKey, memory]);

  function sync() {
    const current = memory.current;
    if (!current || current.key !== documentKey) return;
    if (current.session.state) current.view?.updateState(current.session.state);
    setError(current.session.error);
    if (current.session.source !== value || current.session.formatMarker !== format) onChange(current.session.source, current.session.formatMarker);
  }
  function changeMode(next: OfficialAuthoringMode) {
    const current = memory.current;
    if (!current || disabled) return;
    if (!current.session.setMode(next === 'write' ? 'visual' : next)) { setError(current.session.error); return; }
    onMode(next); setLink(null);
    if (next === 'write') {
      if (!current.view && current.session.state) setExternalRevision(revision => revision + 1);
      else requestAnimationFrame(() => current.view?.focus());
    }
  }
  function apply(command: Format | 'link') {
    const current = memory.current;
    if (!current || disabled || readOnly) return;
    if (command === 'link') {
      const state = current.session.state;
      if (!state) return;
      const existing = state.selection.$from.marks().find(mark => mark.type.name === 'link');
      setLink({ href: existing?.attrs.href || '', label: state.doc.textBetween(state.selection.from, state.selection.to, ' '), empty: state.selection.empty });
    } else { current.session.format(command); sync(); current.view?.focus(); }
  }
  return <div className={styles.field}>
    {!props.hideLabel ? <label htmlFor={id}><strong>{label}</strong></label> : null}
    <OfficialAuthoringToolbar presentation={props.presentation} label={label} mode={mode} disabled={disabled || !ready} readOnly={readOnly} visualAvailable={visualAvailable}
      onFormat={apply} onMode={changeMode} onImage={props.onImage ? () => props.onImage?.(handle?.current?.selection() ?? value.length) : undefined} />
    {props.between}
    {link ? <div className={styles.link} role="group" aria-label={`${label} link`}>
      <label>Link URL<input autoFocus type="url" value={link.href} onChange={event => setLink({ ...link, href: event.target.value })} placeholder="https://" /></label>
      {link.empty ? <label>Link text<input value={link.label} onChange={event => setLink({ ...link, label: event.target.value })} /></label> : null}
      <div className={styles.actions}>
        <button type="button" className={creatorStyles.toolButton} disabled={disabled || readOnly} onClick={() => {
          if (memory.current?.session.link(link.href, link.empty ? link.label : undefined)) { setLink(null); sync(); memory.current.view?.focus(); }
          else setError(memory.current?.session.error || 'Select text or enter link text.');
        }}>Apply Link</button>
        <button type="button" className={creatorStyles.toolButton} disabled={disabled || readOnly} onClick={() => { memory.current?.session.removeLink(); sync(); setLink(null); memory.current?.view?.focus(); }}>Remove Link</button>
        <button type="button" className={creatorStyles.secondaryButton} onClick={() => { setLink(null); memory.current?.view?.focus(); }}>Cancel</button>
      </div>
    </div> : null}
    {error ? <p role="status" className={styles.error}>{error}</p> : null}
    {!ready && !error ? <p role="status">Loading editor…</p> : null}
    <div ref={host} hidden={mode !== 'write'} className={`${creatorStyles.conceptEditor} ${styles.editor}`} style={flavor === 'question' ? { minHeight: 180 } : undefined} />
    {mounts.map(entry => createPortal(props.renderMedia?.(entry.id) || <span role="status">Image details unavailable. Reload before saving.</span>, entry.dom, entry.id))}
    {mode === 'source' ? <textarea ref={sourceField} id={`${id}-source`} aria-label={`${ariaLabel} source`} className={`${creatorStyles.conceptEditor} ${styles.source}`}
      style={flavor === 'question' ? { minHeight: 180 } : undefined} value={value} maxLength={65536} disabled={disabled || !ready} readOnly={readOnly}
      onChange={event => { if (latest.current.disabled || latest.current.readOnly) return; if (memory.current?.session.replaceSource(event.target.value)) { setVisualAvailable(Boolean(memory.current.session.state)); onChange(memory.current.session.source, memory.current.session.formatMarker); } setError(memory.current?.session.error || ''); }} /> : null}
    {mode === 'preview' ? <div role="region" aria-label={`${label} preview`} className={creatorStyles.conceptEditor} style={{ minHeight: flavor === 'question' ? 180 : undefined, overflow: 'auto', whiteSpace: 'normal' }}>
      {value.trim() ? props.preview || <MarkdownContent markdown={value} mode={flavor} format={format} /> : <p>Nothing to preview yet.</p>}
    </div> : null}
  </div>;
}
