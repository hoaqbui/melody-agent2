// Markdown rendered as GitHub does, for the Editor's Preview and the Markdown pane. One
// renderer so the two never drift (task 31; task 30's Artifact pane composes it too).

import { createElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'github-markdown-css/github-markdown-light.css';
import markdownDarkCss from 'github-markdown-css/github-markdown-dark.css?inline';
import { headings } from './panes/markdown/markdown-state';

// github-markdown-css picks its palette by prefers-color-scheme; the app themes by a class
// on <html> (contexts/ThemeContext.tsx), so the dark palette is nested under that class.
const MARKDOWN_DARK_CSS = `.dark { ${markdownDarkCss} }`;

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export function MarkdownView({ text }: { text: string }) {
  // `headings(text)` and this render walk the same source in the same order (task 95): every
  // h1..h6 ReactMarkdown emits, across every level, lines up one-to-one with that array, so
  // the anchor id is just "the next one" regardless of which level is rendering.
  const anchors = headings(text);
  let next = 0;
  const headingComponents = Object.fromEntries(
    HEADING_TAGS.map((tag) => [
      tag,
      ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
        const id = anchors[next++]?.id;
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
