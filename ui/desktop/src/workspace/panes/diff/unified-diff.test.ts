import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './unified-diff';

// Shapes recorded from `git diff --unified=1000000000 HEAD` (git 2.55, 2026-09-15) in a
// scratch repo with an added, a binary, a deleted, a renamed and a no-trailing-newline file.
const SAMPLE = [
  'diff --git a/added.txt b/added.txt',
  'new file mode 100644',
  'index 0000000..3e75765',
  '--- /dev/null',
  '+++ b/added.txt',
  '@@ -0,0 +1 @@',
  '+new',
  'diff --git a/bin.dat b/bin.dat',
  'index 366fd40..df727c3 100644',
  'Binary files a/bin.dat and b/bin.dat differ',
  'diff --git a/gone.txt b/gone.txt',
  'deleted file mode 100644',
  'index 587be6b..0000000',
  '--- a/gone.txt',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-x',
  'diff --git a/sp ace.txt b/moved space.txt',
  'similarity index 66%',
  'rename from sp ace.txt',
  'rename to moved space.txt',
  'index 4cb29ea..77079d0 100644',
  '--- a/sp ace.txt\t',
  '+++ b/moved space.txt\t',
  '@@ -1,3 +1,3 @@',
  ' one',
  '-two',
  '+two!',
  ' three',
  'diff --git a/nonl.txt b/nonl.txt',
  'index 0a207c0..817f660 100644',
  '--- a/nonl.txt',
  '+++ b/nonl.txt',
  '@@ -1,2 +1,2 @@',
  ' a',
  '-b',
  '\\ No newline at end of file',
  '+c',
  '\\ No newline at end of file',
  '',
].join('\n');

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(SAMPLE);
  const byPath = Object.fromEntries(files.map((file) => [file.path, file]));

  it('lists every file once, in git order', () => {
    expect(files.map((file) => file.path)).toEqual([
      'added.txt',
      'bin.dat',
      'gone.txt',
      'moved space.txt',
      'nonl.txt',
    ]);
  });

  it('rebuilds both sides of an added and a deleted file', () => {
    expect(byPath['added.txt']).toMatchObject({ kind: 'added', old: '', new: 'new\n', added: 1 });
    expect(byPath['gone.txt']).toMatchObject({ kind: 'deleted', old: 'x\n', new: '', removed: 1 });
  });

  it('marks a binary file without hunks', () => {
    expect(byPath['bin.dat']).toMatchObject({
      binary: true,
      added: 0,
      removed: 0,
      old: '',
      new: '',
    });
  });

  it('takes a renamed path with spaces from the rename headers', () => {
    expect(byPath['moved space.txt']).toMatchObject({
      kind: 'renamed',
      oldPath: 'sp ace.txt',
      old: 'one\ntwo\nthree\n',
      new: 'one\ntwo!\nthree\n',
      added: 1,
      removed: 1,
    });
  });

  it('drops the trailing newline the marker says is missing', () => {
    expect(byPath['nonl.txt']).toMatchObject({ old: 'a\nb', new: 'a\nc' });
  });

  it('returns nothing for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});
