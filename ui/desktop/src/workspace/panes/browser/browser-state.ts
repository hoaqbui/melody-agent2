// What the Browser pane keeps without React (PRD step 12): the address the frame shows, the
// bar's draft, whether the frame has settled, and the pane's DESIGN.md state. The state lives
// outside the component so a promote or close keeps the address (DESIGN.md Nothing Lost Rule).

// The subset of DESIGN.md §Shared component states the pane reports, plus `ready` for a
// frame that has settled.
export const BROWSER_PANE_STATES = ['empty', 'loading', 'partial', 'error', 'ready'] as const;

export type BrowserPaneState = (typeof BROWSER_PANE_STATES)[number];

export interface BrowserState {
  // The project's dev server; '' while no config lists one, so Reset returns to empty.
  defaultUrl: string;
  // What the frame shows; '' is the empty state.
  url: string;
  draft: string;
  // A cross-origin frame reports only that it settled, not what it settled on; the
  // browser's own error page counts as loaded.
  loaded: boolean;
  // Why the draft did not open; the draft is kept so it can be corrected.
  error: string | null;
}

export function initialBrowser(defaultUrl: string): BrowserState {
  return { defaultUrl, url: defaultUrl, draft: defaultUrl, loaded: false, error: null };
}

// A bare `host:port` is what a dev server prints, so the scheme is optional — `localhost:5173`
// would otherwise parse as a `localhost:` scheme, hence the `//` test; anything that is not
// http(s) stays out (PRD §Scope: the dev server, not a browser).
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// `URL.hostname` keeps the brackets on an IPv6 literal.
export function isLoopbackHost(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower === '127.0.0.1' ||
    lower === '[::1]' ||
    lower === '::1'
  );
}

// The web build on the phone reaches the Mac by its tailnet name; a loopback address there
// is the phone, not the Mac (PRD step 13). Electron's page is `file:` (no host) or the Vite
// server, both local.
export function unreachableFromHere(pageHost: string, url: string): boolean {
  if (pageHost === '' || isLoopbackHost(pageHost)) return false;
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function typed(state: BrowserState, draft: string): BrowserState {
  return draft === state.draft ? state : { ...state, draft };
}

export function submitted(state: BrowserState, invalidMessage: string): BrowserState {
  const url = normalizeUrl(state.draft);
  if (url === null) return { ...state, error: invalidMessage };
  return { ...state, url, draft: url, loaded: url === state.url && state.loaded, error: null };
}

export function reset(state: BrowserState): BrowserState {
  if (state.url === state.defaultUrl && state.draft === state.defaultUrl && state.error === null) {
    return state;
  }
  return { ...state, url: state.defaultUrl, draft: state.defaultUrl, loaded: false, error: null };
}

export function frameLoaded(state: BrowserState): BrowserState {
  return state.loaded ? state : { ...state, loaded: true };
}

// The frame dies with the pane on a tab switch and loads again on the next mount.
export function frameUnloaded(state: BrowserState): BrowserState {
  return state.loaded ? { ...state, loaded: false } : state;
}

export function paneState(state: BrowserState, pageHost: string): BrowserPaneState {
  if (state.error !== null) return 'error';
  if (state.url === '') return 'empty';
  if (unreachableFromHere(pageHost, state.url)) return 'partial';
  return state.loaded ? 'ready' : 'loading';
}

export interface BrowserStore {
  getState(): BrowserState;
  subscribe(listener: () => void): () => void;
  apply(update: (state: BrowserState) => BrowserState): void;
}

export function createBrowserStore(defaultUrl: string): BrowserStore {
  let state = initialBrowser(defaultUrl);
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply: (update) => {
      const next = update(state);
      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}
