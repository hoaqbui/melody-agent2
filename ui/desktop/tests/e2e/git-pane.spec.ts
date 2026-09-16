import { execFileSync } from 'child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import { delimiter, join } from 'path';
import { test, expect, openPane } from './fixtures';

// PRD step 7: the branch is shown, a modified file is staged and committed, and the Changes
// pane's "vs HEAD" is empty afterwards. As diff-pane.spec.ts: the app opens in $HOME, so HOME
// points at a scratch repo; Hermit's state dir is pinned to the real one first. The commit
// runs in the sidecar, which sees no global gitconfig under the scratch HOME, so the author
// is set in the repo's own config. The Git pane's PR section (task 66) asks `gh`, so a stub
// that answers as a logged-out gh does (exit 4) goes first on the app's PATH: the real one
// never runs in a walk, and the section's Sign in row is what this walk sees.
const realHome = homedir();
const previousEnv = {
  HOME: process.env.HOME,
  HERMIT_STATE_DIR: process.env.HERMIT_STATE_DIR,
  PATH: process.env.PATH,
};
let scratch = '';
let ghBin = '';

const loggedOutGh = `#!/bin/sh
echo "To get started with GitHub CLI, please run:  gh auth login" >&2
exit 4
`;

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

test.describe('git pane', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-git-pane-'));
    const file = join(scratch, 'notes.md');
    writeFileSync(file, 'one\ntwo\nthree\n');
    git(scratch, ['init', '-q', '-b', 'main']);
    git(scratch, ['config', 'user.name', 'git-pane']);
    git(scratch, ['config', 'user.email', 'git-pane@test']);
    git(scratch, ['add', 'notes.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    writeFileSync(file, 'one\ntwo, changed\nthree\nfour\n');
    mkdirSync(join(scratch, 'Library'), { recursive: true });
    process.env.HERMIT_STATE_DIR ??=
      process.platform === 'darwin'
        ? join(realHome, 'Library', 'Caches', 'hermit')
        : join(process.env.XDG_CACHE_HOME ?? join(realHome, '.cache'), 'hermit');
    process.env.HOME = scratch;
    ghBin = mkdtempSync(join(tmpdir(), 'goose-git-pane-gh-'));
    writeFileSync(join(ghBin, 'gh'), loggedOutGh);
    chmodSync(join(ghBin, 'gh'), 0o755);
    process.env.PATH = `${ghBin}${delimiter}${previousEnv.PATH ?? ''}`;
  });

  test.afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
    rmSync(ghBin, { recursive: true, force: true });
  });

  test('shows the branch, stages a file, commits, and leaves no changes vs HEAD', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await openPane(goosePage, 'git');

    const pane = goosePage.locator('[data-testid="git-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="git-branch"]')).toHaveText('main');

    const unstaged = goosePage.locator('[data-testid="git-unstaged"]');
    const staged = goosePage.locator('[data-testid="git-staged"]');
    await expect(unstaged.locator('[data-testid="git-file"][data-path="notes.md"]')).toBeVisible();
    await expect(staged.locator('[data-testid="git-file"]')).toHaveCount(0);

    const commit = goosePage.locator('[data-testid="git-commit"]');
    await expect(commit).toBeDisabled();
    await expect(goosePage.locator('[data-testid="git-commit-blocker"]')).toHaveAttribute(
      'data-blocker',
      'nothingStaged'
    );

    await unstaged.locator('[data-testid="git-stage"]').click();
    await expect(staged.locator('[data-testid="git-file"][data-path="notes.md"]')).toBeVisible();
    await expect(unstaged.locator('[data-testid="git-file"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="git-commit-blocker"]')).toHaveAttribute(
      'data-blocker',
      'noMessage'
    );

    await goosePage.locator('[data-testid="git-message"]').fill('notes: add four');
    await expect(commit).toBeEnabled();
    await commit.click();

    await expect(goosePage.locator('[data-testid="git-output"]')).toContainText('notes: add four');
    await expect(goosePage.locator('[data-testid="git-clean"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="git-message"]')).toHaveValue('');
    const pr = goosePage.locator('[data-testid="git-pr"]');
    await expect(pr).toHaveAttribute('data-pr-state', 'unavailable', { timeout: 15000 });
    await expect(pr).toContainText('gh not available: To get started with GitHub CLI');
    await expect(goosePage.locator('[data-testid="git-pr-sign-in"]')).toBeVisible();
    expect(git(scratch, ['log', '--format=%s', '-1']).trim()).toBe('notes: add four');

    await openPane(goosePage, 'diff');
    const diff = goosePage.locator('[data-testid="diff-pane"]');
    await expect(diff).toHaveAttribute('data-state', 'empty', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="diff-base"]')).toHaveValue('head');

    await goosePage.screenshot({
      path: test.info().outputPath('git-pane.png'),
      fullPage: true,
    });
  });
});

