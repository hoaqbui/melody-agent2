import { describe, expect, it } from 'vitest';
import {
  REVIEW_SECTIONS,
  fileLinks,
  parseReview,
  resolveLinkPath,
  verdictOf,
} from './review-parse';

// The Return shape as `.agents/agents/reviewer.md` writes it.
const SHAPE = `# Review

## Verdict
PASS WITH ISSUES

## Requirements Coverage
- The card's ask is met: \`src/add.ts:3\` adds.
- tasks.md:12 names the confirm; it runs.

## Plan Adherence
- Follows docs/plan.md.

## Correctness Issues
- \`src/add.ts:3\` returns a - b, not a + b (\`git diff main...HEAD\` beside it).
  The wrapped line continues the item.

## Architecture Concerns

## Test Gaps
1. No test covers src/add.ts:1-4.

## Recommended Fixes
- Flip the operator at src/add.ts:3; then rerun \`pnpm test\`.
`;

describe('review parse', () => {
  it('reads the verdict and every section of the Return shape', () => {
    const review = parseReview(SHAPE);
    expect(review?.verdict).toBe('PASS WITH ISSUES');
    expect(review?.sections.map((section) => section.id)).toEqual(
      REVIEW_SECTIONS.map((section) => section.id)
    );
    const items = Object.fromEntries(
      review!.sections.map((section) => [section.id, section.items])
    );
    expect(items.requirements).toEqual([
      "The card's ask is met: `src/add.ts:3` adds.",
      'tasks.md:12 names the confirm; it runs.',
    ]);
    expect(items.plan).toEqual(['Follows docs/plan.md.']);
    expect(items.correctness).toEqual([
      '`src/add.ts:3` returns a - b, not a + b (`git diff main...HEAD` beside it). The wrapped line continues the item.',
    ]);
    expect(items.architecture).toEqual([]);
    expect(items.testGaps).toEqual(['No test covers src/add.ts:1-4.']);
    expect(items.fixes).toEqual(['Flip the operator at src/add.ts:3; then rerun `pnpm test`.']);
  });

  it('tolerates heading depth, case, numbering, trailing marks and a verdict on the heading line', () => {
    const review = parseReview(
      '### Verdict: **FAIL**\n\n#### 3. correctness issues (2):\n* one\n+ two\n\n### Test gaps\nProse only, no bullets.\n'
    );
    expect(review?.verdict).toBe('FAIL');
    expect(review?.sections.find((section) => section.id === 'correctness')?.items).toEqual([
      'one',
      'two',
    ]);
    expect(review?.sections.find((section) => section.id === 'testGaps')?.items).toEqual([
      'Prose only, no bullets.',
    ]);
  });

  it('takes a verdict line when there is no Verdict heading, and PASS WITH ISSUES over PASS', () => {
    expect(parseReview('**Verdict:** `PASS`\n\n## Test Gaps\n- none\n')?.verdict).toBe('PASS');
    expect(verdictOf('pass with issues')).toBe('PASS WITH ISSUES');
    expect(verdictOf('The build will not FAIL')).toBe('FAIL');
    expect(verdictOf('passable')).toBeNull();
  });

  it('is null for a reply that names no verdict, and ignores headings inside fences', () => {
    expect(parseReview('I could not run git here.')).toBeNull();
    expect(parseReview('## Verdict\nunsure\n')).toBeNull();
    expect(parseReview('```\n## Verdict\nPASS\n```\n')).toBeNull();
  });

  it('finds file:line links, with a column or a range, and skips URLs and times', () => {
    const links = (item: string) => fileLinks(item).map((found) => found.link);
    expect(links('see `src/add.ts:3` and tasks.md:12, then /abs/x.rs:7:2 and a/b:9-10')).toEqual([
      { path: 'src/add.ts', line: 3 },
      { path: 'tasks.md', line: 12 },
      { path: '/abs/x.rs', line: 7 },
      { path: 'a/b', line: 9 },
    ]);
    expect(links('at https://example.com/a.ts:12 or 12:30 or v1:2')).toEqual([]);
    const [first] = fileLinks('x `src/add.ts:3` y');
    expect('x `src/add.ts:3` y'.slice(first.start, first.end)).toBe('`src/add.ts:3`');
    expect(first.text).toBe('src/add.ts:3');
    const linked = fileLinks(
      'Unmet: [tasks.md:1](/abs/wt/tasks.md:1) and [`src/add.ts:3`](src/add.ts:3).'
    );
    expect(linked.map((span) => [span.link, span.text])).toEqual([
      [{ path: '/abs/wt/tasks.md', line: 1 }, 'tasks.md:1'],
      [{ path: 'src/add.ts', line: 3 }, 'src/add.ts:3'],
    ]);
    expect(linked.map((span) => [span.start, span.end])).toEqual([
      [7, 39],
      [44, 74],
    ]);
    const [open] = fileLinks('see `src/add.ts:3 here`');
    expect('see `src/add.ts:3 here`'.slice(open.start, open.end)).toBe('src/add.ts:3');
  });

  it('resolves a relative link against the cwd and keeps an absolute one', () => {
    expect(resolveLinkPath('src/add.ts', '/repo/')).toBe('/repo/src/add.ts');
    expect(resolveLinkPath('./src/add.ts', '/repo')).toBe('/repo/src/add.ts');
    expect(resolveLinkPath('/abs/x.rs', '/repo')).toBe('/abs/x.rs');
  });
});
