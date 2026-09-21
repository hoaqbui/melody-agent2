import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, emptyDock, openPane } from './fixtures';

// Task 95 (PRD `docs/2026-09-18-panes-research-v1.md` §Item 12): a long doc's Contents lets
// you jump around it, and Edit steps into the Editor at the heading you were reading —
// Markdown is a reader with a door, not a dead end. `doc.md` carries 5 headings over ~120
// lines so Contents shows (>= 3 headings); `readme.md` carries 2 so it does not.
const HEADING_TITLES = [
  'Heading One',
  'Heading Two',
  'Heading Three',
  'Heading Four',
  'Heading Five',
];

function buildDoc(): { content: string; headingLines: number[] } {
  const lines: string[] = [];
  const headingLines: number[] = [];
  for (const title of HEADING_TITLES) {
    headingLines.push(lines.length + 1);
    lines.push(`## ${title}`);
    lines.push('');
    for (let i = 0; i < 20; i++) lines.push(`Paragraph text for ${title}, sentence ${i}.`);
    lines.push('');
  }
  return { content: `${lines.join('\n')}\n`, headingLines };
}

// GitHub's slug: lowercase, spaces to hyphens — matches `slug()` in `markdown-state.ts`, since
// MarkdownView gives every rendered heading this id.
const slugOf = (title: string) => title.toLowerCase().replace(/\s+/g, '-');

const previousDir = process.env.GOOSE_TEST_DIR;
let scratch = '';
let headingLines: number[] = [];

test.describe('markdown pane', { tag: '@smoke' }, () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-markdown-pane-'));
    const built = buildDoc();
    headingLines = built.headingLines;
    writeFileSync(join(scratch, 'doc.md'), built.content);
    writeFileSync(
      join(scratch, 'README.md'),
      '# Overview\n\nAn intro paragraph.\n\n## Details\n\nMore text below it.\n'
    );
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('lists a long doc as Contents, jumps a row to the top, and Edit opens the Editor there', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await emptyDock(goosePage);
    await openPane(goosePage, 'files');

    const files = goosePage.locator('[data-testid="files-pane"]');
    await expect(files).not.toHaveAttribute('data-state', 'loading', { timeout: 15000 });
    await files.locator('[data-testid="files-row"][data-path$="/doc.md"]').click();

    await openPane(goosePage, 'markdown');
    const markdown = goosePage.locator('[data-testid="markdown-pane"]');
    await expect(markdown).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(markdown.locator('[data-testid="workspace-markdown-file"]')).toContainText(
      'doc.md'
    );

    // Step 1: 5 headings → Contents shows all 5 rows.
    const toc = markdown.locator('[data-testid="markdown-toc"]');
    await expect(toc).toBeVisible();
    const rows = toc.locator('[data-testid="markdown-toc-row"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(3)).toContainText('Heading Four');

    // Step 2: clicking the 4th row scrolls the pane so that heading sits at the top.
    const view = markdown.locator('[data-testid="markdown-view"]');
    await rows.nth(3).click();
    const target = view.locator(`#${slugOf('Heading Four')}`);
    await expect
      .poll(async () => {
        const viewBox = await view.boundingBox();
        const targetBox = await target.boundingBox();
        if (!viewBox || !targetBox) return null;
        return Math.abs(targetBox.y - viewBox.y);
      })
      .toBeLessThan(2);

    // Step 3: Edit opens the Editor at that heading's source line.
    await markdown.locator('[data-testid="markdown-edit"]').click();
    const editor = goosePage.locator('[data-testid="workspace-pane-editor"]');
    await expect(editor).toBeVisible();
    const editorFile = editor.locator('[data-testid="workspace-editor-file"]');
    await expect(editorFile).toContainText('doc.md');
    await expect(editorFile).toHaveAttribute('data-line', String(headingLines[3]));

    // Step 5: Contents rows are reachable by keyboard — focus, then Enter jumps like a click.
    // The second heading, not the first: the first already sits at the top of the document, so
    // a jump to it cannot move the view.
    await openPane(goosePage, 'markdown');
    await rows.nth(1).focus();
    await rows.nth(1).press('Enter');
    const second = view.locator(`#${slugOf('Heading Two')}`);
    await expect
      .poll(async () => {
        const viewBox = await view.boundingBox();
        const targetBox = await second.boundingBox();
        if (!viewBox || !targetBox) return null;
        return Math.abs(targetBox.y - viewBox.y);
      })
      .toBeLessThan(2);

    // Step 4: a file with only 2 headings shows no Contents.
    await openPane(goosePage, 'files');
    await files.locator('[data-testid="files-row"][data-path$="/README.md"]').click();
    await openPane(goosePage, 'markdown');
    await expect(markdown.locator('[data-testid="workspace-markdown-file"]')).toContainText(
      'README.md'
    );
    await expect(markdown.locator('[data-testid="markdown-toc"]')).toHaveCount(0);
    await expect(markdown.locator('[data-testid="markdown-edit"]')).toBeVisible();

    await goosePage.screenshot({
      path: test.info().outputPath('markdown-pane.png'),
      fullPage: true,
    });
    await emptyDock(goosePage);
  });
});
