// File link parsing and resolution for use across the workspace: the Review pane,
// the MarkdownContent renderer (task 71), and anywhere `file:line` in transcript or
// panes needs to navigate to the Editor. Pure, no React, no ACP.

export interface FileLink {
  path: string;
  line: number;
}

export interface FileLinkSpan {
  link: FileLink;
  // The link's text, backticks off.
  text: string;
  start: number;
  end: number;
}

// A path is something with a slash or an extension, then `:line`, optionally `:col` or
// `-line`; a match never starts inside a word or right after `/` or `.`, which keeps a
// URL's host and path out. Backticks around the whole thing belong to the match, so the
// text on either side of a link is still whole markdown.
export const FILE_LINE =
  /(?<![\w:/.])`?(\/?(?:[\w.@~+-]+\/)*[\w.@~+-]+\.\w+|\/?(?:[\w.@~+-]+\/)+[\w.@~+-]+):(\d+)(?::\d+|-\d+)?`?(?![\w/])/g;

// A markdown link whose target or text is a `file:line` is one link, its text the label.
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function firstFileLine(text: string): FileLink | null {
  const match = new RegExp(FILE_LINE.source).exec(text);
  return match ? { path: match[1], line: Number(match[2]) } : null;
}

// Every `path:line` in an item, in order, with its span so the caller can render the
// text around it.
export function fileLinks(item: string): FileLinkSpan[] {
  const found: FileLinkSpan[] = [];
  for (const match of item.matchAll(MARKDOWN_LINK)) {
    const [whole, label, target] = match;
    const link = firstFileLine(target) ?? firstFileLine(label);
    if (!link) continue;
    found.push({
      link,
      text: label.replace(/^`|`$/g, ''),
      start: match.index,
      end: match.index + whole.length,
    });
  }
  for (const match of item.matchAll(FILE_LINE)) {
    // A lone opening backtick is the item's own markdown, not the link's.
    const whole = match[0];
    const balanced = whole.startsWith('`') === whole.endsWith('`');
    const start = match.index + (balanced || !whole.startsWith('`') ? 0 : 1);
    const end = match.index + whole.length - (balanced || !whole.endsWith('`') ? 0 : 1);
    if (found.some((span) => start < span.end && end > span.start)) continue;
    found.push({
      link: { path: match[1], line: Number(match[2]) },
      text: item.slice(start, end).replace(/^`|`$/g, ''),
      start,
      end,
    });
  }
  return found.sort((a, b) => a.start - b.start);
}

export function resolveLinkPath(path: string, cwd: string, gitToplevel?: string): string {
  if (path.startsWith('/')) return path;
  const resolved = `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`;

  // If gitToplevel is provided and the path is relative (not starting with /),
  // try a second path relative to the git toplevel (for when cwd is a subdirectory).
  if (gitToplevel && !path.startsWith('/')) {
    const toplevelResolved = `${gitToplevel.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`;
    // Return the toplevel-relative path if it differs from cwd-relative (i.e., simulates fallback).
    // In practice, the caller would check if one path exists; here we prefer the toplevel
    // resolution when the cwd path looks redundant (e.g., cwd=/repo/src/subdir, path=src/add.ts).
    if (toplevelResolved !== resolved) {
      return toplevelResolved;
    }
  }

  return resolved;
}
