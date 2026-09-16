import { describe, expect, it, vi } from 'vitest';
import {
  closePane,
  createPaneStore,
  initialLayout,
  markUnseen,
  modeForWidth,
  movePanel,
  moveTab,
  openPane,
  resize,
  resizeColumn,
  restoreColumns,
  restoreDock,
  setMode,
  show,
  tearOff,
  paneVisible,
  DEFAULT_COLUMNS,
  MAX_COLUMN_PX,
  MIN_COLUMN_PX,
  type PaneId,
  type PaneLayout,
} from './pane-store';

const tabsOf = (layout: PaneLayout) => layout.dock.map((panel) => panel.tabs);
const sizesOf = (layout: PaneLayout) => layout.dock.map((panel) => panel.size);
const sumOf = (layout: PaneLayout) => sizesOf(layout).reduce((sum, size) => sum + size, 0);

// files in the top panel, terminal torn off below it, half the dock each.
function twoPanels(): PaneLayout {
  return tearOff(openPane(openPane(initialLayout(), 'files'), 'terminal'), 'terminal');
}

describe('pane-store dock on the desktop', () => {
  it('starts as chat alone with an empty dock', () => {
    const layout = initialLayout();
    expect(layout.dock).toEqual([]);
    expect(layout.visible).toBe('chat');
  });

  it('opens the first pane into a new panel that fills the dock', () => {
    const layout = openPane(initialLayout(), 'terminal');
    expect(tabsOf(layout)).toEqual([['terminal']]);
    expect(layout.dock[0].active).toBe('terminal');
    expect(sizesOf(layout)).toEqual([1]);
  });

  it('opens a new pane as a tab of the first panel', () => {
    const layout = openPane(openPane(initialLayout(), 'files'), 'diff');
    expect(tabsOf(layout)).toEqual([['files', 'diff']]);
    expect(layout.dock[0].active).toBe('diff');
  });

  it('opens a pane already in the dock by activating it in its own panel', () => {
    const layout = twoPanels();
    const opened = openPane(layout, 'files');
    expect(tabsOf(opened)).toEqual(tabsOf(layout));
    expect(opened.dock[0].active).toBe('files');
    expect(openPane(opened, 'files')).toBe(opened);
    expect(openPane(opened, 'terminal')).toBe(opened);
  });

  it('tears a pane off into a new panel below its source, taking half its height', () => {
    const layout = twoPanels();
    expect(tabsOf(layout)).toEqual([['files'], ['terminal']]);
    expect(sizesOf(layout)).toEqual([0.5, 0.5]);
    expect(layout.dock[0].active).toBe('files');
    expect(layout.dock[1].active).toBe('terminal');
  });

  it('tears an absent pane off at the bottom and leaves a lone pane where it is', () => {
    const layout = tearOff(twoPanels(), 'git');
    expect(tabsOf(layout)).toEqual([['files'], ['terminal'], ['git']]);
    expect(sizesOf(layout)).toEqual([0.5, 0.25, 0.25]);
    expect(tearOff(layout, 'git')).toBe(layout);
  });

  it('moves a tab between panels and collapses the emptied source', () => {
    const layout = moveTab(twoPanels(), 'files', 1, 0);
    expect(tabsOf(layout)).toEqual([['files', 'terminal']]);
    expect(layout.dock[0].active).toBe('files');
    expect(sizesOf(layout)).toEqual([1]);
  });

  it('moves a tab to a position in a fuller panel', () => {
    const layout = moveTab(openPane(twoPanels(), 'git'), 'terminal', 0, 1);
    expect(tabsOf(layout)).toEqual([['files', 'terminal', 'git']]);
    expect(layout.dock[0].active).toBe('terminal');
  });

  it('reorders a tab within its panel and ignores a move to where it is', () => {
    const layout = openPane(openPane(initialLayout(), 'files'), 'editor');
    const reordered = moveTab(layout, 'editor', 0, 0);
    expect(tabsOf(reordered)).toEqual([['editor', 'files']]);
    expect(moveTab(reordered, 'editor', 0, 0)).toBe(reordered);
    expect(moveTab(reordered, 'git', 0, 0)).toBe(reordered);
  });

  it('moves a panel down and back up', () => {
    const layout = twoPanels();
    const down = movePanel(layout, 0, 1);
    expect(tabsOf(down)).toEqual([['terminal'], ['files']]);
    expect(tabsOf(movePanel(down, 1, 0))).toEqual(tabsOf(layout));
    expect(movePanel(layout, 1, 1)).toBe(layout);
  });

  it('resizes a panel against its neighbour so the sizes keep summing to 1', () => {
    const layout = resize(twoPanels(), 0, 0.7);
    expect(sizesOf(layout)[0]).toBe(0.7);
    expect(sizesOf(layout)[1]).toBeCloseTo(0.3);
    expect(sumOf(layout)).toBeCloseTo(1);
    const last = resize(layout, 1, 0.6);
    expect(sizesOf(last)[0]).toBeCloseTo(0.4);
    expect(sizesOf(last)[1]).toBe(0.6);
    expect(sumOf(last)).toBeCloseTo(1);
  });

  it('never resizes a panel away and ignores a resize of a lone panel', () => {
    const layout = resize(twoPanels(), 0, 2);
    expect(sizesOf(layout)[0]).toBe(0.9);
    expect(sizesOf(layout)[1]).toBeCloseTo(0.1);
    expect(resize(layout, 0, 0.9)).toBe(layout);
    const lone = openPane(initialLayout(), 'files');
    expect(resize(lone, 0, 0.5)).toBe(lone);
  });

  it('closes a tab and activates its neighbour', () => {
    const layout = openPane(openPane(openPane(initialLayout(), 'files'), 'editor'), 'diff');
    const closedMiddle = closePane(openPane(layout, 'editor'), 'editor');
    expect(tabsOf(closedMiddle)).toEqual([['files', 'diff']]);
    expect(closedMiddle.dock[0].active).toBe('diff');
    const closedLast = closePane(closedMiddle, 'diff');
    expect(closedLast.dock[0].active).toBe('files');
    expect(closePane(closedLast, 'git')).toBe(closedLast);
  });

  it('collapses an emptied panel into the one above, or below from the top', () => {
    const layout = tearOff(twoPanels(), 'git');
    const closedBottom = closePane(layout, 'git');
    expect(tabsOf(closedBottom)).toEqual([['files'], ['terminal']]);
    expect(sizesOf(closedBottom)).toEqual([0.5, 0.5]);
    const closedTop = closePane(layout, 'files');
    expect(tabsOf(closedTop)).toEqual([['terminal'], ['git']]);
    expect(sizesOf(closedTop)).toEqual([0.75, 0.25]);
    expect(closePane(closePane(closedTop, 'terminal'), 'git').dock).toEqual([]);
  });

  it('keeps panel identity across moves and resizes and pane identity across panels', () => {
    const layout = twoPanels();
    const ids = layout.dock.map((panel) => panel.id);
    expect(new Set(ids).size).toBe(2);
    const shuffled = resize(movePanel(moveTab(layout, 'files', 1, 0), 0, 0), 0, 0.5);
    expect(shuffled.dock.map((panel) => panel.id)).toEqual([ids[1]]);
    expect(shuffled.dock[0].tabs).toContain('files');
    expect(tearOff(shuffled, 'files').dock.map((panel) => panel.id)).not.toContain(ids[0]);
  });
});

