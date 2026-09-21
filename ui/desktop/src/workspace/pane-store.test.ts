import { describe, expect, it, vi } from 'vitest';
import {
  closePane,
  createPaneStore,
  dock,
  initialLayout,
  markUnseen,
  modeForWidth,
  openPane,
  panelTabs,
  paneVisible,
  positionOf,
  resize,
  resizeColumn,
  restoreColumns,
  restoreDock,
  setMode,
  show,
  DEFAULT_COLUMNS,
  MAX_COLUMN_PX,
  MIN_COLUMN_PX,
  type PaneId,
  type PaneLayout,
} from './pane-store';

const slotsOf = (layout: PaneLayout) => layout.slots;
const empty = { top: null, bottom: null, full: null };

// terminal opened first, then diff dragged onto the bottom half: terminal in the top
// half, diff in the bottom — the split is a drag, never a default (option B, 2026-09-20).
function twoHalves(): PaneLayout {
  return dock(openPane(initialLayout(), 'terminal'), 'diff', 'bottom');
}

describe('pane-store on the desktop', () => {
  it('starts as chat alone with no tabs and nothing in a slot', () => {
    const layout = initialLayout();
    expect(layout.tabs).toEqual([]);
    expect(slotsOf(layout)).toEqual(empty);
    expect(layout.visible).toBe('chat');
    expect(layout.size).toBe(0.5);
  });

  it('opens the first pane full', () => {
    const layout = openPane(initialLayout(), 'terminal');
    expect(layout.tabs).toEqual(['terminal']);
    expect(slotsOf(layout)).toEqual({ ...empty, full: 'terminal' });
    expect(positionOf(layout, 'terminal')).toBe('full');
  });

  it('opens a second pane full and parks the first, still open', () => {
    const layout = openPane(openPane(initialLayout(), 'terminal'), 'diff');
    expect(layout.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(layout)).toEqual({ top: null, bottom: null, full: 'diff' });
    expect(positionOf(layout, 'terminal')).toBeNull();
    expect(paneVisible(layout, 'terminal')).toBe(false);
  });

  it('splits only by a drag onto a half, and moves the full one to the other half', () => {
    const layout = twoHalves();
    expect(layout.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(layout)).toEqual({ top: 'terminal', bottom: 'diff', full: null });
    expect(layout.positions).toEqual({ terminal: 'top', diff: 'bottom' });
  });

  it('opens a third pane onto the top bar over a split, leaving the bottom alone', () => {
    const layout = openPane(twoHalves(), 'git');
    expect(layout.tabs).toEqual(['terminal', 'diff', 'git']);
    expect(slotsOf(layout)).toEqual({ top: 'git', bottom: 'diff', full: null });
    expect(panelTabs(layout, 'top')).toEqual(['terminal', 'git']);
    expect(panelTabs(layout, 'bottom')).toEqual(['diff']);
    expect(paneVisible(layout, 'terminal')).toBe(false);
  });

  it('opens a pane already showing as a no-op', () => {
    const layout = twoHalves();
    expect(openPane(layout, 'terminal')).toBe(layout);
    expect(openPane(layout, 'diff')).toBe(layout);
  });

  it('docks a pane full: the two bars merge into one and the pane is active', () => {
    const layout = dock(twoHalves(), 'diff', 'full');
    expect(layout.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(layout)).toEqual({ ...empty, full: 'diff' });
    expect(panelTabs(layout, 'full')).toEqual(['terminal', 'diff']);
    expect(dock(layout, 'diff', 'full')).toBe(layout);
  });

  it('brings a parked tab back beside its partner only while that partner shows in a half', () => {
    // diff went Full (a header pick before 114, a drag after): terminal is parked; opening
    // it again takes the column, since nothing shows in the other half.
    const parked = dock(twoHalves(), 'diff', 'full');
    expect(slotsOf(openPane(parked, 'terminal'))).toEqual({
      top: null,
      bottom: null,
      full: 'terminal',
    });
    // git dragged onto the bottom half parks diff; opening diff again lands it back in the
    // bottom half it remembers, beside the terminal still showing on top.
    const swapped = dock(twoHalves(), 'git', 'bottom');
    expect(slotsOf(swapped)).toEqual({ top: 'terminal', bottom: 'git', full: null });
    expect(slotsOf(openPane(swapped, 'diff'))).toEqual({
      top: 'terminal',
      bottom: 'diff',
      full: null,
    });
  });

  it('docks a tab of a one-panel bar into a half: the rest of the bar takes the other half', () => {
    const one = openPane(openPane(openPane(initialLayout(), 'terminal'), 'diff'), 'git');
    const top = dock(one, 'diff', 'top');
    expect(slotsOf(top)).toEqual({ top: 'diff', bottom: 'git', full: null });
    expect(panelTabs(top, 'top')).toEqual(['diff']);
    expect(panelTabs(top, 'bottom')).toEqual(['terminal', 'git']);
    const bottom = dock(one, 'diff', 'bottom');
    expect(slotsOf(bottom)).toEqual({ top: 'git', bottom: 'diff', full: null });
  });

  it('keeps a lone pane full whichever half it is docked to', () => {
    const lone = openPane(initialLayout(), 'files');
    expect(dock(lone, 'files', 'top')).toBe(lone);
    expect(dock(lone, 'files', 'bottom')).toBe(lone);
  });

  it('moving the only tab of a half onto the other bar folds the column back to one panel', () => {
    const layout = dock(twoHalves(), 'diff', 'top');
    expect(slotsOf(layout)).toEqual({ ...empty, full: 'diff' });
    expect(panelTabs(layout, 'full')).toEqual(['terminal', 'diff']);
  });

  it("docks a tab from one bar onto the other, which makes it that bar's active tab", () => {
    // terminal + git on top (git active), diff on the bottom; drag diff onto the top bar:
    // the bottom bar empties and the column folds to one panel with diff active.
    const three = openPane(twoHalves(), 'git');
    const folded = dock(three, 'diff', 'top');
    expect(slotsOf(folded)).toEqual({ ...empty, full: 'diff' });
    expect(panelTabs(folded, 'full')).toEqual(['terminal', 'diff', 'git']);
    // Drag terminal from the top bar onto the bottom bar instead: two bars stay.
    const moved = dock(three, 'terminal', 'bottom');
    expect(slotsOf(moved)).toEqual({ top: 'git', bottom: 'terminal', full: null });
    expect(panelTabs(moved, 'top')).toEqual(['git']);
    expect(panelTabs(moved, 'bottom')).toEqual(['terminal', 'diff']);
  });

  it('docks a new pane straight into a position', () => {
    const layout = dock(initialLayout(), 'browser', 'bottom');
    expect(layout.tabs).toEqual(['browser']);
    expect(slotsOf(layout)).toEqual({ ...empty, full: 'browser' });
    const two = dock(openPane(initialLayout(), 'files'), 'browser', 'top');
    expect(slotsOf(two)).toEqual({ top: 'browser', bottom: 'files', full: null });
  });

  it('resizes the seam, clamped, and ignores a resize with one pane', () => {
    const layout = resize(twoHalves(), 0.7);
    expect(layout.size).toBe(0.7);
    expect(resize(layout, 0.7)).toBe(layout);
    expect(resize(layout, 2).size).toBe(0.9);
    expect(resize(layout, -1).size).toBe(0.1);
    const lone = openPane(initialLayout(), 'files');
    expect(resize(lone, 0.3)).toBe(lone);
    expect(resize(twoHalves(), 0.7).size).toBe(0.7);
  });

  it('closes a tab: its bar activates the neighbour; an emptied bar takes its panel away', () => {
    const three = openPane(twoHalves(), 'git'); // top: terminal, git (git active); bottom: diff
    const closedActive = closePane(three, 'git');
    expect(closedActive.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(closedActive)).toEqual({ top: 'terminal', bottom: 'diff', full: null });
    const closedParked = closePane(three, 'terminal');
    expect(closedParked.tabs).toEqual(['diff', 'git']);
    expect(slotsOf(closedParked)).toEqual({ top: 'git', bottom: 'diff', full: null });
    const closedBottom = closePane(three, 'diff');
    expect(slotsOf(closedBottom)).toEqual({ ...empty, full: 'git' });
    expect(panelTabs(closedBottom, 'full')).toEqual(['terminal', 'git']);
    expect(closePane(three, 'files')).toBe(three);
    expect(slotsOf(closePane(closePane(closedBottom, 'terminal'), 'git'))).toEqual(empty);
  });

  it('closing the pane showing hands the column to the tab before it', () => {
    const three = openPane(openPane(openPane(initialLayout(), 'terminal'), 'diff'), 'git');
    const closedFront = closePane(three, 'git');
    expect(closedFront.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(closedFront)).toEqual({ ...empty, full: 'diff' });
    const closedFirst = closePane(openPane(three, 'terminal'), 'terminal');
    expect(slotsOf(closedFirst)).toEqual({ ...empty, full: 'diff' });
    expect(slotsOf(closePane(closePane(closedFront, 'diff'), 'terminal'))).toEqual(empty);
  });

  it('opens the next pane full after a close left one full', () => {
    const layout = openPane(closePane(twoHalves(), 'terminal'), 'files');
    expect(slotsOf(layout)).toEqual({ top: null, bottom: null, full: 'files' });
    expect(paneVisible(layout, 'diff')).toBe(false);
  });
});

