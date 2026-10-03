import type { OfficialContentFormat } from '@/lib/official-content-format';
/** Stable block references, never Storage URLs. Personal content does not use this contract. */
export type ConceptMediaPlacement = {
  placementId: string;
  assetId: string;
  ordinal: number;
  altText: string;
  caption: string;
  reservationId?: string;
  mime?: string;
  width?: number;
  height?: number;
  sha256?: string;
};
export type ConceptMediaContext =
  | { kind: 'draft'; draftId: string; libraryId: string }
  | { kind: 'concept'; conceptId: string; libraryId: string };
export type ConceptMediaManifest = {
  conceptId: string;
  versionId: string | null;
  bodyMarkdown: string;
  body_format?: OfficialContentFormat;
  updated_at?: string;
  placements: ConceptMediaPlacement[];
};

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TOKEN = new RegExp(`^\\[\\[socrates-media:(${UUID})\\]\\]$`);
export const MAX_MEDIA_SOURCE = 1024 * 1024;

export function conceptMediaToken(id: string) {
  if (!new RegExp(`^${UUID}$`).test(id)) throw new Error('Invalid image placement');
  return `[[socrates-media:${id}]]`;
}

/** A token is active only on its own line, separated from surrounding blocks. */
export function conceptMediaBlocks(source: string) {
  if (source.length > MAX_MEDIA_SOURCE) throw new Error('Concept image source is too large');
  const lines = source.split(/\r?\n/);
  const result: { id: string; line: number }[] = [];
  const seen = new Set<string>();
  for (let line = 0; line < lines.length; line++) {
    const match = TOKEN.exec(lines[line]);
    if (!match) continue;
    if ((line > 0 && lines[line - 1].trim()) || (line + 1 < lines.length && lines[line + 1].trim())) {
      throw new Error('Images must be separated from text by a blank line');
    }
    if (seen.has(match[1])) throw new Error('An image placement may appear only once');
    seen.add(match[1]);
    result.push({ id: match[1], line });
  }
  return result;
}

export function orderedConceptMedia(source: string, placements: ConceptMediaPlacement[]) {
  const byId = new Map(placements.map(p => [p.placementId, p]));
  if (byId.size !== placements.length) throw new Error('Duplicate image placement');
  return conceptMediaBlocks(source).map(({ id }, ordinal) => {
    const placement = byId.get(id);
    if (!placement) throw new Error('An image in the Concept is missing its authoring details');
    if (!placement.altText.trim() || placement.altText.length > 2000 || placement.caption.length > 4000) {
      throw new Error('Provide Alt Text for every image (up to 2,000 characters)');
    }
    return { ...placement, ordinal };
  });
}

export function conceptMediaFingerprint(placements: ConceptMediaPlacement[]) {
  return JSON.stringify(placements.map(p => [p.placementId, p.assetId, p.ordinal, p.altText, p.caption]));
}

export function withoutConceptMediaTokens(source: string) {
  // Invalid syntax remains visible and editable. It is never silently stripped.
  const lines = source.split(/\r?\n/);
  try {
    const active = new Set(conceptMediaBlocks(source).map(b => b.line));
    return lines.filter((_, i) => !active.has(i)).join(source.includes('\r\n') ? '\r\n' : '\n');
  } catch { return source; }
}

/** Insert after the containing block; never split a paragraph/list or replace prose. */
export function insertConceptMedia(source: string, selection: number, id: string) {
  const token = conceptMediaToken(id);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let at = Math.max(0, Math.min(source.length, selection));
  const remainder = source.slice(at);
  const boundary = /\r?\n[ \t]*\r?\n/.exec(remainder);
  if (at > 0 && !/\r?\n[ \t]*\r?\n$/.test(source.slice(0, at))) {
    at = boundary ? at + boundary.index : source.length;
  }
  const before = source.slice(0, at);
  const after = source.slice(at);
  const prefix = before && !before.endsWith(newline + newline) ? (before.endsWith(newline) ? newline : newline + newline) : '';
  const suffix = after && !after.startsWith(newline + newline) ? (after.startsWith(newline) ? newline : newline + newline) : '';
  const value = before + prefix + token + suffix + after;
  conceptMediaBlocks(value);
  return { value, selectionStart: before.length + prefix.length + token.length, selectionEnd: before.length + prefix.length + token.length };
}

export function removeConceptMedia(source: string, id: string) {
  return source.split(/(\r?\n)/).map(line => line === conceptMediaToken(id) ? '' : line).join('');
}

export function conceptMediaEndpoint(context: ConceptMediaContext) {
  return `/api/content-media/concepts/${context.kind === 'draft' ? 'new' : context.conceptId}`;
}

type ConceptWriteText = { kind: 'text'; start: number; end: number; text: string; prefix: string; suffix: string };
type ConceptWriteImage = { kind: 'image'; start: number; end: number; placementId: string | null };

/** Write-only projection. Reference bytes and block separators stay in the source, not in text fields. */
export function conceptMediaWriteParts(source: string): (ConceptWriteText | ConceptWriteImage)[] {
  const parts: (ConceptWriteText | ConceptWriteImage)[] = [];
  let at = 0;
  function text(end: number, beforeImage: boolean) {
    const raw = source.slice(at, end);
    const prefix = at > 0 ? /^\r?\n(?:[ \t]*\r?\n)*/.exec(raw)?.[0] || '' : '';
    const remaining = raw.slice(prefix.length);
    const suffix = beforeImage ? /(?:\r?\n[ \t]*)+$/.exec(remaining)?.[0] || '' : '';
    parts.push({ kind: 'text', start: at, end, prefix, suffix, text: remaining.slice(0, remaining.length - suffix.length) });
  }
  // Even incomplete/unrecognized references stay hidden in Write; the save parser remains authoritative.
  for (const match of source.matchAll(/\[\[socrates-media:[^\r\n]*?(?:\]\]|(?=\r?\n|$))/g)) {
    text(match.index, true);
    const id = TOKEN.exec(match[0])?.[1] || null;
    at = match.index + match[0].length;
    parts.push({ kind: 'image', start: match.index, end: at, placementId: id });
  }
  text(source.length, false);
  return parts;
}

/** Editing prose cannot remove the blank-line boundary around an image or rewrite another block. */
export function editConceptMediaText(source: string, part: ConceptWriteText, value: string) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const prefix = part.start > 0 ? part.prefix || newline + newline : part.prefix;
  const suffix = part.end < source.length && value ? part.suffix || newline + newline : part.suffix;
  return { source: source.slice(0, part.start) + prefix + value + suffix + source.slice(part.end), offset: part.start + prefix.length };
}