describe('pane-store on the phone', () => {
  it('splits below 768 px', () => {
    expect(modeForWidth(767)).toBe('phone');
    expect(modeForWidth(768)).toBe('desktop');
  });

  it('never splits: opening a pane shows it alone and leaves the dock untouched', () => {
    const layout = initialLayout('phone');
    expect(layout.visible).toBe('chat');
    const opened = openPane(layout, 'terminal');
    expect(opened.visible).toBe('terminal');
    expect(opened.dock).toEqual([]);
    expect(tearOff(opened, 'files').visible).toBe('files');
    expect(show(opened, 'chat').visible).toBe('chat');
    expect(closePane(opened, 'terminal').visible).toBe('chat');
  });

  it('folds the dock away behind the chat when shrinking and opens the shown pane back', () => {
    const desktop = twoPanels();
    const phone = setMode(desktop, 'phone');
    expect(phone.visible).toBe('chat');
    expect(phone.dock).toBe(desktop.dock);
    const back = setMode(show(phone, 'git'), 'desktop');
    expect(back.visible).toBe('chat');
    expect(tabsOf(back)).toEqual([['files', 'git'], ['terminal']]);
    expect(back.dock[0].active).toBe('git');
  });
});

describe('restoreDock', () => {
  it('rebuilds a saved dock with fresh ids and sizes summing to 1', () => {
    const before = twoPanels();
    const saved = before.dock.map(({ tabs, active, size }) => ({ tabs, active, size: size * 3 }));
    const layout = restoreDock(initialLayout(), saved);
    expect(tabsOf(layout)).toEqual(tabsOf(before));
    expect(layout.dock.map((panel) => panel.active)).toEqual(['files', 'terminal']);
    expect(sizesOf(layout)).toEqual([0.5, 0.5]);
    expect(layout.dock.map((panel) => panel.id)).not.toContain(before.dock[0].id);
    expect(new Set(layout.dock.map((panel) => panel.id)).size).toBe(2);
  });

  it('drops what is not a pane or is listed twice, and keeps nothing over an empty save', () => {
    const empty = initialLayout();
    const layout = restoreDock(empty, [
      { tabs: ['files', 'nope' as PaneId, 'diff'], active: 'nope' as PaneId, size: Number.NaN },
      { tabs: ['diff'], active: 'diff', size: -1 },
      { tabs: ['git'], active: 'git', size: 1 },
    ]);
    expect(tabsOf(layout)).toEqual([['files', 'diff'], ['git']]);
    expect(layout.dock[0].active).toBe('files');
    expect(sumOf(layout)).toBeCloseTo(1);
    expect(restoreDock(empty, [])).toBe(empty);
    expect(restoreDock(empty, [{ tabs: [], active: 'files', size: 1 }])).toBe(empty);
  });
});

