import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_PANE_STATES,
  HISTORY_CAP,
  SHARE_TEXT_CAP,
  SUGGESTION_LIMIT,
  createBrowserStore,
  frameLoaded,
  frameUnloaded,
  historyKey,
  initialBrowser,
  isLoopbackHost,
  loadFailed,
  navFlags,
  navigated,
  normalizeUrl,
  paneState,
  readHistory,
  sharedPage,
  submitted,
  suggestionChosen,
  suggestionMoved,
  suggestionsClosed,
  suggestionsFor,
  suggestionsOpened,
  titled,
  typed,
  unreachableFromHere,
  visited,
  writeHistory,
} from './browser-state';

const INVALID = 'Only http and https URLs open here';
const DEV = 'http://localhost:5173/';
const HEALTH = 'http://127.0.0.1:4000/health';
const CONFIG = 'http://127.0.0.1:4000/config';

describe('address', () => {
  it('accepts http(s) and adds the scheme a dev server omits', () => {
    expect(normalizeUrl('localhost:5173')).toBe(DEV);
    expect(normalizeUrl(' https://app.example/path?x=1 ')).toBe('https://app.example/path?x=1');
    expect(normalizeUrl('127.0.0.1:3000')).toBe('http://127.0.0.1:3000/');
  });

  it('rejects anything that is not a web address', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('http://')).toBeNull();
  });

  it('knows loopback by every spelling', () => {
    for (const host of ['localhost', 'LOCALHOST', 'app.localhost', '127.0.0.1', '[::1]']) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    expect(isLoopbackHost('mac.tailnet.ts.net')).toBe(false);
    expect(isLoopbackHost('example.com')).toBe(false);
  });

  it('is unreachable only from a remote page to a loopback address', () => {
    expect(unreachableFromHere('mac.tailnet.ts.net', DEV)).toBe(true);
    expect(unreachableFromHere('mac.tailnet.ts.net', 'http://mac.tailnet.ts.net:5173/')).toBe(
      false
    );
    expect(unreachableFromHere('', DEV)).toBe(false);
    expect(unreachableFromHere('localhost', DEV)).toBe(false);
    expect(unreachableFromHere('127.0.0.1', DEV)).toBe(false);
    expect(unreachableFromHere('mac.tailnet.ts.net', 'not a url')).toBe(false);
  });
});

describe('browser state', () => {
  it('opens a typed address and keeps a rejected draft with its cause', () => {
    const opened = submitted(typed(initialBrowser(''), 'localhost:5173'), INVALID);
    expect(opened.url).toBe(DEV);
    expect(opened.draft).toBe(DEV);
    expect(opened.error).toBeNull();
    expect(opened.loaded).toBe(false);
    expect(opened.suggestionsOpen).toBe(false);

    const rejected = submitted(typed(opened, 'ftp://x'), INVALID);
    expect(rejected.url).toBe(DEV);
    expect(rejected.draft).toBe('ftp://x');
    expect(rejected.error).toBe(INVALID);
    expect(rejected.suggestionsOpen).toBe(false);
  });

  it('keeps the frame settled when the same address is submitted again', () => {
    const settled = frameLoaded(submitted(typed(initialBrowser(''), DEV), INVALID));
    expect(submitted(settled, INVALID).loaded).toBe(true);
    expect(submitted(typed(settled, 'localhost:3000'), INVALID).loaded).toBe(false);
    expect(frameUnloaded(settled).loaded).toBe(false);
  });

  it('follows the guest: the bar shows the live URL, the title arrives later', () => {
    const start = frameLoaded(titled(submitted(typed(initialBrowser(''), HEALTH), INVALID), 'H'));
    const moved = navigated(start, CONFIG, false);
    expect(moved.url).toBe(CONFIG);
    expect(moved.draft).toBe(CONFIG);
    expect(moved.title).toBe('');
    expect(moved.loaded).toBe(false);
    const inPage = navigated(start, `${HEALTH}#x`, true);
    expect(inPage.draft).toBe(`${HEALTH}#x`);
    expect(inPage.title).toBe('H');
    expect(inPage.loaded).toBe(true);
    expect(titled(moved, 'C').title).toBe('C');
    expect(titled(moved, '')).toBe(moved);
  });

  it('carries the guest history flags and a failed load with its cause', () => {
    const start = initialBrowser('');
    expect(navFlags(start, false, false)).toBe(start);
    const flagged = navFlags(start, true, false);
    expect(flagged.canGoBack).toBe(true);
    expect(flagged.canGoForward).toBe(false);
    const failed = loadFailed(submitted(typed(start, HEALTH), INVALID), 'ERR_CONNECTION_REFUSED');
    expect(failed.error).toBe('ERR_CONNECTION_REFUSED');
    expect(failed.loaded).toBe(true);
    expect(paneState(failed, '')).toBe('error');
  });
});

