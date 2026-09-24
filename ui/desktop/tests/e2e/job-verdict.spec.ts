import type { Page } from '@playwright/test';
import { test, expect, emptyDock, openPane } from './fixtures';

// Task 268: the one-tap verdict on a done worker row (good · fixed it · wrong) and "Fixes…" to
// name an earlier job in this repository as fixed. No live seat: a "done" delegation is seeded
// straight into the client-side store the same way task 200's walk reaches into the app
// mid-turn — a dynamic import of the real module, called directly from the page, standing in
// for the wire event a seat would otherwise send (`acp/delegations.ts`'s own
// `applyDelegationUpdate`). The earlier job's own ledger `worker` line is appended the same
// direct way (`native/ledger.ts`'s `appendLedger`) rather than waited for out of
// `useLedgerWriter` — that hook is a different task's contract, and this walk only needs the
// line to exist before the pane's one read of it.
//
// `import()` runs as a bare string, not inside a page.evaluate callback: Playwright's own
// transform of this file targets Node/CJS and would be free to rewrite a dynamic import
// sitting inside a serialized function body into a `require()`, which does not exist in the
// page. A string is never touched by that transform — the page evaluates it verbatim.

interface JobVerdictLedgerEvent {
  kind: string;
  workerSessionId?: string;
  fromWorkerSessionId?: string;
  by?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __jobVerdictTest?: {
      applyDelegationUpdate: (update: {
        subagentSessionId: string;
        parentSessionId: string;
        provider: string;
        model: string;
        title: string;
        status: 'running' | 'done' | 'failed';
        source?: string;
      }) => void;
      readLedger: (cwd: string) => Promise<JobVerdictLedgerEvent[]>;
      appendLedger: (cwd: string, event: Record<string, unknown>) => Promise<void>;
    };
  }
}

const INSTALL_HELPERS = `
  Promise.all([
    import('/src/acp/delegations.ts'),
    import('/src/native/ledger.ts'),
    import('/src/utils/workingDir.ts'),
  ]).then(([delegations, ledger, workingDir]) => {
    window.__jobVerdictTest = {
      applyDelegationUpdate: delegations.applyDelegationUpdate,
      readLedger: ledger.readLedger,
      appendLedger: ledger.appendLedger,
    };
    return workingDir.getInitialWorkingDir();
  });
`;

async function installHelpers(page: Page): Promise<string> {
  return page.evaluate(INSTALL_HELPERS);
}

async function seedDone(
  page: Page,
  parentSessionId: string,
  subagentSessionId: string,
  title: string
): Promise<void> {
  await page.evaluate(
    ({ parentSessionId, subagentSessionId, title }) => {
      window.__jobVerdictTest!.applyDelegationUpdate({
        subagentSessionId,
        parentSessionId,
        provider: 'claude-code',
        model: 'claude-sonnet-4-5',
        title,
        status: 'done',
        source: 'implementer',
      });
    },
    { parentSessionId, subagentSessionId, title }
  );
}

// The earlier job's own ledger line, written directly — not through `useLedgerWriter`, which
// belongs to a different task's contract and only reacts to the currently open session's own
// delegations. This walk needs the line durably on disk before it opens the pane, not eventually.
async function appendWorker(
  page: Page,
  cwd: string,
  parentSessionId: string,
  workerSessionId: string
): Promise<void> {
  await page.evaluate(
    ({ cwd, parentSessionId, workerSessionId }) =>
      window.__jobVerdictTest!.appendLedger(cwd, {
        kind: 'worker',
        at: new Date().toISOString(),
        sessionId: parentSessionId,
        workerSessionId,
        status: 'done',
        blocked: false,
        filesChanged: [],
        source: 'implementer',
      }),
    { cwd, parentSessionId, workerSessionId }
  );
}

async function ledgerEvents(page: Page, cwd: string): Promise<JobVerdictLedgerEvent[]> {
  return page.evaluate((cwd) => window.__jobVerdictTest!.readLedger(cwd), cwd);
}

test.describe('job verdict', () => {
  test('one tap writes one verdict event, a re-render adds none, and Fixes… writes one link', async ({
    goosePage,
  }) => {
    test.setTimeout(60000);
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await emptyDock(goosePage);

    const stamp = Date.now();
    const parentSessionId = `t268-parent-${stamp}`;
    const earlierJobId = `t268-earlier-${stamp}`;
    const jobId = `t268-job-${stamp}`;

    // A route the Agents pane reads its session from (`AgentsPane.tsx` `useSessionId`), with no
    // real session behind it — the Chat column's own load fails quietly; the Work column does
    // not depend on it.
    await goosePage.evaluate((next) => {
      window.location.hash = next;
    }, `#/pair?resumeSessionId=${parentSessionId}`);

    const cwd = await installHelpers(goosePage);

    // The earlier job durably on disk before the pane's own one read of the ledger
    // (`AgentsPane.tsx` reads once per cwd), so it is there for "Fixes…" to offer below. Also
    // seeded as a delegation, so its own row is a real one in the tree (task 200's trick again).
    await seedDone(goosePage, parentSessionId, earlierJobId, 'task 1: an earlier job');
    await appendWorker(goosePage, cwd, parentSessionId, earlierJobId);

    await openPane(goosePage, 'agents');
    const pane = goosePage.locator('[data-testid="agents-pane"]');
    await expect(pane).toBeVisible();

    await seedDone(goosePage, parentSessionId, jobId, 'task 2: the job under test');
    const row = pane.locator(`[data-testid="agents-row"][data-session-id="${jobId}"]`);
    await expect(row).toHaveAttribute('data-status', 'done');

    // One tap.
    await row.locator('[data-testid="agents-row-verdict-good"]').click();
    await expect
      .poll(
        async () => {
          const events = await ledgerEvents(goosePage, cwd);
          return events.filter((e) => e.kind === 'verdict' && e.workerSessionId === jobId).length;
        },
        { timeout: 15000 }
      )
      .toBe(1);

    // A re-render (the same wire event replayed, as a reconnect would) adds none.
    await seedDone(goosePage, parentSessionId, jobId, 'task 2: the job under test');
    await expect(row).toHaveAttribute('data-status', 'done');
    const afterRerender = await ledgerEvents(goosePage, cwd);
    expect(
      afterRerender.filter((e) => e.kind === 'verdict' && e.workerSessionId === jobId)
    ).toHaveLength(1);

    // Fixes… lists the earlier job and writes one link when picked.
    await row.locator('[data-testid="agents-row-fixes"]').click();
    const fixItem = goosePage.locator(
      `[data-testid="agents-row-fixes-item"][data-worker-session-id="${earlierJobId}"]`
    );
    await expect(fixItem).toBeVisible();
    await fixItem.click();
    await expect
      .poll(
        async () => {
          const events = await ledgerEvents(goosePage, cwd);
          return events.filter(
            (e) =>
              e.kind === 'link' &&
              e.workerSessionId === earlierJobId &&
              e.fromWorkerSessionId === jobId &&
              e.by === 'user'
          ).length;
        },
        { timeout: 15000 }
      )
      .toBe(1);
  });
});