// Task 66: on a branch with two commits and no upstream, Push and open PR… pushes the
// branch to the bare origin beside the repo, opens the sheet prefilled from the commits,
// and Create shows the PR's number and URL; the status that follows lists the fake gh's
// checks, one failing. Nothing reaches GitHub: the `gh` on the app's PATH is a script
// written here, answering from files under the scratch dir, so the sidecar's execFile
// finds it first (main/sidecar.ts puts process.env.PATH before the login shell's). The
// window opens on the repo through the fixture's GOOSE_TEST_DIR (task 58).
const fakeGh = (state: string): string => `#!/bin/sh
STATE="${state}"
case "$1 $2" in
  "pr create")
    printf '%s\\n' "$@" > "$STATE/create.args"
    : > "$STATE/pr"
    echo "https://github.com/acme/repo/pull/42"
    ;;
  "pr view")
    if [ -f "$STATE/pr" ]; then
      echo '{"number":42,"url":"https://github.com/acme/repo/pull/42","state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","statusCheckRollup":[]}'
    else
      echo 'no pull requests found for branch "feature"' >&2
      exit 1
    fi
    ;;
  "pr checks")
    echo '[{"name":"build","state":"SUCCESS","link":"https://ci/build"},{"name":"lint","state":"FAILURE","link":"https://ci/lint"},{"name":"e2e","state":"IN_PROGRESS","link":"https://ci/e2e"}]'
    exit 8
    ;;
  *)
    echo "fake gh: unexpected $*" >&2
    exit 1
    ;;
esac
`;

const previousPrEnv = { GOOSE_TEST_DIR: process.env.GOOSE_TEST_DIR, PATH: process.env.PATH };
let prScratch = '';
let prRepo = '';
let prOrigin = '';
let ghState = '';

