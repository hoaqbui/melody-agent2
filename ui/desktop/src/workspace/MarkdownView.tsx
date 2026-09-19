// Markdown rendered as GitHub does, for the Editor's Preview and the Markdown pane. One
// renderer so the two never drift (task 31; task 30's Artifact pane composes it too).

import { createElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'github-markdown-css/github-markdown-light.css';
import markdownDarkCss from 'github-markdown-css/github-markdown-dark.css?inline';
import { headings, slug } from './panes/markdown/markdown-state';

// github-markdown-css picks its palette by prefers-color-scheme; the app themes by a class
// on <html> (contexts/ThemeContext.tsx), so the dark palette is nested under that class.
const MARKDOWN_DARK_CSS = `.dark { ${markdownDarkCss} }`;

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export function MarkdownView({ text }: { text: string }) {
  // Anchor ids come from `headings(text)` by the heading's own text (task 95): React renders a
  // heading on its own when it changes, so a render-order counter drifts and leaves headings
  // without ids. Repeated texts take their ids in order of appearance.
  const anchors = headings(text);
  const idsByText = new Map<string, string[]>();
  for (const anchor of anchors) {
    idsByText.set(anchor.text, [...(idsByText.get(anchor.text) ?? []), anchor.id]);
  }
  const seen = new Map<string, number>();
  const textOf = (children: ReactNode): string => {
    if (children === null || children === undefined || typeof children === 'boolean') return '';
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(textOf).join('');
    if (typeof children === 'object' && 'props' in children) {
      return textOf((children as { props: { children?: ReactNode } }).props.children);
    }
    return '';
  };
  const headingComponents = Object.fromEntries(
    HEADING_TAGS.map((tag) => [
      tag,
      ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
        const label = textOf(props.children).trim();
        const ids = idsByText.get(label) ?? [];
        const k = seen.get(label) ?? 0;
        seen.set(label, k + 1);
        const id = ids[Math.min(k, ids.length - 1)] ?? slug(label);
        return createElement(tag, { ...props, id });
      },
    ])
  );

  return (
    <>
      <style href="github-markdown-dark" precedence="default">
        {MARKDOWN_DARK_CSS}
      </style>
      <div className="markdown-body p-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // A same-window navigation would leave the app; a new window is routed to the
            // browser by main's window-open handler.
            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
            ...headingComponents,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </>
  );
}
