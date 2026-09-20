import { describe, expect, it } from 'vitest';
import { pathForChat, quoteForChat } from './chat-insert';

describe('quoteForChat', () => {
  it('fences the text under a path header', () => {
    expect(quoteForChat({ text: 'some code here', source: { path: 'src/file.ts' } })).toBe(
      '```src/file.ts\nsome code here\n```'
    );
  });

  it('carries the line range in the header', () => {
    expect(
      quoteForChat({ text: 'const x = 1;', source: { path: 'src/index.ts', lines: [5, 10] } })
    ).toBe('```src/index.ts:5-10\nconst x = 1;\n```');
  });

  it('keeps a multi-line quote whole', () => {
    expect(quoteForChat({ text: 'a\nb', source: { path: 'f.txt', lines: [1, 2] } })).toBe(
      '```f.txt:1-2\na\nb\n```'
    );
  });

  it('fences an empty quote', () => {
    expect(quoteForChat({ text: '', source: { path: 'file.txt' } })).toBe('```file.txt\n\n```');
  });
});

describe('pathForChat', () => {
  it('strips the project root', () => {
    expect(pathForChat('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    expect(pathForChat('/repo/src/a.ts', '/repo/')).toBe('src/a.ts');
  });

  it('leaves a path outside the project, a sibling prefix, and a tag alone', () => {
    expect(pathForChat('/other/a.ts', '/repo')).toBe('/other/a.ts');
    expect(pathForChat('/repo2/a.ts', '/repo')).toBe('/repo2/a.ts');
    expect(pathForChat('terminal', '/repo')).toBe('terminal');
  });
});
