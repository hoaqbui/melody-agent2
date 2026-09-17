import { describe, expect, it, vi } from 'vitest';
import {
  closePane,
  createPaneStore,
  dock,
  initialLayout,
  markUnseen,
  modeForWidth,
  openPane,
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

// terminal opened first, then diff: terminal in the top half, diff in the bottom.
function twoHalves(): PaneLayout {
  return openPane(openPane(initialLayout(), 'terminal'), 'diff');
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

  it('opens a second pane in the bottom half and moves the full one up', () => {
    const layout = twoHalves();
    expect(layout.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(layout)).toEqual({ top: 'terminal', bottom: 'diff', full: null });
    expect(layout.positions).toEqual({ terminal: 'top', diff: 'bottom' });
  });

  it('opens a third pane in the bottom half and parks the one there, still open', () => {
    const layout = openPane(twoHalves(), 'git');
    expect(layout.tabs).toEqual(['terminal', 'diff', 'git']);
    expect(slotsOf(layout)).toEqual({ top: 'terminal', bottom: 'git', full: null });
    expect(positionOf(layout, 'diff')).toBeNull();
    expect(paneVisible(layout, 'diff')).toBe(false);
  });

  it('opens a pane already showing as a no-op', () => {
    const layout = twoHalves();
    expect(openPane(layout, 'terminal')).toBe(layout);
    expect(openPane(layout, 'diff')).toBe(layout);
  });

  it('docks a pane full and keeps the other as a tab', () => {
    const layout = dock(twoHalves(), 'diff', 'full');
    expect(layout.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(layout)).toEqual({ ...empty, full: 'diff' });
    expect(layout.positions).toEqual({ terminal: 'top', diff: 'full' });
    expect(dock(layout, 'diff', 'full')).toBe(layout);
  });

  it('brings a parked tab back into the half it last showed in', () => {
    const parked = dock(twoHalves(), 'diff', 'full');
    const back = openPane(parked, 'terminal');
    expect(slotsOf(back)).toEqual({ top: 'terminal', bottom: 'diff', full: null });
    const parkedBottom = dock(twoHalves(), 'terminal', 'full');
    expect(slotsOf(openPane(parkedBottom, 'diff'))).toEqual({
      top: 'terminal',
      bottom: 'diff',
      full: null,
    });
  });

  it('docks a full pane into a half and fills the other half from the tabs', () => {
    const parked = dock(twoHalves(), 'diff', 'full');
    const top = dock(parked, 'diff', 'top');
    expect(slotsOf(top)).toEqual({ top: 'diff', bottom: 'terminal', full: null });
    const bottom = dock(parked, 'diff', 'bottom');
    expect(slotsOf(bottom)).toEqual({ top: 'terminal', bottom: 'diff', full: null });
  });

  it('keeps a lone pane full whichever half it is docked to', () => {
    const lone = openPane(initialLayout(), 'files');
    expect(dock(lone, 'files', 'top')).toBe(lone);
    expect(dock(lone, 'files', 'bottom')).toBe(lone);
  });

  it('swaps the halves when a pane is docked to the other one', () => {
    const layout = dock(twoHalves(), 'diff', 'top');
    expect(slotsOf(layout)).toEqual({ top: 'diff', bottom: 'terminal', full: null });
    expect(layout.positions).toEqual({ terminal: 'bottom', diff: 'top' });
    expect(dock(layout, 'diff', 'top')).toBe(layout);
  });

  it('docks a parked tab into a taken half and parks what was there', () => {
    const layout = dock(openPane(twoHalves(), 'git'), 'diff', 'top');
    expect(slotsOf(layout)).toEqual({ top: 'diff', bottom: 'git', full: null });
    expect(layout.tabs).toEqual(['terminal', 'diff', 'git']);
    expect(layout.positions.terminal).toBe('top');
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

  it('closes a half and the other takes the column; closes a parked tab in place', () => {
    const layout = openPane(twoHalves(), 'git');
    const closedBottom = closePane(layout, 'git');
    expect(closedBottom.tabs).toEqual(['terminal', 'diff']);
    expect(slotsOf(closedBottom)).toEqual({ ...empty, full: 'terminal' });
    expect(closedBottom.positions).toEqual({ terminal: 'top', diff: 'bottom' });
    const closedParked = closePane(layout, 'diff');
    expect(closedParked.tabs).toEqual(['terminal', 'git']);
    expect(slotsOf(closedParked)).toEqual(slotsOf(layout));
    expect(closePane(layout, 'files')).toBe(layout);
    expect(slotsOf(closePane(closePane(closedBottom, 'terminal'), 'diff'))).toEqual(empty);
  });

  it('opens the next pane in the bottom half after a close left one full', () => {
    const layout = openPane(closePane(twoHalves(), 'terminal'), 'files');
    expect(slotsOf(layout)).toEqual({ top: 'diff', bottom: 'files', full: null });
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
    expect(slotsOf(back)).toEqual({ top: 'terminal', bottom: 'git', full: null });
    expect(back.tabs).toEqual(['terminal', 'diff', 'git']);
  });
});

describe('restoreDock', () => {
  it('rebuilds a saved column', () => {
    const before = resize(openPane(twoHalves(), 'git'), 0.3);
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
