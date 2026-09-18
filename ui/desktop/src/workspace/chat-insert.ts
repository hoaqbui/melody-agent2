export interface QuoteSource {
  path: string;
  lines?: [number, number];
}

export interface QuoteForChatInput {
  kind: 'text' | 'image';
  text?: string;
  source: QuoteSource;
}

export function quoteForChat(input: QuoteForChatInput): string {
  const { kind, text, source } = input;

  const header =
    source.lines && source.lines.length === 2
      ? `\`\`\`${source.path}:${source.lines[0]}-${source.lines[1]}`
      : `\`\`\`${source.path}`;

  if (kind === 'image') {
    return `${header}\n[image]\n\`\`\``;
  }

  const content = text || '';
  return `${header}\n${content}\n\`\`\``;
}