describe('history', () => {
  const at = (n: number) => 1_000 + n;

  it('keeps the latest visit first, one entry per URL, capped', () => {
    let state = visited(initialBrowser(''), HEALTH, '', at(1));
    state = visited(state, CONFIG, 'Config', at(2));
    state = visited(state, HEALTH, 'Health', at(3));
    expect(state.history).toEqual([
      { url: HEALTH, title: 'Health', lastVisited: at(3) },
      { url: CONFIG, title: 'Config', lastVisited: at(2) },
    ]);
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      state = visited(state, `http://h/${i}`, '', at(10 + i));
    }
    expect(state.history).toHaveLength(HISTORY_CAP);
    expect(state.history[0].url).toBe(`http://h/${HISTORY_CAP + 4}`);
  });

  it('suggests by substring on the URL or the title, most recent first', () => {
    let state = visited(initialBrowser(''), HEALTH, '', at(1));
    state = visited(state, CONFIG, 'Settings', at(2));
    expect(suggestionsFor(typed(state, 'hea')).map((entry) => entry.url)).toEqual([HEALTH]);
    expect(suggestionsFor(typed(state, 'SETT')).map((entry) => entry.url)).toEqual([CONFIG]);
    expect(suggestionsFor(typed(state, '')).map((entry) => entry.url)).toEqual([CONFIG, HEALTH]);
    expect(suggestionsFor(typed(state, 'nope'))).toEqual([]);
    for (let i = 0; i < SUGGESTION_LIMIT + 3; i++) {
      state = visited(state, `http://h/${i}`, '', at(10 + i));
    }
    expect(suggestionsFor(typed(state, 'h/'))).toHaveLength(SUGGESTION_LIMIT);
  });

  it('opens on typing, walks with the arrows, loads the chosen row, closes on Esc', () => {
    let state = visited(initialBrowser(''), HEALTH, '', at(1));
    state = visited(state, CONFIG, '', at(2));
    expect(state.suggestionsOpen).toBe(false);
    state = typed(state, 'h');
    expect(state.suggestionsOpen).toBe(true);
    expect(state.selectedSuggestion).toBe(-1);
    expect(suggestionMoved(state, -1).selectedSuggestion).toBe(1);
    state = suggestionMoved(state, 1);
    expect(state.selectedSuggestion).toBe(0);
    state = suggestionMoved(state, 1);
    expect(state.selectedSuggestion).toBe(1);
    expect(suggestionMoved(state, 1).selectedSuggestion).toBe(0);
    const chosen = suggestionChosen(state, state.selectedSuggestion);
    expect(chosen.url).toBe(HEALTH);
    expect(chosen.draft).toBe(HEALTH);
    expect(chosen.suggestionsOpen).toBe(false);
    expect(suggestionChosen(state, 9)).toBe(state);
    const closed = suggestionsClosed(state);
    expect(closed.suggestionsOpen).toBe(false);
    expect(closed.selectedSuggestion).toBe(-1);
    expect(suggestionsClosed(closed)).toBe(closed);
    expect(suggestionsOpened(closed).suggestionsOpen).toBe(true);
    expect(suggestionMoved(typed(initialBrowser(''), 'x'), 1).selectedSuggestion).toBe(-1);
  });

  it('lives under one goose.* key per project and survives a bad value', () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
    };
    const entries = [{ url: HEALTH, title: 'Health', lastVisited: at(1) }];
    writeHistory(storage, '/proj', entries);
    expect(backing.has(historyKey('/proj'))).toBe(true);
    expect(historyKey('/proj')).not.toBe(historyKey('/other'));
    expect(readHistory(storage, '/proj')).toEqual(entries);
    expect(readHistory(storage, '/other')).toEqual([]);
    backing.set(historyKey('/bad'), '{not json');
    expect(readHistory(storage, '/bad')).toEqual([]);
    backing.set(historyKey('/mixed'), JSON.stringify([...entries, { url: 1 }, null]));
    expect(readHistory(storage, '/mixed')).toEqual(entries);
  });
});

describe('share with agent', () => {
  it('prefixes Page:, falls back to the URL as title, and cuts long text', () => {
    expect(sharedPage('Health', HEALTH, 'ok')).toBe(`Page: Health\n${HEALTH}\n\nok`);
    expect(sharedPage('  ', HEALTH, ' ok \n')).toBe(`Page: ${HEALTH}\n${HEALTH}\n\nok`);
    expect(sharedPage('', HEALTH, null)).toBe(`Page: ${HEALTH}\n${HEALTH}`);
    const long = sharedPage('T', HEALTH, 'x'.repeat(SHARE_TEXT_CAP + 1));
    expect(long.endsWith('…[truncated]')).toBe(true);
    expect(long).toContain('x'.repeat(SHARE_TEXT_CAP));
    expect(long).not.toContain('x'.repeat(SHARE_TEXT_CAP + 1));
    expect(sharedPage('T', HEALTH, 'x'.repeat(SHARE_TEXT_CAP))).not.toContain('[truncated]');
  });
});

describe('pane state', () => {
  it('declares only states from DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(__dirname, '../../../../../../DESIGN.md'), 'utf8');
    const table = design.split('## Shared component states')[1].split('\n## ')[0];
    const named = [...table.matchAll(/^\| (\w+) \|/gm)].map((match) => match[1].toLowerCase());
    expect(named).toContain('empty');
    for (const state of BROWSER_PANE_STATES) {
      if (state !== 'ready') expect(named).toContain(state);
    }
  });

  it('follows the PRD lines for the Browser', () => {
    const empty = initialBrowser('');
    expect(paneState(empty, '')).toBe('empty');
    const opened = submitted(typed(empty, DEV), INVALID);
    expect(paneState(opened, '')).toBe('loading');
    expect(paneState(frameLoaded(opened), '')).toBe('ready');
    expect(paneState(frameLoaded(opened), 'mac.tailnet.ts.net')).toBe('partial');
    expect(paneState(submitted(typed(opened, 'ftp://x'), INVALID), '')).toBe('error');
  });
});

describe('browser store', () => {
  it('notifies only on change', () => {
    const store = createBrowserStore('');
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply((state) => typed(state, 'a'));
    store.apply((state) => typed(state, 'a'));
    store.apply(frameUnloaded);
    expect(store.getState().draft).toBe('a');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('starts from the history it is given', () => {
    const entries = [{ url: HEALTH, title: '', lastVisited: 1 }];
    expect(createBrowserStore('', entries).getState().history).toBe(entries);
  });
});