test.describe('open pr', () => {
  test.beforeAll(() => {
    prScratch = realpathSync(mkdtempSync(join(tmpdir(), 'goose-open-pr-')));
    prRepo = join(prScratch, 'repo');
    prOrigin = join(prScratch, 'origin.git');
    ghState = join(prScratch, 'gh-state');
    const bin = join(prScratch, 'bin');
    mkdirSync(prRepo);
    mkdirSync(ghState);
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), fakeGh(ghState));
    chmodSync(join(bin, 'gh'), 0o755);

    git(prScratch, ['init', '-q', '--bare', '-b', 'main', prOrigin]);
    git(prRepo, ['init', '-q', '-b', 'main']);
    git(prRepo, ['config', 'user.name', 'open-pr']);
    git(prRepo, ['config', 'user.email', 'open-pr@test']);
    writeFileSync(join(prRepo, 'notes.md'), 'one\n');
    git(prRepo, ['add', 'notes.md']);
    git(prRepo, ['commit', '-q', '-m', 'base']);
    git(prRepo, ['remote', 'add', 'origin', prOrigin]);
    git(prRepo, ['push', '-q', '-u', 'origin', 'main']);
    git(prRepo, ['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(prRepo, 'notes.md'), 'one\ntwo\n');
    git(prRepo, ['commit', '-q', '-am', 'feature: add two']);
    writeFileSync(join(prRepo, 'notes.md'), 'one\ntwo\nthree\nfour\n');
    git(prRepo, ['commit', '-q', '-am', 'feature: add four']);

    process.env.PATH = `${bin}${delimiter}${previousPrEnv.PATH ?? ''}`;
    process.env.GOOSE_TEST_DIR = prRepo;
  });

  test.afterAll(() => {
    for (const [key, value] of Object.entries(previousPrEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(prScratch, { recursive: true, force: true });
  });

  test('pushes the branch, opens the prefilled sheet, creates the PR and shows its checks', async ({
    goosePage,
  }) => {
    test.setTimeout(180_000);
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await openPane(goosePage, 'git');

    const pane = goosePage.locator('[data-testid="git-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="git-branch"]')).toHaveText('feature');
    const section = goosePage.locator('[data-testid="git-pr"]');
    await expect(section).toHaveAttribute('data-pr-state', 'empty', { timeout: 15000 });
    const open = goosePage.locator('[data-testid="git-pr-open"]');
    await expect(open).toHaveText('Push and open PR…');
    await expect(open).toBeEnabled();
    await expect(goosePage.locator('[data-testid="git-pr-blocker"]')).toHaveCount(0);

    // The push lands the branch on origin before the sheet opens, prefilled newest first.
    await open.click();
    const sheet = goosePage.locator('[data-testid="pr-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 15000 });
    expect(git(prOrigin, ['rev-parse', 'feature']).trim()).toBe(
      git(prRepo, ['rev-parse', 'HEAD']).trim()
    );
    expect(git(prRepo, ['rev-parse', '--abbrev-ref', 'feature@{upstream}']).trim()).toBe(
      'origin/feature'
    );
    await expect(goosePage.locator('[data-testid="pr-title"]')).toHaveValue('feature: add four');
    await expect(goosePage.locator('[data-testid="pr-body"]')).toHaveValue(
      '- feature: add four\n- feature: add two'
    );
    await expect(goosePage.locator('[data-testid="pr-draft"]')).not.toBeChecked();
    await expect(sheet).toContainText('From feature into main');
    await goosePage.screenshot({
      path: test.info().outputPath('open-pr-sheet.png'),
      fullPage: true,
    });

    await goosePage.locator('[data-testid="pr-create"]').click();
    await expect(sheet).toHaveCount(0, { timeout: 15000 });
    const argv = readFileSync(join(ghState, 'create.args'), 'utf8').split('\n');
    expect(argv.slice(0, 6)).toEqual([
      'pr',
      'create',
      '--head',
      'feature',
      '--title',
      'feature: add four',
    ]);
    expect(argv).toContain('--body');
    expect(argv).not.toContain('--draft');

    // The number and URL, then the status refetched: state and the fake's checks.
    const link = goosePage.locator('[data-testid="git-pr-link"]');
    await expect(link).toContainText('#42', { timeout: 15000 });
    await expect(link).toHaveAttribute('href', 'https://github.com/acme/repo/pull/42');
    await expect(section).toHaveAttribute('data-pr-state', 'ready', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="git-pr-state"]')).toHaveText('Open');
    await expect(goosePage.locator('[data-testid="git-pr-url"]')).toHaveText(
      'https://github.com/acme/repo/pull/42'
    );
    await expect(goosePage.locator('[data-testid="git-pr-check"]')).toHaveCount(3);
    const failing = goosePage.locator('[data-testid="git-pr-check"][data-check-state="fail"]');
    await expect(failing).toHaveCount(1);
    await expect(failing).toContainText('lint');
    await expect(
      goosePage.locator('[data-testid="git-pr-check"][data-check-state="pending"]')
    ).toContainText('e2e');

    await goosePage.screenshot({
      path: test.info().outputPath('open-pr-status.png'),
      fullPage: true,
    });
  });
});
