// The one door from a pane into the chat input (task 76): a quote is text under a
// `path:line-range` header the model can locate; an image is the bytes the input attaches.
export interface ChatQuote {
  text: string;
  source: { path: string; lines?: [number, number] };
}

export interface ChatImage {
  data: string;
  mimeType: string;
}

export type InsertChatInput = ({ kind: 'text' } & ChatQuote) | ({ kind: 'image' } & ChatImage);

export function quoteForChat({ text, source }: ChatQuote): string {
  const header = source.lines
    ? `${source.path}:${source.lines[0]}-${source.lines[1]}`
    : source.path;
  return `\`\`\`${header}\n${text}\n\`\`\``;
}
