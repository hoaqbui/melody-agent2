// The Reviewer role's Return shape (`.agents/agents/reviewer.md`) read back from a reply
// (task 70): the verdict and the sections as lists. Pure, no React, no ACP. Tolerant on
// purpose — a model paraphrases: headings match by name at any depth with their trailing
// marks dropped, the verdict may sit on its heading line or below it in bold or code,
// a section's bullets are its items and prose without bullets is one item, and a
// `file:line` is found by regex anywhere in an item.

import { fileLinks, resolveLinkPath, FILE_LINE, type FileLink, type FileLinkSpan } from '../../file-links';

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

export { fileLinks, resolveLinkPath, FILE_LINE, type FileLink, type FileLinkSpan };

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

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
