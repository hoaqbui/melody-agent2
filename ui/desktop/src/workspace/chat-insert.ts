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

// The header names the file the way a model cites it: relative to the project when the
// path lies under it, untouched otherwise (a `terminal` tag, a path outside the tree).
export function pathForChat(path: string, cwd: string): string {
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`;
  return path.startsWith(root) ? path.slice(root.length) : path;
}
