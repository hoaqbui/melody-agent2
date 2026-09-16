// Markdown rendered as GitHub does, for the Editor's Preview and the Markdown pane. One
// renderer so the two never drift (task 31; task 30's Artifact pane composes it too).

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'github-markdown-css/github-markdown-light.css';
import markdownDarkCss from 'github-markdown-css/github-markdown-dark.css?inline';

// github-markdown-css picks its palette by prefers-color-scheme; the app themes by a class
// on <html> (contexts/ThemeContext.tsx), so the dark palette is nested under that class.
const MARKDOWN_DARK_CSS = `.dark { ${markdownDarkCss} }`;

export function MarkdownView({ text }: { text: string }) {
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
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </>
  );
}
