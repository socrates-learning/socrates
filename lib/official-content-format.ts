// This module is the interpretation contract, not an editor. Keep it dependency
// free so official reading surfaces never import ProseMirror or browser editing.
export type OfficialContentFormat = 'legacy' | 'visual_markdown_v1';
export type OfficialFlavor = 'concept' | 'question';
export const SOURCE_LIMIT = 65536;
export const NODE_LIMIT = 4096;
export const DEPTH_LIMIT = 8;
export const WORK_LIMIT = 1000000;
export const placementPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type OfficialMark = { type: 'strong' | 'em' } | { type: 'link'; attrs: { href: string } };
export type OfficialNode = {
  type: 'doc' | 'paragraph' | 'heading' | 'bullet_list' | 'ordered_list' | 'list_item' | 'blockquote' | 'concept_media' | 'text';
  text?: string;
  attrs?: { level?: number; placementId?: string };
  marks?: OfficialMark[];
  content?: OfficialNode[];
};
export type SourceRegion = { from: number; to: number; raw: string; separator: string; signature: string };
export type SourceProvenance = { source: string; prefix: string; suffix: string; regions: SourceRegion[]; flavor: OfficialFlavor; format: OfficialContentFormat };
export type OfficialParseResult =
  | { mode: 'visual'; document: OfficialNode; provenance: SourceProvenance }
  | { mode: 'source'; source: string; reason: string };

export function officialContentFormat(value: unknown): OfficialContentFormat {
  if (value !== 'legacy' && value !== 'visual_markdown_v1') throw new Error('Unknown official content format');
  return value;
}

// Only old immutable accepted-Answer snapshots may omit their marker.
export function snapshotAnswerFormat(value: unknown): OfficialContentFormat {
  return value === undefined ? 'legacy' : officialContentFormat(value);
}

export function safeLink(destination: string): string | null {
  if (!/^https?:\/\//i.test(destination) || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(destination)) return null;
  try {
    const url = new URL(destination);
    return url.hostname && ['http:', 'https:'].includes(url.protocol) ? destination : null;
  } catch { return null; }
}

function fail(reason: string): never { throw new Error(reason); }
type Budget = { work: number };
const spend = (budget: Budget, n = 1) => { budget.work -= n; if (budget.work < 0) fail('Source exceeds visual parsing limits'); };
const escapable = /[\\*_\[\]()>#\-.`~<!+|=]/;
const rank = (m: OfficialMark) => ['strong', 'em', 'link'].indexOf(m.type);
const node = (type: OfficialNode['type'], content: OfficialNode[] = [], attrs?: OfficialNode['attrs']): OfficialNode => ({ type, ...(attrs ? { attrs } : {}), ...(content.length ? { content } : {}) });
const text = (value: string, marks: OfficialMark[] = []): OfficialNode => ({ type: 'text', text: value, ...(marks.length ? { marks: [...marks].sort((a, b) => rank(a) - rank(b)) } : {}) });
export const officialNodeSize = (n: OfficialNode): number => n.type === 'text' ? n.text!.length : n.type === 'concept_media' ? 1 : 2 + (n.content || []).reduce((a, b) => a + officialNodeSize(b), 0);

function mergeText(nodes: OfficialNode[]) {
  const out: OfficialNode[] = [];
  for (const item of nodes) {
    const last = out.at(-1);
    if (last?.type === 'text' && item.type === 'text' && JSON.stringify(last.marks) === JSON.stringify(item.marks)) last.text += item.text!;
    else out.push(item);
  }
  return out;
}

// Deliberately the released Concept regexp, including its combined-emphasis
// behavior. Legacy Questions do not call it: their punctuation is all literal.
function legacyInline(value: string): OfficialNode[] {
  const result: OfficialNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let end = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > end) result.push(text(value.slice(end, match.index)));
    const bold = match[0].startsWith('**');
    result.push(text(match[0].slice(bold ? 2 : 1, bold ? -2 : -1), [{ type: bold ? 'strong' : 'em' }]));
    end = match.index + match[0].length;
  }
  if (end < value.length) result.push(text(value.slice(end)));
  return result;
}

