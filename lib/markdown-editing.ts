export type MarkdownFormat =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'bulleted-list'
  | 'numbered-list'
  | 'link'
  | 'quote';

// Pure source transformation; callers retain focus, mode, dirty state and persistence.
export function applyMarkdownEdit(source: string, start: number, end: number, format: MarkdownFormat) {
    const selectedText = source.slice(start, end);
    let replacement = '';
    let selectionStart = start;
    let selectionEnd = start;

    const wrapSelection = (
      prefix: string,
      suffix: string,
      placeholder: string
    ) => {
      const innerText = selectedText || placeholder;
      replacement = `${prefix}${innerText}${suffix}`;
      selectionStart = start + prefix.length;
      selectionEnd = selectionStart + innerText.length;
    };

    const prefixLines = (prefix: string, placeholder: string) => {
      const innerText = selectedText || placeholder;
      replacement = innerText
        .split(/\r?\n/)
        .map((line) => `${prefix}${line || placeholder}`)
        .join('\n');
      selectionStart = start + prefix.length;
      selectionEnd = start + replacement.length;
    };

    switch (format) {
      case 'bold':
        wrapSelection('**', '**', 'bold text');
        break;
      case 'italic':
        wrapSelection('*', '*', 'italic text');
        break;
      case 'heading':
        prefixLines('## ', 'Heading');
        break;
      case 'bulleted-list':
        prefixLines('- ', 'Item');
        break;
      case 'numbered-list':
        prefixLines('1. ', 'Item');
        break;
      case 'link': {
        const linkText = selectedText || 'link text';
        replacement = `[${linkText}](https://example.com)`;
        selectionStart = start + 1;
        selectionEnd = selectionStart + linkText.length;
        break;
      }
      case 'quote':
        prefixLines('> ', 'Quote');
        break;
    }

    const nextSource =
      source.slice(0, start) + replacement + source.slice(end);
    return { source: nextSource, selectionStart, selectionEnd };
}