describe('columns', () => {
  it('starts at the defaults and resizes one column at a time, clamped and whole', () => {
    const layout = initialLayout();
    expect(layout.columns).toEqual(DEFAULT_COLUMNS);
    const wider = resizeColumn(layout, 'work', 600.4);
    expect(wider.columns).toEqual({ ...DEFAULT_COLUMNS, work: 600 });
    expect(resizeColumn(wider, 'sessions', 10).columns.sessions).toBe(MIN_COLUMN_PX);
    expect(resizeColumn(wider, 'sessions', 99999).columns.sessions).toBe(MAX_COLUMN_PX);
    expect(resizeColumn(wider, 'work', 600)).toBe(wider);
  });

  it('restores saved widths and keeps the default for anything unusable', () => {
    const layout = initialLayout();
    expect(restoreColumns(layout, null)).toBe(layout);
    expect(restoreColumns(layout, { sessions: 320, work: 500 }).columns).toEqual({
      sessions: 320,
      work: 500,
    });
    const partial = restoreColumns(layout, { sessions: Number.NaN, work: 900 } as never);
    expect(partial.columns).toEqual({ sessions: DEFAULT_COLUMNS.sessions, work: 900 });
    expect(restoreColumns(layout, { work: 'wide' } as never)).toBe(layout);
  });
});

describe('createPaneStore', () => {
  it('notifies once per change and not on no-ops', () => {
    const store = createPaneStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.openPane('diff');
    store.openPane('diff');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(tabsOf(store.getState())).toEqual([['diff']]);
    unsubscribe();
    store.closePane('diff');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().dock).toEqual([]);
  });
});

// Task 69: the rail's status dots — a pane that is off screen keeps what arrived until it
// is opened; a visible pane shows it itself.
describe('pane-store unseen', () => {
  it('starts with nothing unseen', () => {
    expect([...initialLayout().unseen]).toEqual([]);
  });

  it('marks a hidden pane and leaves a visible one alone', () => {
    const layout = openPane(initialLayout(), 'terminal');
    expect(paneVisible(layout, 'terminal')).toBe(true);
    expect(markUnseen(layout, 'terminal')).toBe(layout);
    const marked = markUnseen(layout, 'browser');
    expect([...marked.unseen]).toEqual(['browser']);
    expect(marked.dock).toBe(layout.dock);
  });

  it('marks a tab behind the active one, and once only', () => {
    const layout = openPane(openPane(initialLayout(), 'browser'), 'terminal');
    const marked = markUnseen(layout, 'browser');
    expect([...marked.unseen]).toEqual(['browser']);
    expect(markUnseen(marked, 'browser')).toBe(marked);
  });

  it("clears on open, tear off, tab move and the phone's show", () => {
    const marked = markUnseen(markUnseen(initialLayout(), 'diff'), 'browser');
    expect([...openPane(marked, 'diff').unseen]).toEqual(['browser']);
    expect([...tearOff(marked, 'diff').unseen]).toEqual(['browser']);
    const behind = markUnseen(openPane(openPane(initialLayout(), 'diff'), 'terminal'), 'diff');
    expect([...moveTab(behind, 'diff', 0, 0).unseen]).toEqual([]);
    const phone = markUnseen(setMode(initialLayout(), 'phone'), 'diff');
    expect([...phone.unseen]).toEqual(['diff']);
    expect([...show(phone, 'diff').unseen]).toEqual([]);
    expect([...show(phone, 'chat').unseen]).toEqual(['diff']);
  });

  it('stays out of what the dock saves', () => {
    const marked = markUnseen(initialLayout(), 'diff');
    expect(marked.dock).toEqual([]);
  });
});

describe('createPaneStore markUnseen', () => {
  it('notifies once for a burst and not while the pane shows', () => {
    const store = createPaneStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.markUnseen('terminal');
    store.markUnseen('terminal');
    store.markUnseen('terminal');
    expect(listener).toHaveBeenCalledTimes(1);
    expect([...store.getState().unseen]).toEqual(['terminal']);
    store.openPane('terminal');
    expect([...store.getState().unseen]).toEqual([]);
    store.markUnseen('terminal');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
