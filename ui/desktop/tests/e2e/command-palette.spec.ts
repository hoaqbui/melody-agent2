import { test, expect } from './fixtures';

// Task 92: Command palette ⌘K. The palette lists panes, session actions, other sessions,
// routines, lever stops, and routes; typed filtering narrows by fuzzy match. Opens from ⌘K,
// the ⋯ menu, or (phone width) the search tab on the rail; closed by Esc or running a command;
// focus returns to what opened it. Terminal lets ⌘K through.

test.describe('command palette', () => {
  test.setTimeout(120_000);

  test('opens with ⌘K, shows groups, filters by typing, closes on selection', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // Start a session so session actions are available
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('reply with "test complete"');
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    const reply = goosePage.locator('[data-testid="message-container"].assistant').last();
    await expect(reply).toContainText(/test complete/i, { timeout: 60_000 });

    // ⌘K opens the palette
    await goosePage.press('Meta+k');
    const palette = goosePage.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    // Input is focused
    const paletteInput = goosePage.locator('[data-testid="palette-input"]');
    await expect(paletteInput).toBeFocused();

    // Groups are visible
    const panesList = goosePage.locator('[data-testid="palette-list"]');
    await expect(panesList).toHaveAttribute('data-state', 'ready');
    await expect(goosePage.locator('[data-testid="palette-group-panes"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="palette-group-session"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="palette-group-lever"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="palette-group-go-to"]')).toBeVisible();

    // Type "term" → Terminal pane appears first
    await paletteInput.fill('term');
    await expect(goosePage.locator('[data-testid="palette-item-pane-terminal"]')).toBeVisible();
    const terminalItem = goosePage.locator('[data-testid="palette-item-pane-terminal"]').first();
    await expect(terminalItem).toHaveAttribute('aria-selected', 'true');

    // Enter → Terminal opens, palette closed
    await paletteInput.press('Enter');
    await expect(palette).not.toBeVisible({ timeout: 5000 });
    const terminalPane = goosePage.locator('[data-testid="workspace-pane-terminal"]');
    await expect(terminalPane).toBeVisible();
    const terminalTab = goosePage.locator('[data-testid="workspace-pane-button-terminal"]');
    await expect(terminalTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('Esc closes and returns focus', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // Start a session
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('test');
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    // Focus the input
    await input.focus();

    // Open and close palette with Esc
    await goosePage.press('Meta+k');
    const palette = goosePage.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    await palette.press('Escape');
    await expect(palette).not.toBeVisible({ timeout: 5000 });

    // Focus returns to input
    await expect(input).toBeFocused();
  });

  test('opens from ⋯ menu row "Command palette"', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // Start a session
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('test');
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    // Open ⋯ menu
    const moreButton = goosePage.locator('[data-testid="workspace-pane-more"]');
    await moreButton.click();
    const menu = goosePage.locator('[data-testid="workspace-pane-more-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Click "Command palette"
    const paletteMenuItem = goosePage.locator('[data-testid="workspace-command-palette"]');
    await expect(paletteMenuItem).toBeVisible();
    await paletteMenuItem.click();

    // Palette opens
    const palette = goosePage.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });
    const paletteInput = goosePage.locator('[data-testid="palette-input"]');
    await expect(paletteInput).toBeFocused();
  });

  test('arrow keys navigate, Enter runs', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // Start a session
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('test');
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    // Open palette
    await goosePage.press('Meta+k');
    const palette = goosePage.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    const paletteInput = goosePage.locator('[data-testid="palette-input"]');
    // Arrow down selects next item
    await paletteInput.press('ArrowDown');
    const listItems = goosePage.locator('[data-testid^="palette-item-"]');
    const firstItem = listItems.first();
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');

    // Arrow down again
    await paletteInput.press('ArrowDown');
    const secondItem = listItems.nth(1);
    await expect(secondItem).toHaveAttribute('aria-selected', 'true');

    // Arrow up goes back
    await paletteInput.press('ArrowUp');
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');
  });

  test('no matches shows empty state', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // Open palette
    await goosePage.press('Meta+k');
    const palette = goosePage.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    // Type something that doesn't match
    const paletteInput = goosePage.locator('[data-testid="palette-input"]');
    await paletteInput.fill('xyznotamatch');

    // Empty state shown
    const empty = goosePage.locator('[data-testid="palette-empty"]');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('Nothing matches');
  });

  test('Terminal pane lets ⌘K through', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // Start a session
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('test');
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    // Open Terminal
    await goosePage.press('Meta+k');
    const paletteInput = goosePage.locator('[data-testid="palette-input"]');
    await paletteInput.fill('term');
    await paletteInput.press('Enter');
    const terminalPane = goosePage.locator('[data-testid="workspace-pane-terminal"]');
    await expect(terminalPane).toBeVisible();

    // Focus the terminal (click on it)
    await terminalPane.click();
    await goosePage.waitForTimeout(500);

    // ⌘K from terminal should still open palette
    await goosePage.press('Meta+k');
    const palette = goosePage.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });
    const paletteInput2 = goosePage.locator('[data-testid="palette-input"]');
    await expect(paletteInput2).toBeFocused();
  });

  test('phone width: search tab opens palette', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 390, height: 844 });

    // Start a session
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('test');
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    // Phone: search tab on rail
    const searchTab = goosePage.locator('[data-testid="palette-tab"]');
    await expect(searchTab).toBeVisible();
    await searchTab.click();

    // Palette opens full-screen
    const palette = goosePage.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });
    const paletteInput = goosePage.locator('[data-testid="palette-input"]');
    await expect(paletteInput).toBeFocused();
  });
});
