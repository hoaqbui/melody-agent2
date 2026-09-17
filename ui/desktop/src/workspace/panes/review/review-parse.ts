// The Reviewer role's Return shape (`.agents/agents/reviewer.md`) read back from a reply
// (task 70): the verdict and the sections as lists. Pure, no React, no ACP. Tolerant on
// purpose — a model paraphrases: headings match by name at any depth with their trailing
// marks dropped, the verdict may sit on its heading line or below it in bold or code,
// a section's bullets are its items and prose without bullets is one item, and a
// `file:line` is found by regex anywhere in an item.

export const VERDICTS = ['PASS', 'PASS WITH ISSUES', 'FAIL'] as const;

export type Verdict = (typeof VERDICTS)[number];

// The Return shape's sections, in its order; the id names the section's test id and
// message.
export const REVIEW_SECTIONS = [
  { id: 'requirements', heading: 'Requirements Coverage' },
  { id: 'plan', heading: 'Plan Adherence' },
  { id: 'correctness', heading: 'Correctness Issues' },
  { id: 'architecture', heading: 'Architecture Concerns' },
  { id: 'testGaps', heading: 'Test Gaps' },
  { id: 'fixes', heading: 'Recommended Fixes' },
] as const;

export type ReviewSectionId = (typeof REVIEW_SECTIONS)[number]['id'];

export interface ReviewSection {
  id: ReviewSectionId;
  items: string[];
}

export interface Review {
  verdict: Verdict;
  sections: ReviewSection[];
}

export interface FileLink {
  path: string;
  line: number;
}

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
// A path is something with a slash or an extension, then `:line`, optionally `:col` or
// `-line`; a match never starts inside a word or right after `/` or `.`, which keeps a
// URL's host and path out. Backticks around the whole thing belong to the match, so the
// text on either side of a link is still whole markdown.
const FILE_LINE =
  /(?<![\w:/.])`?(\/?(?:[\w.@~+-]+\/)*[\w.@~+-]+\.\w+|\/?(?:[\w.@~+-]+\/)+[\w.@~+-]+):(\d+)(?::\d+|-\d+)?`?(?![\w/])/g;
// A markdown link whose target or text is a `file:line` is one link, its text the label.
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function headingName(line: string): string | null {
  const match = HEADING.exec(line);
  if (!match) return null;
  return match[1]
    .replace(/[*_`]/g, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[:.\s]+$/, '')
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/[:.\s]+$/, '')
    .trim()
    .toLowerCase();
}

// PASS WITH ISSUES before PASS: the shorter word is inside the longer.
export function verdictOf(text: string): Verdict | null {
  const plain = text.replace(/[*_`]/g, '').toUpperCase();
  if (/\bPASS WITH ISSUES\b/.test(plain)) return 'PASS WITH ISSUES';
  if (/\bPASS\b/.test(plain)) return 'PASS';
  if (/\bFAIL\b/.test(plain)) return 'FAIL';
  return null;
}

function itemsOf(lines: readonly string[]): string[] {
  const items: string[] = [];
  const prose: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const bullet = inFence ? null : BULLET.exec(line);
    if (bullet) {
      items.push(bullet[1].trim());
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || inFence) continue;
    // A wrapped bullet continues the item above it; prose before any bullet is its own.
    if (items.length > 0 && /^\s{2,}/.test(line)) items[items.length - 1] += ` ${trimmed}`;
    else prose.push(trimmed);
  }
  const text = prose.join(' ');
  return text && items.length === 0 ? [text] : items;
}

// Null when the reply carries no verdict the pane can name: the caller shows it raw.
export function parseReview(text: string): Review | null {
  const lines = text.split(/\r?\n/);
  const blocks = new Map<string, string[]>();
  let current: string | null = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const name = inFence ? null : headingName(line);
    if (name !== null) {
      current = name;
      if (!blocks.has(name)) blocks.set(name, []);
      // A verdict on its heading line ("## Verdict: PASS") counts as its body.
      const after = name.startsWith('verdict') ? name.slice('verdict'.length) : '';
      if (after.trim()) blocks.get(name)!.push(after);
      continue;
    }
    if (current !== null) blocks.get(current)!.push(line);
  }
  const verdictKey = [...blocks.keys()].find((key) => key.startsWith('verdict'));
  // No Verdict heading: a "Verdict: PASS" line anywhere still names it.
  const verdictLine = lines.find((line) => /^\s*[*_`]*verdict/i.test(line));
  const verdict =
    verdictKey === undefined
      ? verdictOf(verdictLine ?? '')
      : verdictOf(blocks.get(verdictKey)!.join('\n'));
  if (verdict === null) return null;
  const sections = REVIEW_SECTIONS.map(({ id, heading }) => ({
    id,
    items: itemsOf(blocks.get(heading.toLowerCase()) ?? []),
  }));
  return { verdict, sections };
}

export interface FileLinkSpan {
  link: FileLink;
  // The link's text, backticks off.
  text: string;
  start: number;
  end: number;
}

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
