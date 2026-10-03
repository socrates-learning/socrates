import { Fragment, Slice, type Node as DocumentNode } from 'prosemirror-model';
import { AllSelection, EditorState, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { baseKeymap, chainCommands, lift, liftEmptyBlock, setBlockType, splitBlockKeepMarks, toggleMark, wrapIn } from 'prosemirror-commands';
import { liftListItem, splitListItemKeepMarks, wrapInList } from 'prosemirror-schema-list';
import { closeHistory, history, isHistoryTransaction, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { DirectEditorProps, EditorView } from 'prosemirror-view';
import { SOURCE_LIMIT, officialSchema, placementIds, safeLink, validateDocument, type OfficialFlavor } from './document';
import { advanceSource, formatOf, parseOfficialSource, sameDocumentContent, sourceOf } from './markdown';
import { officialContentFormat, type OfficialContentFormat, type SourceProvenance } from '../official-content-format';

export type Format = 'bold' | 'italic' | 'heading' | 'bulleted-list' | 'numbered-list' | 'quote';
export type EditingMode = 'visual' | 'preview' | 'source';
const clipboardType = 'application/x-socrates-official-prose+json';

function ancestor(state: EditorState, names: string[]) {
  const at = state.selection.$from;
  for (let depth = at.depth; depth > 0; depth--) {
    if (names.includes(at.node(depth).type.name)) return { node: at.node(depth), position: at.before(depth) };
  }
  return null;
}

function formatting(format: Format, state: EditorState): Command {
  const schema = state.schema;
  if (format === 'bold' || format === 'italic') return toggleMark(schema.marks[format === 'bold' ? 'strong' : 'em']);
  if (format === 'heading') return setBlockType(state.selection.$from.parent.type === schema.nodes.heading ? schema.nodes.paragraph : schema.nodes.heading, { level: 2 });
  if (format === 'quote') return ancestor(state, ['blockquote']) ? lift : wrapIn(schema.nodes.blockquote);
  if (state.selection instanceof AllSelection) return (s, dispatch) => {
    // Select All uses document boundaries rather than inline positions. Resolve
    // its text endpoints before constructing or removing the flat item wrappers.
    const selected = s.apply(s.tr.setSelection(TextSelection.between(s.selection.$from, s.selection.$to)));
    if (!(selected.selection instanceof TextSelection)) return false;
    return formatting(format, selected)(selected, dispatch);
  };
  const target = format === 'bulleted-list' ? schema.nodes.bullet_list : schema.nodes.ordered_list;
  const current = ancestor(state, ['bullet_list', 'ordered_list']);
  if (current?.node.type === target) return (s, dispatch) => {
    const range = s.selection.$from.blockRange(s.selection.$to, node => node.type === target);
    if (!range || range.endIndex - range.startIndex < 2) return liftListItem(schema.nodes.list_item)(s, dispatch);
    const before: DocumentNode[] = []; const after: DocumentNode[] = []; const paragraphs: DocumentNode[] = [];
    range.parent.forEach((item, _offset, index) => {
      if (index < range.startIndex) before.push(item);
      else if (index >= range.endIndex) after.push(item);
      else paragraphs.push(item.firstChild!);
    });
    const prefix = before.length ? target.create(null, before) : null;
    const replacement = Fragment.from([
      ...(prefix ? [prefix] : []), ...paragraphs, ...(after.length ? [target.create(null, after)] : []),
    ]);
    const $list = s.doc.resolve(current.position);
    if (!$list.parent.canReplace($list.index(), $list.index() + 1, replacement)) return false;
    if (dispatch) {
      // Lift the selected flat items together without an intermediate item
      // containing multiple paragraphs, which this schema deliberately rejects.
      const mapPosition = (position: number) => {
        let oldStart = range.start;
        let newStart = current.position + (prefix?.nodeSize || 0);
        for (const paragraph of paragraphs) {
          if (position < oldStart + paragraph.nodeSize + 2) return newStart + position - oldStart - 1;
          oldStart += paragraph.nodeSize + 2; newStart += paragraph.nodeSize;
        }
        return newStart - 1;
      };
      const tr = s.tr.replaceWith(current.position, current.position + current.node.nodeSize, replacement);
      tr.setSelection(TextSelection.create(tr.doc, mapPosition(s.selection.anchor), mapPosition(s.selection.head)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
  if (current) return (s, dispatch) => { dispatch?.(s.tr.setNodeMarkup(current.position, target)); return true; };
  return (s, dispatch) => {
    const range = s.selection.$from.blockRange(s.selection.$to);
    if (!range || range.endIndex - range.startIndex < 2) return wrapInList(target)(s, dispatch);
    if (!range.parent.canReplaceWith(range.startIndex, range.endIndex, target)) return false;
    const paragraphs: DocumentNode[] = [];
    for (let i = range.startIndex; i < range.endIndex; i++) {
      const paragraph = range.parent.child(i);
      if (paragraph.type !== schema.nodes.paragraph) return false;
      paragraphs.push(paragraph);
    }
    // The flat schema allows one paragraph per item. Build the final shape in
    // one step instead of wrapping all paragraphs in an invalid shared item.
    if (dispatch) {
      const list = target.create(null, paragraphs.map(paragraph => schema.nodes.list_item.create(null, paragraph)));
      const mapPosition = (position: number) => {
        let start = range.start;
        for (let i = 0; i < paragraphs.length; i++) {
          if (position < start + paragraphs[i].nodeSize) return position + 2 * (i + 1);
          start += paragraphs[i].nodeSize;
        }
        return position + 2 * paragraphs.length;
      };
      const tr = s.tr.replaceWith(range.start, range.end, list);
      tr.setSelection(TextSelection.create(tr.doc, mapPosition(s.selection.anchor), mapPosition(s.selection.head)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

function enterCommand(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const emptyList: Command = (s, d) => s.selection.$from.parent.content.size === 0 && liftListItem(s.schema.nodes.list_item)(s, d);
  return chainCommands(splitListItemKeepMarks(state.schema.nodes.list_item), emptyList, liftEmptyBlock, splitBlockKeepMarks)(state, dispatch);
}

function linkRange(state: EditorState) {
  const { from, to, $from } = state.selection;
  if (from !== to) return { from, to };
  const runs: { from: number; to: number; href: string }[] = [];
  $from.parent.forEach((node, offset) => {
    const link = node.marks.find(mark => mark.type === state.schema.marks.link);
    if (link) runs.push({ from: $from.start() + offset, to: $from.start() + offset + node.nodeSize, href: link.attrs.href });
  });
  const hit = runs.findIndex(run => run.from <= from && from < run.to);
  const selected = hit >= 0 ? hit : runs.findIndex(run => run.to === from);
  if (selected < 0) return { from, to };
  let start = selected; let end = selected;
  while (start > 0 && runs[start - 1].to === runs[start].from && runs[start - 1].href === runs[selected].href) start--;
  while (end + 1 < runs.length && runs[end + 1].from === runs[end].to && runs[end + 1].href === runs[selected].href) end++;
  return { from: runs[start].from, to: runs[end].to };
}

function validClipboardNode(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 8) return false;
  const node = value as Record<string, unknown>;
  if (!['text', 'paragraph', 'heading', 'bullet_list', 'ordered_list', 'list_item', 'blockquote'].includes(String(node.type))) return false;
  if (Object.keys(node).some(key => !['type', 'text', 'attrs', 'content', 'marks'].includes(key))) return false;
  if (node.text !== undefined && typeof node.text !== 'string') return false;
  if (node.attrs !== undefined) {
    if (!node.attrs || typeof node.attrs !== 'object') return false;
    const attrs = node.attrs as Record<string, unknown>;
    if (Object.keys(attrs).some(key => key !== 'level') || (Object.keys(attrs).length && node.type !== 'heading')) return false;
    if (attrs.level !== undefined && attrs.level !== 2 && attrs.level !== 3) return false;
  }
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) return false;
    for (const item of node.marks) {
      if (!item || typeof item !== 'object' || !['strong', 'em', 'link'].includes(item.type)) return false;
      if (Object.keys(item).some(key => !['type', 'attrs'].includes(key))) return false;
      const attrs = item.attrs || {};
      if (Object.keys(attrs).some(key => item.type !== 'link' || key !== 'href')) return false;
      if (item.type === 'link' && (typeof attrs.href !== 'string' || !safeLink(attrs.href))) return false;
    }
  }
  return node.content === undefined || Array.isArray(node.content) && node.content.every(child => validClipboardNode(child, depth + 1));
}

export class OfficialSession {
  readonly flavor: OfficialFlavor;
  state: EditorState | null = null;
  mode: EditingMode;
  error = '';
  composing = false;
  private fallback: string;
  private fallbackFormat: OfficialContentFormat;
  private loadedDocument: DocumentNode | null = null;

  constructor(source: string, flavor: OfficialFlavor, format: OfficialContentFormat = 'legacy') {
    this.flavor = flavor;
    this.fallback = source;
    this.fallbackFormat = officialContentFormat(format);
    const parsed = parseOfficialSource(source, flavor, format);
    this.mode = parsed.mode;
    if (parsed.mode === 'source') { this.error = parsed.reason; return; }
    this.loadedDocument = parsed.doc;
    this.state = EditorState.create({ doc: parsed.doc, plugins: [
      history({ depth: 100 }),
      keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo,
        'Mod-b': (s, d) => formatting('bold', s)(s, d), 'Mod-i': (s, d) => formatting('italic', s)(s, d), Enter: enterCommand }),
      keymap(baseKeymap),
    ] });
  }

  get source() { return this.state ? sourceOf(this.state.doc) : this.fallback; }
  get formatMarker() { return this.state ? formatOf(this.state.doc) : this.fallbackFormat; }

  setMode(mode: EditingMode) {
    if (this.composing) return this.reject('Finish text composition before switching mode');
    if (mode === 'visual' && !this.state) return false;
    this.mode = mode;
    return true;
  }

  captureSource(view?: EditorView): string {
    if (this.composing || view?.composing) throw new Error('Finish text composition before saving');
    return this.source;
  }

  captureSurface(view?: EditorView) {
    return { source: this.captureSource(view), format: this.formatMarker };
  }

  replaceSource(source: string) {
    if (this.mode !== 'source' || this.composing) return this.reject('Finish editing before changing Source');
    if (source === this.source) return true;
    // Source is an explicit compatibility boundary. It never opts into another
    // grammar, even when the new spelling resembles supported Markdown.
    const tokenIds = (value: string) => Array.from(value.matchAll(/^\[\[socrates-media:([0-9a-f-]+)\]\]\r?$/gm), m => m[1]);
    if (this.flavor === 'concept' && JSON.stringify(tokenIds(source)) !== JSON.stringify(tokenIds(this.source))) return this.reject('Use the Image controls to change protected images');
    const replacement = new OfficialSession(source, this.flavor, this.formatMarker);
    this.fallback = source;
    this.fallbackFormat = replacement.formatMarker;
    this.state = replacement.state;
    this.error = replacement.error;
    // A Source edit starts a new framework history at its explicit source
    // boundary; the mounted source textarea retains native text Undo.
    return true;
  }

  private reject(reason: string) { this.error = reason; return false; }

  apply(transaction: Transaction): boolean {
    const state = this.state;
    if (!state || this.mode !== 'visual') return this.reject('Visual editing is unavailable');
    try {
      if (!transaction.before.eq(state.doc)) return this.reject('Stale editing transaction');
      validateDocument(transaction.doc);
      if (JSON.stringify(placementIds(transaction.doc)) !== JSON.stringify(placementIds(state.doc))) return this.reject('Use the Image controls to change protected images');
      if (transaction.docChanged && !isHistoryTransaction(transaction)) {
        if (transaction.doc.attrs.provenance !== state.doc.attrs.provenance) return this.reject('Source provenance is managed by the editor');
        if (!sameDocumentContent(state.doc, transaction.doc)) {
          const provenance = this.loadedDocument && sameDocumentContent(transaction.doc, this.loadedDocument)
            ? this.loadedDocument.attrs.provenance as SourceProvenance
            : advanceSource(state.doc, transaction.doc, transaction.mapping);
          transaction.setDocAttribute('provenance', provenance);
        }
      }
      this.state = state.apply(transaction);
      this.error = '';
      return true;
    } catch (error) { return this.reject(error instanceof Error ? error.message : 'Editing transaction could not be applied'); }
  }

  private command(command: Command, boundary = true) {
    if (!this.state || this.mode !== 'visual' || this.composing) return false;
    let applied = false;
    const handled = command(this.state, tr => { applied = this.apply(boundary && tr.docChanged ? closeHistory(tr) : tr); });
    return handled && applied;
  }

  select(anchor: number, head = anchor) {
    if (!this.state) return false;
    try {
      if (!this.state.doc.resolve(anchor).parent.inlineContent || !this.state.doc.resolve(head).parent.inlineContent) return this.reject('Selection is outside editable text');
      return this.apply(this.state.tr.setSelection(TextSelection.create(this.state.doc, anchor, head)));
    }
    catch { return this.reject('Selection is outside this document'); }
  }

  format(format: Format) { return this.state ? this.command(formatting(format, this.state)) : false; }
  enter() { return this.command(enterCommand); }
  undo() { return this.command(undo, false); }
  redo() { return this.command(redo, false); }
  insertText(text: string) {
    if (!this.state || this.mode !== 'visual') return false;
    return this.apply(this.state.tr.insertText(text));
  }

  link(href: string, label?: string) {
    if (!safeLink(href)) return this.reject('Use an explicit HTTP or HTTPS link');
    let balance = 0;
    for (const char of href) { if (char === '(') balance++; if (char === ')' && --balance < 0) return this.reject('Encode unmatched URL parentheses'); }
    if (balance) return this.reject('Encode unmatched URL parentheses');
    return this.command((state, dispatch) => {
      const { from, to } = linkRange(state);
      if (from === to && !label) return false;
      const tr = state.tr;
      const mark = state.schema.marks.link.create({ href });
      if (label !== undefined) {
        if (!label || /\r|\n/.test(label)) return false;
        const marks = (state.storedMarks || state.selection.$from.marks()).filter(m => m.type !== state.schema.marks.link);
        tr.replaceWith(from, to, state.schema.text(label, [...marks, mark]));
        tr.setSelection(TextSelection.create(tr.doc, from + label.length));
      } else tr.removeMark(from, to, state.schema.marks.link).addMark(from, to, mark);
      dispatch?.(tr); return true;
    });
  }

  removeLink() {
    return this.command((state, dispatch) => {
      const range = linkRange(state);
      if (range.from === range.to) return false;
      dispatch?.(state.tr.removeMark(range.from, range.to, state.schema.marks.link)); return true;
    });
  }

  copy(): { text: string; internal: string | null } {
    if (!this.state) return { text: this.source, internal: null };
    const { from, to } = this.state.selection;
    const slice = this.state.selection.content();
    let hasImage = false;
    slice.content.descendants(node => { if (node.type.name === 'concept_media') hasImage = true; });
    return { text: this.state.doc.textBetween(from, to, '\n'), internal: hasImage ? null : JSON.stringify({ version: 1, slice: slice.toJSON() }) };
  }

  paste(text: string, internal?: string | null) {
    if (!this.state) return false;
    try {
      if (text.length > SOURCE_LIMIT || internal && internal.length > SOURCE_LIMIT * 4) return this.reject('Pasted content exceeds visual editing limits');
      let slice: Slice | null = null;
      if (internal) {
        const value = JSON.parse(internal);
        if (!value || Object.keys(value).some(key => !['version', 'slice'].includes(key)) || value.version !== 1 || !value.slice ||
          Object.keys(value.slice).some(key => !['content', 'openStart', 'openEnd'].includes(key)) ||
          !Array.isArray(value.slice.content) || !value.slice.content.every((node: unknown) => validClipboardNode(node)) ||
          ![value.slice.openStart || 0, value.slice.openEnd || 0].every(n => Number.isInteger(n) && n >= 0 && n <= 8)) return this.reject('Unsupported internal clipboard content');
        slice = Slice.fromJSON(this.state.schema, value.slice);
      } else {
        const paragraphs = text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map(part => {
          const value = this.flavor === 'concept' ? part.replace(/\n/g, ' ') : part;
          return this.state!.schema.nodes.paragraph.create(null, value ? this.state!.schema.text(value) : undefined);
        });
        slice = Slice.maxOpen(Fragment.from(paragraphs));
      }
      return this.apply(closeHistory(this.state.tr.replaceSelection(slice)));
    } catch { return this.reject('Unsupported clipboard content'); }
  }
}

export function foundationViewProps(session: OfficialSession): DirectEditorProps {
  if (!session.state) throw new Error('Source fallback has no editable visual view');
  return {
    state: session.state,
    attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Official authoring foundation', style: 'white-space: pre-wrap' },
    editable: () => session.mode === 'visual',
    dispatchTransaction(this: EditorView, transaction) {
      session.apply(transaction);
      this.updateState(session.state!);
    },
    handleDOMEvents: {
      paste(view, event) {
        event.preventDefault();
        const data = (event as ClipboardEvent).clipboardData;
        if (data?.files.length) { session.error = 'Use Add Image for image files'; return true; }
        session.paste(data?.getData('text/plain') || '', data?.getData(clipboardType));
        view.updateState(session.state!); return true;
      },
      copy(_view, event) {
        const data = (event as ClipboardEvent).clipboardData;
        if (!data) return true;
        event.preventDefault(); const copied = session.copy();
        data.setData('text/plain', copied.text);
        if (copied.internal) data.setData(clipboardType, copied.internal);
        return true;
      },
      cut(view, event) {
        const data = (event as ClipboardEvent).clipboardData;
        if (!data) return true;
        event.preventDefault(); const copied = session.copy();
        if (!copied.internal) { session.error = 'Use the Image controls to change protected images'; return true; }
        data.setData('text/plain', copied.text); data.setData(clipboardType, copied.internal);
        session.apply(closeHistory(session.state!.tr.deleteSelection())); view.updateState(session.state!); return true;
      },
      drop(_view, event) { event.preventDefault(); session.error = 'Use the authoring controls; document drag/drop is unavailable'; return true; },
      compositionstart() { session.composing = true; return false; },
      compositionend() { session.composing = false; return false; },
    },
  };
}

export function createPlainDocument(text: string, flavor: OfficialFlavor): DocumentNode {
  const schema = officialSchema(flavor);
  return schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined));
}