function v1Inline(source: string, budget: Budget, depth = 0, marks: OfficialMark[] = [], links = true): OfficialNode[] {
  if (depth > DEPTH_LIMIT) fail('Formatting is too deeply nested');
  const result: OfficialNode[] = [];
  let literal = '';
  const flush = () => { if (literal) { result.push(text(literal, marks)); literal = ''; } };
  for (let at = 0; at < source.length;) {
    spend(budget);
    const char = source[at];
    if (char === '\\') {
      if (!escapable.test(source[at + 1] || '')) fail('Unsupported escape remains in Source');
      literal += source[at + 1]; at += 2; continue;
    }
    if (source.startsWith('![', at)) fail('Markdown images remain in Source');
    if (char === '[') {
      let end = at + 1;
      for (; end < source.length; end++) {
        spend(budget);
        if (source[end] === '\\') { end++; continue; }
        if (source[end] === ']') break;
      }
      if (source.slice(end, end + 2) === '](') {
        if (!links) fail('Nested links remain in Source');
        let close = end + 2, balance = 1;
        for (; close < source.length; close++) {
          spend(budget);
          if (source[close] === '(') balance++;
          if (source[close] === ')' && --balance === 0) break;
        }
        const href = source.slice(end + 2, close);
        if (balance || end === at + 1 || !safeLink(href)) fail('Malformed or unsafe link remains in Source');
        flush();
        result.push(...v1Inline(source.slice(at + 1, end), budget, depth + 1, [...marks, { type: 'link', attrs: { href } }], false));
        at = close + 1; continue;
      }
      if (source.slice(at).includes('](')) fail('Ambiguous link remains in Source');
    }
    if (char === '*' || char === '_') {
      const marker = char === '_' ? '_' : source.startsWith('***', at) ? '***' : source.startsWith('**', at) ? '**' : '*';
      if (char === '_' && source[at + 1] === '_') fail('Unsupported emphasis spelling remains in Source');
      let end = -1;
      for (let i = at + marker.length; i < source.length; i++) {
        spend(budget);
        if (source[i] === '\\') { i++; continue; }
        if (source[i] !== char) continue;
        let run = 1;
        while (source[i + run] === char) { run++; spend(budget); }
        if (run >= marker.length && (marker !== '*' || run % 2)) { end = i + run - marker.length; break; }
        i += run - 1;
      }
      if (end <= at + marker.length) fail('Unmatched or ambiguous emphasis remains in Source');
      const added: OfficialMark[] = marker.length === 3 ? [{ type: 'strong' }, { type: 'em' }] : [{ type: marker === '**' ? 'strong' : 'em' }];
      if (added.some(m => marks.some(existing => existing.type === m.type))) fail('Redundant emphasis remains in Source');
      flush();
      result.push(...v1Inline(source.slice(at + marker.length, end), budget, depth + 1, [...marks, ...added], links));
      at = end + marker.length; continue;
    }
    if (char === '`' || source.startsWith('~~', at) || /<\/?[a-zA-Z!]/.test(source.slice(at, at + 3))) fail('Unsupported syntax remains in Source');
    literal += char; at++;
  }
  flush();
  return mergeText(result);
}

export function validateOfficialDocument(doc: OfficialNode, flavor: OfficialFlavor) {
  let count = 0, length = 0;
  const ids = new Set<string>();
  function visit(n: OfficialNode, depth: number, parent?: OfficialNode['type']) {
    if (++count > NODE_LIMIT || depth > DEPTH_LIMIT) fail('Document exceeds visual editing limits');
    const children = n.content || [];
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text || children.length || !['paragraph', 'heading'].includes(parent || '')) fail('Invalid text node');
      length += n.text.length;
      const names = new Set<string>();
      for (const m of n.marks || []) {
        if (!['strong', 'em', 'link'].includes(m.type) || names.has(m.type)) fail('Invalid mark');
        names.add(m.type);
        if (m.type === 'link' && !safeLink(m.attrs.href)) fail('Unsafe link');
      }
    } else if (n.type === 'concept_media') {
      const id = n.attrs?.placementId;
      if (flavor !== 'concept' || parent !== 'doc' || !id || !placementPattern.test(id) || ids.has(id) || children.length) fail('Invalid protected image');
      ids.add(id);
    } else if (n.type === 'doc') {
      if (depth !== 0 || !children.length || children.some(c => !['paragraph', 'heading', 'bullet_list', 'ordered_list', 'blockquote', 'concept_media'].includes(c.type))) fail('Invalid document');
    } else if (n.type === 'paragraph' || n.type === 'heading') {
      if (children.some(c => c.type !== 'text') || n.type === 'heading' && n.attrs?.level !== 2 && n.attrs?.level !== 3) fail('Invalid prose block');
    } else if (n.type === 'bullet_list' || n.type === 'ordered_list') {
      if (!children.length || children.some(c => c.type !== 'list_item')) fail('Invalid list');
    } else if (n.type === 'list_item') {
      if (children.length !== 1 || children[0].type !== 'paragraph') fail('Invalid flat list item');
    } else if (n.type === 'blockquote') {
      if (!children.length || children.some(c => c.type !== 'paragraph')) fail('Invalid quote');
    } else fail('Unsupported visual node');
    if (length > SOURCE_LIMIT) fail('Document exceeds visual editing limits');
    children.forEach(child => visit(child, depth + 1, n.type));
  }
  visit(doc, 0);
}

