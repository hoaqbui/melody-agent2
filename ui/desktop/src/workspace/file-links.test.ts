import { describe, expect, it } from 'vitest';
import { fileLinks, linkPathCandidates, resolveLinkPath, rehypeFileLinks, type HastNode } from './file-links';

describe('file links', () => {
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

  it('offers the git toplevel as the second candidate under a subdirectory cwd', () => {
    expect(linkPathCandidates('src/add.ts', '/repo/src/subdir', '/repo')).toEqual([
      '/repo/src/subdir/src/add.ts',
      '/repo/src/add.ts',
    ]);
    expect(linkPathCandidates('src/add.ts', '/repo', '/repo')).toEqual(['/repo/src/add.ts']);
    expect(linkPathCandidates('/abs/x.rs', '/repo/sub', '/repo')).toEqual(['/abs/x.rs']);
  });

  it('rehypeFileLinks transforms text nodes with file:line patterns into links', () => {
    const plugin = rehypeFileLinks({ cwd: '/repo', gitToplevel: '/repo' });
    const tree: HastNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [
            {
              type: 'text',
              value: 'See src/add.ts:3 and tasks.md:12 here.',
            },
          ],
        },
      ],
    };

    plugin(tree);

    const p = tree.children?.[0];
    expect(p?.type).toBe('element');
    expect(p?.tagName).toBe('p');
    expect(p?.children?.length).toBe(5); // text, link, text, link, text
    expect(p?.children?.[1]?.tagName).toBe('a');
    expect(p?.children?.[1]?.properties?.href).toBe('goose-file:/repo/src/add.ts:3');
    expect(p?.children?.[1]?.properties?.['data-testid']).toBe('chat-file-link');
    expect(p?.children?.[1]?.properties?.['data-path']).toBe('src/add.ts');
    expect(p?.children?.[1]?.properties?.['data-line']).toBe('3');
  });

  it('rehypeFileLinks skips URLs and times', () => {
    const plugin = rehypeFileLinks({ cwd: '/repo', gitToplevel: '/repo' });
    const tree: HastNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [
            {
              type: 'text',
              value: 'Check https://example.com/a.ts:12 and 12:30 time.',
            },
          ],
        },
      ],
    };

    plugin(tree);

    const p = tree.children?.[0];
    // Should have only one text node (no links)
    expect(p?.children?.length).toBe(1);
    expect(p?.children?.[0]?.type).toBe('text');
  });
});
