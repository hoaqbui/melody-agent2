import { test, expect, emptyDock, openPane } from './fixtures';

// Task 133 (PRD docs/2026-09-20-work-ledger-prd-v1.md): the Telemetry pane opens from the
// panel's + like any pane; the three scopes swap views; the range buttons re-bucket the
// charts; every number explains itself on hover. No live seat is needed: with no ledger and
// no sessions the pane shows its Empty lines, and the walk checks the surfaces around them.
// Phone width (PRD step 5, later) belongs to the `phone` project, run by hand with the web
// build on :3285.
test.describe('telemetry pane', () => {
  test('opens, switches scope and grain, and explains a number on hover', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await emptyDock(goosePage);

    // A pane grows out of its tab (the Into Rule) and settles in its slot; the walk clicks
    // inside it only once it has.
    const settled = async () => {
      await expect(goosePage.locator('[data-testid="workspace-pane-telemetry"]')).toHaveAttribute(
        'data-position',
        'full'
      );
      await expect(goosePage.locator('[data-testid="telemetry-pane"]')).toBeVisible();
    };
    await openPane(goosePage, 'telemetry');
    await settled();
    const pane = goosePage.locator('[data-testid="telemetry-pane"]');
    await expect(goosePage.locator('[data-testid="workspace-pane-button-telemetry"]')).toHaveText(
      /Telemetry/
    );

    // Over time is the default scope (an earlier run may have left another; the scope is
    // remembered per project); the range seg and chip show there.
    await goosePage.locator('[data-testid="telemetry-scope-time"]').click();
    await goosePage.locator('[data-testid="telemetry-range-days"]').click();
    await expect(pane).toHaveAttribute('data-scope', 'time');
    await expect(goosePage.locator('[data-testid="telemetry-scope-time"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(goosePage.locator('[data-testid="telemetry-range-label"]')).toHaveText('14 d');
    // The Trends card is the one place words live; with no history it says so.
    await expect(goosePage.locator('[data-testid="telemetry-trends"]')).toBeVisible();

    // Quarters re-buckets: the chip reads the new span and the pane records the grain.
    await goosePage.locator('[data-testid="telemetry-range-quarters"]').click();
    await expect(pane).toHaveAttribute('data-grain', 'quarters');
    await expect(goosePage.locator('[data-testid="telemetry-range-label"]')).toHaveText('5 q');
    const stackTitle = goosePage.locator('[data-testid="telemetry-stack-title"]');
    if ((await stackTitle.count()) > 0) {
      await expect(stackTitle).toHaveText(/quarter/i);
    } else {
      await expect(goosePage.locator('[data-testid="telemetry-time-empty"]')).toBeVisible();
    }

    // Hover explains: the scope seg carries a why and a from.
    await goosePage.locator('[data-testid="telemetry-scope-time"]').hover();
    const why = goosePage.locator('[data-testid="telemetry-why"]');
    await expect(why).toBeVisible();
    await expect(goosePage.locator('[data-testid="telemetry-why-text"]')).toContainText(
      'Now is the open session'
    );
    await expect(goosePage.locator('[data-testid="telemetry-why-from"]')).toHaveText('scope');

    // Now hides the range seg and, with no session open, says so.
    await goosePage.locator('[data-testid="telemetry-scope-now"]').click();
    await expect(pane).toHaveAttribute('data-scope', 'now');
    await expect(goosePage.locator('[data-testid="telemetry-range-days"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="telemetry-now-empty"]')).toBeVisible();

    // Roles: nothing delegated yet reads as its Empty line.
    await goosePage.locator('[data-testid="telemetry-scope-roles"]').click();
    await expect(pane).toHaveAttribute('data-scope', 'roles');
    await expect(
      goosePage
        .locator('[data-testid="telemetry-roles-empty"], [data-testid="telemetry-roles"]')
        .first()
    ).toBeVisible();

    // The scope is remembered per project: reopening lands on Roles.
    await goosePage
      .locator('[data-testid="workspace-pane-close-telemetry"]')
      .click({ force: true });
    // The tab disappears into the bar before + lists the pane again.
    await expect(goosePage.locator('[data-testid="workspace-pane-button-telemetry"]')).toHaveCount(
      0
    );
    await openPane(goosePage, 'telemetry');
    await settled();
    await expect(goosePage.locator('[data-testid="telemetry-pane"]')).toHaveAttribute(
      'data-scope',
      'roles'
    );
    await goosePage.locator('[data-testid="telemetry-scope-time"]').click();
    await expect(goosePage.locator('[data-testid="telemetry-pane"]')).toHaveAttribute(
      'data-scope',
      'time'
    );
  });
});