export function parseOfficialContent(source: string, flavor: OfficialFlavor, marker: OfficialContentFormat): OfficialParseResult {
  try {
    const format = officialContentFormat(marker);
    if (source.length > SOURCE_LIMIT) fail('Source is too large for Visual; source is preserved');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(source)) fail('Control characters remain in Source');
    const lines: { text: string; start: number; end: number }[] = [];
    let offset = 0;
    for (const raw of source.split('\n')) {
      const value = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      lines.push({ text: value, start: offset, end: offset + value.length }); offset += raw.length + 1;
    }
    const budget = { work: WORK_LIMIT };
    const blocks: OfficialNode[] = [], regions: SourceRegion[] = [];
    let index = 0, position = 0, previousEnd = 0, prefix = '';
    const legacyConcept = format === 'legacy' && flavor === 'concept';
    const literalQuestion = format === 'legacy' && flavor === 'question';
    const value = (i: number) => legacyConcept ? lines[i].text.trim() : lines[i].text;
    const prose = (v: string) => literalQuestion ? v ? [text(v)] : [] : legacyConcept ? legacyInline(v) : v1Inline(v, budget);
    const starts = (v: string) => literalQuestion ? false : legacyConcept ? /^(?:#{2,3} |\- |\d+\.\s+)/.test(v) : /^(?:#{1,6} |[-+] |\d+\.\s|>)/.test(v);
    const record = (block: OfficialNode, start: number, end: number) => {
      const separator = source.slice(previousEnd, start);
      if (!blocks.length) prefix = separator;
      regions.push({ from: position, to: position + officialNodeSize(block), raw: source.slice(start, end), separator: blocks.length ? separator : '', signature: JSON.stringify(block) });
      blocks.push(block); position += officialNodeSize(block); previousEnd = end;
    };
    const breaks = (v: string) => /^(?:\r?\n)+$/.test(v) ? v.split('\n').length - 1 : 0;
    const add = (block: OfficialNode, start: number, end: number) => {
      // v1 uses two line endings between blocks. Additional pairs preserve
      // editable empty paragraphs; a lone trailing newline is only spelling.
      if (format === 'visual_markdown_v1') {
        const gap = source.slice(previousEnd, start), count = breaks(gap);
        const unit = gap.startsWith('\r\n') ? 2 : 1;
        const empty = Math.max(0, Math.floor(count / 2) - (blocks.length ? 1 : 0));
        for (let i = 0; i < empty; i++) {
          const at = previousEnd + (blocks.length ? 2 * unit : 0);
          record(node('paragraph'), at, at);
        }
      }
      record(block, start, end);
    };
    while (index < lines.length) {
      spend(budget);
      if (!lines[index].text.trim()) { index++; continue; }
      const start = lines[index].start, line = value(index);
      let block: OfficialNode;
      if (!literalQuestion && line.includes('[[socrates-media:')) {
        const token = /^\[\[socrates-media:([^\]]+)\]\]$/.exec(lines[index].text);
        if (flavor !== 'concept' || !token || !placementPattern.test(token[1]) || (index > 0 && lines[index - 1].text.trim()) || (index + 1 < lines.length && lines[index + 1].text.trim())) fail('Invalid or misplaced protected image remains in Source');
        block = node('concept_media', [], { placementId: token![1] }); index++;
      } else if (!literalQuestion && /^#{2,3} /.test(line)) {
        const match = /^(#{2,3}) (.*)$/.exec(line)!;
        block = node('heading', prose(match[2]), { level: match[1].length }); index++;
      } else if (!literalQuestion && /^(?:- |\d+\.\s)/.test(line)) {
        const ordered = line[0] !== '-', pattern = ordered ? /^\d+\.\s+/ : /^- /;
        const items: OfficialNode[] = [];
        while (index < lines.length && pattern.test(value(index))) {
          if (!legacyConcept && /^\s{2,}/.test(lines[index].text)) fail('Indented list remains in Source');
          items.push(node('list_item', [node('paragraph', prose(value(index++).replace(pattern, '')))]));
        }
        if (!legacyConcept && index < lines.length && /^\s{2,}\S/.test(lines[index].text)) fail('List continuation remains in Source');
        block = node(ordered ? 'ordered_list' : 'bullet_list', items);
      } else if (!literalQuestion && !legacyConcept && /^> ?/.test(line)) {
        const paragraphs: OfficialNode[] = []; let part: string[] = [];
        const finish = () => { paragraphs.push(node('paragraph', prose(part.join('\n')))); part = []; };
        while (index < lines.length && /^> ?/.test(value(index))) {
          const body = value(index++).replace(/^> ?/, '');
          if (!body.trim()) { finish(); continue; }
          if (starts(body)) fail('Nested quote content remains in Source');
          part.push(body);
        }
        if (part.length || !paragraphs.length) finish();
        block = node('blockquote', paragraphs);
      } else {
        if (!literalQuestion && !legacyConcept && (/^#|^\+ |^\s*\|/.test(line) || /^\s{2,}(?:[-+]|\d+\.)\s/.test(line))) fail('Unsupported block syntax remains in Source');
        const paragraph = [line]; index++;
        while (index < lines.length && lines[index].text.trim() && !starts(value(index))) {
          if (!literalQuestion && value(index).includes('[[socrates-media:')) fail('Misplaced image token remains in Source');
          paragraph.push(value(index++));
        }
        block = node('paragraph', prose(paragraph.join(legacyConcept ? ' ' : '\n')));
      }
      add(block, start, lines[index - 1].end);
    }
    if (!blocks.length) {
      const count = format === 'visual_markdown_v1' ? breaks(source) : 0;
      if (count) {
        const unit = source.startsWith('\r\n') ? 2 : 1;
        for (let i = 0; i <= Math.floor(count / 2); i++) record(node('paragraph'), i * 2 * unit, i * 2 * unit);
      } else { record(node('paragraph'), source.length, source.length); prefix = source; }
    } else if (format === 'visual_markdown_v1') {
      const gap = source.slice(previousEnd), count = Math.floor(breaks(gap) / 2), unit = gap.startsWith('\r\n') ? 2 : 1;
      for (let i = 0; i < count; i++) { const at = previousEnd + 2 * unit; record(node('paragraph'), at, at); }
    }
    const document = node('doc', blocks);
    validateOfficialDocument(document, flavor);
    return { mode: 'visual', document, provenance: { source, prefix, suffix: source.slice(previousEnd), regions, flavor, format } };
  } catch (error) {
    return { mode: 'source', source, reason: error instanceof Error ? error.message : 'Source cannot safely enter Visual' };
  }
}

function escapeText(value: string) { return value.replace(/[\\*_\[\]()>#\-.`~<!+|=]/g, '\\$&'); }

function serializeInline(n: OfficialNode): string {
  let source = ''; let active: OfficialMark[] = [];
  const priority = (m: OfficialMark) => ['link', 'strong', 'em'].indexOf(m.type);
  const open = (m: OfficialMark) => m.type === 'link' ? '[' : m.type === 'strong' ? '**' : '_';
  const close = (m: OfficialMark) => m.type === 'link' ? `](${m.attrs.href})` : open(m);
  for (const child of n.content || []) {
    const marks = [...child.marks || []].sort((a, b) => priority(a) - priority(b));
    let common = 0;
    while (common < active.length && common < marks.length && JSON.stringify(active[common]) === JSON.stringify(marks[common])) common++;
    for (let i = active.length - 1; i >= common; i--) source += close(active[i]);
    for (let i = common; i < marks.length; i++) source += open(marks[i]);
    source += escapeText(child.text || ''); active = marks;
  }
  for (let i = active.length - 1; i >= 0; i--) source += close(active[i]);
  return source;
}

export function serializeOfficialBlock(n: OfficialNode, newline = '\n'): string {
  switch (n.type) {
    case 'paragraph': return serializeInline(n).replace(/\n/g, newline);
    case 'heading': return `${'#'.repeat(n.attrs!.level!)} ${serializeInline(n)}`;
    case 'concept_media': return `[[socrates-media:${n.attrs!.placementId}]]`;
    case 'bullet_list': case 'ordered_list': return n.content!.map((item, i) => `${n.type === 'bullet_list' ? '-' : `${i + 1}.`} ${serializeInline(item.content![0])}`).join(newline);
    case 'blockquote': return n.content!.map(p => serializeInline(p).split('\n').map(line => `> ${line}`).join(newline)).join(newline + '>' + newline);
    default: return fail('Unsupported visual block');
  }
}
