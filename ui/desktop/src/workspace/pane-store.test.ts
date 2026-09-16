import { describe, expect, it, vi } from 'vitest';
import {
  closeCentre,
  createPaneStore,
  initialLayout,
  modeForWidth,
  openCentre,
  PANE_IDS,
  selectSide,
  setMode,
  show,
  sideTabs,
} from './pane-store';

describe('pane-store on the desktop', () => {
  it('starts as chat alone with every pane in the side panel', () => {
    const layout = initialLayout();
    expect(layout.centre).toBeNull();
    expect(sideTabs(layout)).toEqual(PANE_IDS);
    expect(layout.activeSide).toBe('files');
  });

  it('promotes a pane beside the chat and drops it from the side tabs', () => {
    const layout = openCentre(initialLayout(), 'diff');
    expect(layout.centre).toBe('diff');
    expect(sideTabs(layout)).toEqual(['files', 'editor', 'terminal', 'git']);
  });

  it('returns the first centre pane to its original tab slot when a second opens', () => {
    const layout = openCentre(openCentre(initialLayout(), 'diff'), 'terminal');
    expect(layout.centre).toBe('terminal');
    expect(sideTabs(layout)).toEqual(['files', 'editor', 'diff', 'git']);
    expect(layout.activeSide).toBe('files');
  });

  it('makes a closed centre pane the active side tab', () => {
    const layout = closeCentre(openCentre(initialLayout(), 'git'));
    expect(layout.centre).toBeNull();
    expect(layout.activeSide).toBe('git');
    expect(sideTabs(layout)).toEqual(PANE_IDS);
  });

  it('moves the active tab to a neighbour when that pane goes to the centre', () => {
    const fromMiddle = openCentre(selectSide(initialLayout(), 'diff'), 'diff');
    expect(fromMiddle.activeSide).toBe('terminal');
    const fromEnd = openCentre(selectSide(initialLayout(), 'git'), 'git');
    expect(fromEnd.activeSide).toBe('terminal');
  });

  it('ignores selecting the tab that is already active or in the centre', () => {
    const layout = openCentre(initialLayout(), 'diff');
    expect(selectSide(layout, 'diff')).toBe(layout);
    expect(selectSide(layout, 'files')).toBe(layout);
    expect(openCentre(layout, 'diff')).toBe(layout);
  });
});

describe('pane-store on the phone', () => {
  it('splits below 768 px', () => {
    expect(modeForWidth(767)).toBe('phone');
    expect(modeForWidth(768)).toBe('desktop');
  });

  it('never splits: opening a pane shows it alone, chat first by default', () => {
    const layout = initialLayout('phone');
    expect(layout.visible).toBe('chat');
    const opened = openCentre(layout, 'terminal');
    expect(opened.centre).toBeNull();
    expect(opened.visible).toBe('terminal');
    expect(selectSide(opened, 'files').visible).toBe('files');
    expect(show(opened, 'chat').visible).toBe('chat');
  });

  it('carries the centre pane across a resize and back to the side panel', () => {
    const desktop = openCentre(initialLayout(), 'editor');
    const phone = setMode(desktop, 'phone');
    expect(phone.centre).toBeNull();
    expect(phone.visible).toBe('editor');
    const back = setMode(phone, 'desktop');
    expect(back.centre).toBeNull();
    expect(back.activeSide).toBe('editor');
    expect(back.visible).toBe('chat');
  });
});

describe('createPaneStore', () => {
  it('notifies once per change and not on no-ops', () => {
    const store = createPaneStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.openCentre('diff');
    store.openCentre('diff');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().centre).toBe('diff');
    unsubscribe();
    store.closeCentre();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().centre).toBeNull();
  });
});
