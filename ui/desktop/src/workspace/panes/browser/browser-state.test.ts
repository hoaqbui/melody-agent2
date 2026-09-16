import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_PANE_STATES,
  createBrowserStore,
  frameLoaded,
  frameUnloaded,
  initialBrowser,
  isLoopbackHost,
  normalizeUrl,
  paneState,
  reset,
  submitted,
  typed,
  unreachableFromHere,
} from './browser-state';

const INVALID = 'Only http and https URLs open here';
const DEV = 'http://localhost:5173/';

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

    const rejected = submitted(typed(opened, 'ftp://x'), INVALID);
    expect(rejected.url).toBe(DEV);
    expect(rejected.draft).toBe('ftp://x');
    expect(rejected.error).toBe(INVALID);
  });

  it('keeps the frame settled when the same address is submitted again', () => {
    const settled = frameLoaded(submitted(typed(initialBrowser(''), DEV), INVALID));
    expect(submitted(settled, INVALID).loaded).toBe(true);
    expect(submitted(typed(settled, 'localhost:3000'), INVALID).loaded).toBe(false);
    expect(frameUnloaded(settled).loaded).toBe(false);
  });

  it('resets to the default and clears the error', () => {
    const start = initialBrowser('http://localhost:4000/');
    const moved = submitted(typed(start, 'ftp://x'), INVALID);
    expect(reset(moved)).toEqual(start);
    expect(reset(start)).toBe(start);
    const empty = submitted(typed(initialBrowser(''), DEV), INVALID);
    expect(reset(empty).url).toBe('');
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
});
