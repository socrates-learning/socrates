import React from 'react';
import { type Node as ProseNode, type Mark } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { wrapInList, liftListItem, splitListItem } from 'prosemirror-schema-list';
import { history, undo, redo, isHistoryTransaction } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { parseCard } from '@/components/MarkdownContent';
import { questionSchema as schema, validateDocument } from '@/lib/official-authoring/document';

// Personal Cards keep their existing Markdown contract, not the official format marker.
// Parse through the released reader; reject any edit that cannot round-trip exactly.
export function personalCardDocument(source: string): ProseNode {
  function inline(value: React.ReactNode, marks: readonly Mark[] = []): ProseNode[] {
    if (typeof value === 'string' || typeof value === 'number') return String(value) ? [schema.text(String(value), marks)] : [];
    if (Array.isArray(value)) return value.flatMap(child => inline(child, marks));
    if (!React.isValidElement<{children?: React.ReactNode; href?: string}>(value)) return [];
    const mark = value.type === 'strong' ? schema.marks.strong.create()
      : value.type === 'em' ? schema.marks.em.create()
      : value.type === 'a' ? schema.marks.link.create({ href: value.props.href }) : null;
    return inline(value.props.children, mark ? mark.addToSet(marks) : marks);
  }
  function blocks(value: React.ReactNode): ProseNode[] {
    if (Array.isArray(value)) return value.flatMap(blocks);
    if (!React.isValidElement<{children?: React.ReactNode}>(value)) return [schema.nodes.paragraph.create(null, inline(value))];
    const tag = value.type;
    const children = value.props.children;
    if (tag === 'p') return [schema.nodes.paragraph.create(null, inline(children))];
    if (tag === 'h2' || tag === 'h3') return [schema.nodes.heading.create({level: tag === 'h2' ? 2 : 3}, inline(children))];
    if (tag === 'li') return [schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, inline(children)))];
    if (tag === 'ul' || tag === 'ol') return [schema.nodes[tag === 'ul' ? 'bullet_list' : 'ordered_list'].create(null, blocks(children))];
    if (tag === 'blockquote') {
      const content = blocks(children);
      return [schema.nodes.blockquote.create(null, content.length ? content : [schema.nodes.paragraph.create()])];
    }
    throw new Error('Keep this Card in Source to preserve its formatting.');
  }
  const content = blocks(parseCard(source, true));
  const doc = schema.nodes.doc.create({provenance: {source}}, content.length ? content : [schema.nodes.paragraph.create()]);
  validateDocument(doc);
  return doc;
}

const sameContent = (a: ProseNode, b: ProseNode) => a.content.eq(b.content);
// Blank paragraphs are editing positions, not persisted Card content. The existing
// reader deliberately ignores blank lines. Keep those positions while typing, but
// still require every nonempty block and mark to survive the released reader.
function renderedSignature(doc: ProseNode): string {
  const content: unknown[] = [];
  doc.forEach(node => {
    if ((node.type.name === 'paragraph' || node.type.name === 'heading') && !node.content.size) return;
    content.push(node.toJSON());
  });
  return JSON.stringify(content);
}
const escapeText = (text: string) => text.replace(/[\\*\[\]()>#-]/g, '\\$&');
function serializeInline(node: ProseNode) {
  const nodes: ProseNode[] = []; node.forEach(child => nodes.push(child));
  function run(items: ProseNode[], depth = 0): string {
    let result = '';
    for (let i = 0; i < items.length;) {
      const mark = items[i].marks[depth];
      if (!mark) { result += escapeText(items[i].text || ''); i++; continue; }
      let end = i + 1;
      while (end < items.length && items[end].marks[depth]?.eq(mark)) end++;
      const body = run(items.slice(i, end), depth + 1);
      result += mark.type.name === 'strong' ? `**${body}**` : mark.type.name === 'em' ? `*${body}*` : `[${body}](${mark.attrs.href})`;
      i = end;
    }
    return result;
  }
  return run(nodes);
}
export function serializePersonalCard(doc: ProseNode): string {
  function block(node: ProseNode): string {
    if (node.type.name === 'paragraph') return serializeInline(node);
    if (node.type.name === 'heading') return node.content.size ? `${'#'.repeat(node.attrs.level)} ${serializeInline(node)}` : '';
    const children: string[] = [];
    node.forEach((child, _offset, index) => children.push(node.type.name === 'bullet_list' ? `- ${block(child)}`
      : node.type.name === 'ordered_list' ? `${index + 1}. ${block(child)}` : block(child)));
    if (node.type.name === 'blockquote') return children.join('\n\n').split('\n').map(line => `> ${line}`).join('\n');
    return children.join(node.type.name === 'doc' ? '\n\n' : '\n');
  }
  const source = block(doc);
  if (renderedSignature(doc) !== renderedSignature(personalCardDocument(source))) throw new Error('This formatting cannot be saved without changing the Card. Use Source to preserve the text.');
  return source;
}

export class PersonalCardSession {
  state: EditorState;
  readonly original: ProseNode;
  error = '';
  constructor(source: string, readonly limit: number) {
    this.original = personalCardDocument(source);
    this.state = EditorState.create({doc: this.original, plugins: [history(), keymap({
      'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo,
      'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em),
      Enter: splitListItem(schema.nodes.list_item),
    }), keymap(baseKeymap)]});
  }
  get source(): string { return this.state.doc.attrs.provenance.source; }
  apply(tr: Transaction) {
    try {
      if (!tr.before.eq(this.state.doc)) throw new Error('The editor changed. Retry your edit.');
      validateDocument(tr.doc);
      if (tr.docChanged && !isHistoryTransaction(tr)) {
        const source = sameContent(tr.doc, this.original) ? this.original.attrs.provenance.source
          : sameContent(tr.doc, this.state.doc) ? this.source : serializePersonalCard(tr.doc);
        if (source.length > this.limit) throw new Error(`Keep this field within ${this.limit} characters.`);
        tr.setDocAttribute('provenance', {source});
      }
      this.state = this.state.apply(tr); this.error = ''; return true;
    } catch (error) { this.error = error instanceof Error ? error.message : 'The edit could not be applied.'; return false; }
  }
  command(name: string) {
    const s = this.state;
    let command;
    if (name === 'undo') command = undo;
    else if (name === 'redo') command = redo;
    else if (name === 'bold' || name === 'italic') command = toggleMark(schema.marks[name === 'bold' ? 'strong' : 'em']);
    else if (name === 'heading') command = setBlockType(s.selection.$from.parent.type === schema.nodes.heading ? schema.nodes.paragraph : schema.nodes.heading, {level: 2});
    else if (name === 'quote') command = s.selection.$from.depth > 1 && s.selection.$from.node(1).type === schema.nodes.blockquote ? lift : wrapIn(schema.nodes.blockquote);
    else {
      const target = name === 'bulleted-list' ? schema.nodes.bullet_list : schema.nodes.ordered_list;
      command = s.selection.$from.depth > 1 && s.selection.$from.node(1).type === target ? liftListItem(schema.nodes.list_item) : wrapInList(target);
    }
    return command(s, tr => this.apply(tr));
  }
}