describe('pane-store on the phone', () => {
  it('splits below 768 px', () => {
    expect(modeForWidth(767)).toBe('phone');
    expect(modeForWidth(768)).toBe('desktop');
  });

  it('never splits: opening a pane shows it alone and leaves the slots untouched', () => {
    const layout = initialLayout('phone');
    expect(layout.visible).toBe('chat');
    const opened = openPane(layout, 'terminal');
    expect(opened.visible).toBe('terminal');
    expect(opened.tabs).toEqual([]);
    expect(dock(opened, 'files', 'top').visible).toBe('files');
    expect(show(opened, 'chat').visible).toBe('chat');
    expect(closePane(opened, 'terminal').visible).toBe('chat');
  });

  it('folds the column away behind the chat when shrinking and opens the shown pane back', () => {
    const desktop = twoHalves();
    const phone = setMode(desktop, 'phone');
    expect(phone.visible).toBe('chat');
    expect(phone.slots).toBe(desktop.slots);
    const back = setMode(show(phone, 'git'), 'desktop');
    expect(back.visible).toBe('chat');
    expect(slotsOf(back)).toEqual({ top: 'git', bottom: 'diff', full: null });
    expect(back.tabs).toEqual(['terminal', 'diff', 'git']);
  });
});

describe('restoreDock', () => {
  it('rebuilds a saved column', () => {
    const before = resize(dock(twoHalves(), 'git', 'bottom'), 0.3);
    const { tabs, slots, size, positions } = before;
    const layout = restoreDock(initialLayout(), { tabs, slots, size, positions });
    expect(layout.tabs).toEqual(tabs);
    expect(layout.slots).toEqual(slots);
    expect(layout.size).toBe(0.3);
    expect(layout.positions).toEqual(positions);
  });

  it('drops what is not a pane, empties a slot that is not a tab, and keeps nothing over an empty save', () => {
    const start = initialLayout();
    const layout = restoreDock(start, {
      tabs: ['files', 'nope', 'diff', 'diff'],
      slots: { top: 'files', bottom: 'git', full: null },
      size: Number.NaN,
      positions: { files: 'top', git: 'bottom', diff: 'sideways' },
    });
    expect(layout.tabs).toEqual(['files', 'diff']);
    expect(layout.slots).toEqual({ ...empty, full: 'files' });
    expect(layout.size).toBe(0.5);
    expect(layout.positions).toEqual({ files: 'full' });
    expect(restoreDock(start, null)).toBe(start);
    expect(restoreDock(start, [])).toBe(start);
    expect(restoreDock(start, { tabs: [] })).toBe(start);
    expect(restoreDock(start, 'dock')).toBe(start);
  });

  it('empties the halves under a full pane and clamps the size', () => {
    const layout = restoreDock(initialLayout(), {
      tabs: ['files', 'diff'],
      slots: { top: 'files', bottom: 'diff', full: 'diff' },
      size: 5,
      positions: {},
    });
    expect(layout.slots).toEqual({ ...empty, full: 'diff' });
    expect(layout.size).toBe(0.9);
  });

  it("reads task 42's panels: their tabs, the first two active panes showing", () => {
    const layout = restoreDock(initialLayout(), [
      { tabs: ['files', 'editor'], active: 'editor', size: 0.5 },
      { tabs: ['terminal'], active: 'terminal', size: 0.5 },
    ]);
    expect(layout.tabs).toEqual(['files', 'editor', 'terminal']);
    expect(layout.slots).toEqual({ top: 'editor', bottom: 'terminal', full: null });
    const one = restoreDock(initialLayout(), [{ tabs: ['git'], active: 'git', size: 1 }]);
    expect(one.slots).toEqual({ ...empty, full: 'git' });
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
    expect(store.getState().tabs).toEqual(['diff']);
    unsubscribe();
    store.closePane('diff');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().tabs).toEqual([]);
  });
});

