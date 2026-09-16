import { describe, expect, it } from 'vitest';
import type { GitWorktreeEntry } from '../native/sidecar';
import { newWorktreeSlug, worktreeBranch, worktreePlace, worktreeSlugOf } from './worktree';

const entry = (path: string, branch: string | null): GitWorktreeEntry => ({
  path,
  branch,
  head: 'abc',
  locked: false,
});

const main = entry('/repo', 'main');

describe('newWorktreeSlug', () => {
  it('names the day and four hex digits, inside the sidecar slug pattern', () => {
    const slug = newWorktreeSlug(new Date('2026-09-16T12:34:56Z'), (bytes) => {
      bytes.set([0x0a, 0xff]);
      return bytes;
    });
    expect(slug).toBe('wt-20260916-0aff');
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
    expect(worktreeBranch(slug)).toBe('wt/wt-20260916-0aff');
  });

  it('differs between calls', () => {
    expect(newWorktreeSlug()).not.toBe(newWorktreeSlug());
  });
});

describe('worktreeSlugOf', () => {
  it('reads the segment after the last .worktrees, from the root or below it', () => {
    expect(worktreeSlugOf('/repo/.worktrees/wt-1')).toBe('wt-1');
    expect(worktreeSlugOf('/repo/.worktrees/wt-1/ui/desktop')).toBe('wt-1');
    expect(worktreeSlugOf('/repo/.worktrees/a/.worktrees/b')).toBe('b');
    expect(worktreeSlugOf('C:\\repo\\.worktrees\\wt-2')).toBe('wt-2');
  });

  it('is null outside .worktrees', () => {
    expect(worktreeSlugOf('/repo')).toBeNull();
    expect(worktreeSlugOf('/repo/.worktrees')).toBeNull();
    expect(worktreeSlugOf('/repo/.worktrees/')).toBeNull();
  });
});

describe('worktreePlace', () => {
  const worktrees = [main, entry('/private/repo/.worktrees/wt-1', 'wt/wt-1')];

  it('finds the worktree by path, or by the cwd slug against the wt/ branch', () => {
    const place = { slug: 'wt-1', branch: 'wt/wt-1', main };
    expect(worktreePlace('/private/repo/.worktrees/wt-1', worktrees)).toEqual(place);
    expect(worktreePlace('/repo/.worktrees/wt-1', worktrees)).toEqual(place);
  });

  it('is null for the main checkout, an unlisted cwd, or a branch the sidecar did not make', () => {
    expect(worktreePlace('/repo', worktrees)).toBeNull();
    expect(worktreePlace('/repo/.worktrees/wt-9', worktrees)).toBeNull();
    expect(worktreePlace('/repo/feature', [main, entry('/repo/feature', 'feature')])).toBeNull();
    expect(worktreePlace('/repo', [])).toBeNull();
  });
});
