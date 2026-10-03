import { Schema, type Node as DocumentNode, type NodeSpec } from 'prosemirror-model';

import { SOURCE_LIMIT, NODE_LIMIT, DEPTH_LIMIT, placementPattern, safeLink, type OfficialFlavor } from '../official-content-format';
export { SOURCE_LIMIT, NODE_LIMIT, DEPTH_LIMIT, WORK_LIMIT, placementPattern, safeLink, type OfficialFlavor } from '../official-content-format';

function createSchema(flavor: OfficialFlavor) {
  const nodes: Record<string, NodeSpec> = {
    // Provenance is ephemeral editing state. It never appears in DOM or a save payload.
    doc: { content: 'block+', attrs: { provenance: { default: null } } },
    paragraph: {
      content: 'inline*', group: 'block', whitespace: 'pre',
      parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0],
    },
    heading: {
      attrs: { level: { default: 2, validate: value => { if (value !== 2 && value !== 3) throw new Error('Unsupported heading'); } } },
      content: 'inline*', group: 'block', defining: true, whitespace: 'pre',
      parseDOM: [{ tag: 'h2', attrs: { level: 2 } }, { tag: 'h3', attrs: { level: 3 } }],
      toDOM: node => [node.attrs.level === 3 ? 'h3' : 'h2', 0],
    },
    bullet_list: { content: 'list_item+', group: 'block', parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
    ordered_list: { content: 'list_item+', group: 'block', parseDOM: [{ tag: 'ol' }], toDOM: () => ['ol', 0] },
    list_item: { content: 'paragraph', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    blockquote: { content: 'paragraph+', group: 'block', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', 0] },
    text: { group: 'inline' },
  };
  if (flavor === 'concept') nodes.concept_media = {
    group: 'block', atom: true, isolating: true, selectable: false, draggable: false,
    attrs: { placementId: { validate: value => {
      if (typeof value !== 'string' || !placementPattern.test(value)) throw new Error('Invalid placement identity');
    } } },
    // A later controller-owned NodeView supplies the real image. No URL is accepted.
    toDOM: () => ['div', { contenteditable: 'false', role: 'img', 'aria-label': 'Protected Concept image' }],
  };
  return new Schema({ nodes, marks: {
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    link: {
      attrs: { href: { validate: value => { if (typeof value !== 'string' || !safeLink(value)) throw new Error('Unsafe link'); } } },
      inclusive: false,
      // Links are formatting in Write. Navigation belongs to a later explicit control.
      toDOM: node => ['a', { href: node.attrs.href, rel: 'noopener noreferrer', tabindex: '-1' }, 0],
    },
  } });
}

export const questionSchema = createSchema('question');
export const conceptSchema = createSchema('concept');
export const officialSchema = (flavor: OfficialFlavor) => flavor === 'concept' ? conceptSchema : questionSchema;

export function placementIds(doc: DocumentNode): string[] {
  const ids: string[] = [];
  doc.descendants(node => { if (node.type.name === 'concept_media') ids.push(node.attrs.placementId); });
  return ids;
}

export function validateDocument(doc: DocumentNode) {
  doc.check();
  let count = 0;
  let textLength = 0;
  const ids = new Set<string>();
  function visit(node: DocumentNode, depth: number) {
    if (++count > NODE_LIMIT || depth > DEPTH_LIMIT) throw new Error('Document exceeds visual editing limits');
    textLength += node.text?.length || 0;
    if (textLength > SOURCE_LIMIT) throw new Error('Document exceeds visual editing limits');
    if (node.type.name === 'concept_media') {
      const id = node.attrs.placementId as string;
      if (depth !== 1 || ids.has(id)) throw new Error('Invalid image placement sequence');
      ids.add(id);
    }
    for (const mark of node.marks) {
      if (mark.type.name === 'link' && !safeLink(mark.attrs.href)) throw new Error('Unsafe link');
    }
    node.forEach(child => visit(child, depth + 1));
  }
  visit(doc, 0);
}

export function documentSignature(doc: DocumentNode): string {
  return JSON.stringify(doc.content.toJSON());
}