// Task 69: the tabs' status dots — a pane that is off screen keeps what arrived until it
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
    expect(marked.slots).toBe(layout.slots);
  });

  it('marks a parked tab, and once only', () => {
    const layout = dock(twoHalves(), 'terminal', 'full');
    const marked = markUnseen(layout, 'diff');
    expect([...marked.unseen]).toEqual(['diff']);
    expect(markUnseen(marked, 'diff')).toBe(marked);
  });

  it("clears on open, dock and the phone's show", () => {
    const marked = markUnseen(markUnseen(initialLayout(), 'diff'), 'browser');
    expect([...openPane(marked, 'diff').unseen]).toEqual(['browser']);
    expect([...dock(marked, 'diff', 'top').unseen]).toEqual(['browser']);
    const parked = markUnseen(dock(twoHalves(), 'terminal', 'full'), 'diff');
    expect([...dock(parked, 'diff', 'bottom').unseen]).toEqual([]);
    const phone = markUnseen(setMode(initialLayout(), 'phone'), 'diff');
    expect([...phone.unseen]).toEqual(['diff']);
    expect([...show(phone, 'diff').unseen]).toEqual([]);
    expect([...show(phone, 'chat').unseen]).toEqual(['diff']);
  });

  it('stays out of what the column saves', () => {
    const marked = markUnseen(initialLayout(), 'diff');
    expect(marked.tabs).toEqual([]);
    expect(marked.slots).toEqual(empty);
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

describe('positionOf', () => {
  it('names a showing pane and nothing for a parked or closed one', () => {
    const layout = twoHalves();
    expect(positionOf(layout, 'terminal')).toBe('top');
    expect(positionOf(layout, 'diff')).toBe('bottom');
    expect(positionOf(layout, 'git' as PaneId)).toBeNull();
    expect(positionOf(dock(layout, 'git', 'full'), 'terminal')).toBeNull();
  });
});
