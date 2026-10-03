import { type Node as DocumentNode } from 'prosemirror-model';
import type { Mapping } from 'prosemirror-transform';
import { SOURCE_LIMIT, documentSignature, officialSchema, validateDocument, type OfficialFlavor } from './document';
import { parseOfficialContent, serializeOfficialBlock, type OfficialContentFormat, type OfficialNode, type SourceProvenance, type SourceRegion } from '../official-content-format';

export type { SourceProvenance, SourceRegion } from '../official-content-format';
export type SourceResult =
  | { mode: 'visual'; source: string; doc: DocumentNode; provenance: SourceProvenance }
  | { mode: 'source'; source: string; reason: string };

export function parseOfficialSource(source: string, flavor: OfficialFlavor, format: OfficialContentFormat = 'legacy'): SourceResult {
  const parsed = parseOfficialContent(source, flavor, format);
  if (parsed.mode === 'source') return parsed;
  try {
    const schema = officialSchema(flavor);
    const doc = schema.nodeFromJSON(parsed.document);
    validateDocument(doc);
    const provenance = { ...parsed.provenance, regions: parsed.provenance.regions.map((region, i) => ({ ...region, signature: JSON.stringify(doc.child(i).toJSON()) })) };
    return { mode: 'visual', source, doc: schema.nodes.doc.create({ provenance }, doc.content), provenance };
  } catch (error) {
    return { mode: 'source', source, reason: error instanceof Error ? error.message : 'Source cannot safely enter Visual' };
  }
}

export function serializeBlock(node: DocumentNode, newline = '\n'): string {
  return serializeOfficialBlock(node.toJSON() as OfficialNode, newline);
}

export function sourceOf(doc: DocumentNode): string {
  const provenance = doc.attrs.provenance as SourceProvenance | null;
  if (!provenance) throw new Error('Missing source provenance');
  return provenance.source;
}

export function formatOf(doc: DocumentNode): OfficialContentFormat {
  const provenance = doc.attrs.provenance as SourceProvenance | null;
  if (!provenance) throw new Error('Missing source provenance');
  return provenance.format;
}

export function advanceSource(before: DocumentNode, after: DocumentNode, mapping: Mapping): SourceProvenance {
  const previous = before.attrs.provenance as SourceProvenance;
  const newline = previous.source.includes('\r\n') ? '\r\n' : '\n';
  const converting = previous.format === 'legacy';
  const regions: SourceRegion[] = [];
  const candidates = previous.regions.map(region => ({ region, from: mapping.map(region.from, -1), to: mapping.map(region.to, 1) }));
  after.forEach((node, from) => {
    const to = from + node.nodeSize;
    const match = candidates.find(candidate => candidate.from === from && candidate.to === to);
    const signature = JSON.stringify(node.toJSON());
    const raw = !converting && match?.region.signature === signature ? match.region.raw : serializeBlock(node, newline);
    regions.push({ from, to, raw, separator: regions.length ? !converting && match?.region.separator || newline + newline : '', signature });
  });
  // Cross-format conversion escapes the whole semantic surface, including
  // formerly literal punctuation in untouched regions. Same-format edits keep
  // original spellings where they still describe exactly the same document.
  const prefix = converting ? '' : previous.prefix, suffix = converting ? '' : previous.suffix;
  let source = prefix + regions.map(region => region.separator + region.raw).join('') + suffix;
  let parsed = parseOfficialSource(source, previous.flavor, 'visual_markdown_v1');
  if (parsed.mode !== 'visual' || !sameDocumentContent(after, parsed.doc)) {
    const canonical: string[] = [];
    after.forEach(node => canonical.push(serializeBlock(node, newline)));
    source = canonical.join(newline + newline);
    parsed = parseOfficialSource(source, previous.flavor, 'visual_markdown_v1');
  }
  if (source.length > SOURCE_LIMIT) throw new Error('Encoded source exceeds visual editing limits');
  if (parsed.mode !== 'visual' || !sameDocumentContent(after, parsed.doc)) throw new Error('This edit cannot be represented without changing meaning; use Source');
  return parsed.provenance;
}

export function sameDocumentContent(a: DocumentNode, b: DocumentNode) {
  return documentSignature(a) === documentSignature(b);
}
