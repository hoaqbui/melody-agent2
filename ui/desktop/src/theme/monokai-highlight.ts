// Monokai's syntax palette for CodeMirror — the Editor and Changes panes use it on every
// dark variant (DESIGN.md §Tokens & theme, 2026-09-16). Kept apart from theme-tokens.ts,
// which runs before first paint and must not pull CodeMirror in.
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const monokaiHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.operator], color: '#f92672' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#a6e22e' },
  { tag: [tags.string, tags.special(tags.string)], color: '#e6db74' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#ae81ff' },
  { tag: [tags.typeName, tags.className], color: '#66d9ef', fontStyle: 'italic' },
  { tag: tags.definition(tags.variableName), color: '#fd971f' },
  { tag: [tags.propertyName, tags.attributeName], color: '#a6e22e' },
  { tag: tags.tagName, color: '#f92672' },
  { tag: tags.comment, color: '#75715e', fontStyle: 'italic' },
  { tag: tags.heading, fontWeight: 'bold' },
  { tag: tags.link, textDecoration: 'underline' },
]);
