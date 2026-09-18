// File link parsing and resolution for use across the workspace: the Review pane,
// the MarkdownContent renderer (task 71, 82), and anywhere `file:line` in transcript or
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

// Minimal hast node shape for the rehypeFileLinks plugin.
export interface HastNode {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown> | null;
  children?: HastNode[];
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

export function resolveLinkPath(path: string, cwd: string): string {
  if (path.startsWith('/')) return path;
  return `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`;
}

// The places a relative link may live, in the order to try them: under the cwd first,
// then under the git toplevel — a model cites repo-root-relative paths even when the
// session runs in a subdirectory. Whether the first misses is the opener's to find out.
export function linkPathCandidates(path: string, cwd: string, gitToplevel: string): string[] {
  const first = resolveLinkPath(path, cwd);
  const second = resolveLinkPath(path, gitToplevel);
  return second === first ? [first] : [first, second];
}

// Rehype plugin that transforms `file:line` patterns into clickable links (task 82).
// The plugin walks the HAST tree, finds text nodes with file:line patterns, and
// replaces them with <a> elements. The link uses the goose-file: protocol so
// MarkdownContent's a handler can intercept and call openFile().
export function rehypeFileLinks(
  options: { cwd: string; gitToplevel: string }
): (tree: HastNode) => void {
  return (tree) => {
    transformTree(tree, options);
  };
}

function transformTree(node: HastNode | undefined, options: { cwd: string; gitToplevel: string }): void {
  if (!node || !node.children) return;

  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if (!child) {
      i++;
      continue;
    }

    if (child.type === 'text' && child.value) {
      const text = child.value;
      const spans = fileLinks(text);

      if (spans.length > 0) {
        const newChildren: HastNode[] = [];
        let lastEnd = 0;

        for (const span of spans) {
          if (span.start > lastEnd) {
            newChildren.push({
              type: 'text',
              value: text.slice(lastEnd, span.start),
            });
          }

          const candidates = linkPathCandidates(
            span.link.path,
            options.cwd,
            options.gitToplevel
          );

          newChildren.push({
            type: 'element',
            tagName: 'a',
            properties: {
              href: `goose-file:${candidates[0]}:${span.link.line}`,
              'data-testid': 'chat-file-link',
              'data-path': span.link.path,
              'data-line': String(span.link.line),
              title: candidates[0],
            },
            children: [
              {
                type: 'text',
                value: span.text,
              },
            ],
          });

          lastEnd = span.end;
        }

        if (lastEnd < text.length) {
          newChildren.push({
            type: 'text',
            value: text.slice(lastEnd),
          });
        }

        node.children.splice(i, 1, ...newChildren);
        i += newChildren.length;
        continue;
      }
    }

    transformTree(child, options);
    i++;
  }
}
