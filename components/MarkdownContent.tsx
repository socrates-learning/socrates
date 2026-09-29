import React from 'react';
import styles from './MarkdownContent.module.css';

function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const value = match[0];
    const key = `${match.index}-${value}`;

    if (value.startsWith('**')) {
      parts.push(<strong key={key}>{value.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key}>{value.slice(1, -1)}</em>);
    }

    lastIndex = match.index + value.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function LegacyMarkdownContent({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={index}>{renderInline(trimmed.slice(4))}</h3>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={index}>{renderInline(trimmed.slice(3))}</h2>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      const items: string[] = [];

      while (lines[index]?.trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }

      elements.push(
        <ul key={index}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];

      while (/^\d+\.\s+/.test(lines[index]?.trim() || '')) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }

      elements.push(
        <ol key={index}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith('## ') &&
      !lines[index].trim().startsWith('### ') &&
      !lines[index].trim().startsWith('- ') &&
      !/^\d+\.\s+/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    elements.push(
      <p key={index}>{renderInline(paragraphLines.join(' '))}</p>
    );
  }

  return <div className="article-body">{elements}</div>;
}

// Card parsing is opt-in. Legacy Concept rendering below keeps its released output.
// Input, scanning work, node count and nesting are bounded; fallback is literal text.
const MAX_CARD_SOURCE = 65536;
const MAX_CARD_DEPTH = 8;
type ParseBudget = { work: number; nodes: number };

function safeCardHref(destination: string) {
  if (!/^https?:\/\//i.test(destination) || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(destination)) return null;
  try {
    const url = new URL(destination);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? destination : null;
  } catch { return null; }
}

function cardInline(text: string, interactive: boolean, budget: ParseBudget, depth = 0): React.ReactNode[] {
  if (depth >= MAX_CARD_DEPTH) return [text];
  const result: React.ReactNode[] = [];
  let literal = '';
  let index = 0;
  const flush = () => { if (literal) { result.push(literal); literal = ''; } };
  function closing(marker: string, from: number) {
    for (let at = from; at < text.length && budget.work > 0; at++) {
      budget.work--;
      if (text[at] === '\\') { at++; continue; }
      if (text[at] !== '*') continue;
      let length = 1;
      while (text[at + length] === '*' && budget.work > 0) { length++; budget.work--; }
      if (length >= marker.length && (marker.length !== 1 || length % 2 === 1)) return at + length - marker.length;
      at += length - 1;
    }
    return -1;
  }
  while (index < text.length) {
    if (--budget.work < 0 || budget.nodes <= 0) { literal += text.slice(index); break; }
    if (text[index] === '\\' && /[\\*\[\]()>#\-]/.test(text[index + 1] || '')) {
      literal += text[index + 1]; index += 2; continue;
    }
    if (text[index] === '[') {
      let labelEnd = index + 1;
      while (labelEnd < text.length && budget.work-- > 0) {
        if (text[labelEnd] === '\\') { labelEnd += 2; continue; }
        if (text[labelEnd] === ']') break;
        labelEnd++;
      }
      if (text.slice(labelEnd, labelEnd + 2) === '](') {
        let end = labelEnd + 2;
        let parentheses = 1;
        while (end < text.length && budget.work-- > 0) {
          if (text[end] === '(') parentheses++;
          if (text[end] === ')' && --parentheses === 0) break;
          end++;
        }
        if (end < text.length && parentheses === 0) {
          const raw = text.slice(index, end + 1);
          const href = safeCardHref(text.slice(labelEnd + 2, end));
          if (href && labelEnd > index + 1 && text[index - 1] !== '!') {
            flush(); budget.nodes--;
            const label = cardInline(text.slice(index + 1, labelEnd), false, budget, depth + 1);
            result.push(interactive ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : <React.Fragment key={index}>{label}</React.Fragment>);
          } else literal += raw;
          index = end + 1; continue;
        }
        // An incomplete link stays intact, including any formatting-like URL text.
        literal += text.slice(index); break;
      }
    }
    if (text[index] === '*' && text[index - 1] !== '*') {
      const marker = text.startsWith('***', index) ? '***' : text.startsWith('**', index) ? '**' : '*';
      const end = closing(marker, index + marker.length);
      if (end > index + marker.length) {
        flush(); budget.nodes--;
        const children = cardInline(text.slice(index + marker.length, end), interactive, budget, depth + 1);
        result.push(marker.length === 3 ? <strong key={index}><em>{children}</em></strong> : marker.length === 2 ? <strong key={index}>{children}</strong> : <em key={index}>{children}</em>);
        index = end + marker.length; continue;
      }
    }
    literal += text[index++];
  }
  flush();
  return result;
}

function cardBlocks(source: string, interactive: boolean, budget: ParseBudget, depth = 0): React.ReactNode[] {
  if (depth >= MAX_CARD_DEPTH || source.length > MAX_CARD_SOURCE) return [source];
  const lines = source.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  const blockStart = (line: string) => /^(#{2,3} |[-] |\d+\. |> ?)/.test(line);
  let index = 0;
  while (index < lines.length) {
    if (budget.nodes-- <= 0 || budget.work <= 0) { blocks.push(lines.slice(index).join('\n')); break; }
    const key = index;
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const heading = /^(#{2,3}) (.+)$/.exec(line);
    if (heading) {
      const children = cardInline(heading[2], interactive, budget);
      blocks.push(heading[1].length === 2 ? <h2 key={key}>{children}</h2> : <h3 key={key}>{children}</h3>); index++; continue;
    }
    if (/^> ?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^> ?/.test(lines[index])) quote.push(lines[index++].replace(/^> ?/, ''));
      blocks.push(<blockquote key={key}>{cardBlocks(quote.join('\n'), interactive, budget, depth + 1)}</blockquote>); continue;
    }
    const list = /^(?:- |\d+\. )/.exec(line);
    if (list) {
      const ordered = line[0] !== '-';
      const pattern = ordered ? /^\d+\. / : /^- /;
      const items: React.ReactNode[] = [];
      while (index < lines.length && pattern.test(lines[index]) && budget.nodes-- > 0) {
        items.push(<li key={index}>{cardInline(lines[index++].replace(pattern, ''), interactive, budget)}</li>);
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !blockStart(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={key}>{cardInline(paragraph.join('\n'), interactive, budget)}</p>);
  }
  return blocks;
}

function parseCard(markdown: string, interactive: boolean) {
  return cardBlocks(markdown, interactive, { work: 1000000, nodes: 4096 });
}

// Plain string only: safe inside an existing button; never emits nested links.
export function cardMarkdownSummary(markdown: string): string {
  function text(node: React.ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      const content = text(node.props.children);
      return ['p', 'h2', 'h3', 'li', 'blockquote'].includes(String(node.type)) ? content + '\n' : content;
    }
    return '';
  }
  return text(parseCard(markdown, false)).replace(/\s+/g, ' ').trim();
}

export function MarkdownContent({ markdown, mode = 'concept', interactiveLinks = true }: {
  markdown: string; mode?: 'concept' | 'card'; interactiveLinks?: boolean;
}) {
  if (mode === 'card') return <div className={styles.card}>{parseCard(markdown, interactiveLinks)}</div>;
  return <LegacyMarkdownContent markdown={markdown} />;
}
