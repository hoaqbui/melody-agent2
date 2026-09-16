// What the Browser pane keeps without React (PRD step 12): the address the frame shows, the
// bar's draft, whether the frame has settled, the guest's navigation flags, the per-project
// history behind the address bar's suggestions, and the pane's DESIGN.md state. The state
// lives outside the component so a promote or close keeps the address (DESIGN.md Nothing
// Lost Rule).

// The subset of DESIGN.md §Shared component states the pane reports, plus `ready` for a
// frame that has settled.
export const BROWSER_PANE_STATES = ['empty', 'loading', 'partial', 'error', 'ready'] as const;

export type BrowserPaneState = (typeof BROWSER_PANE_STATES)[number];

export interface HistoryEntry {
  url: string;
  title: string;
  lastVisited: number;
}

export const HISTORY_CAP = 200;

// Enough rows to pick from without covering the page.
export const SUGGESTION_LIMIT = 8;

export interface BrowserState {
  // The project's dev server; '' while no config lists one.
  defaultUrl: string;
  // What the frame shows; '' is the empty state.
  url: string;
  draft: string;
  // A cross-origin frame reports only that it settled, not what it settled on; the
  // browser's own error page counts as loaded.
  loaded: boolean;
  // Why the draft did not open, or why the page did not load; the draft is kept so it can
  // be corrected.
  error: string | null;
  // The guest's title and history flags; only the desktop's webview reports them.
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  // Most recent first, capped at HISTORY_CAP.
  history: HistoryEntry[];
  // The suggestion list under the address bar; -1 is no row selected.
  suggestionsOpen: boolean;
  selectedSuggestion: number;
}

export function initialBrowser(defaultUrl: string, history: HistoryEntry[] = []): BrowserState {
  return {
    defaultUrl,
    url: defaultUrl,
    draft: defaultUrl,
    loaded: false,
    error: null,
    title: '',
    canGoBack: false,
    canGoForward: false,
    history,
    suggestionsOpen: false,
    selectedSuggestion: -1,
  };
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

// Typing reopens the list with no row selected, so Enter still loads the draft as typed.
export function typed(state: BrowserState, draft: string): BrowserState {
  if (draft === state.draft && state.suggestionsOpen && state.selectedSuggestion === -1) {
    return state;
  }
  return { ...state, draft, suggestionsOpen: true, selectedSuggestion: -1 };
}

export function submitted(state: BrowserState, invalidMessage: string): BrowserState {
  const url = normalizeUrl(state.draft);
  if (url === null) {
    return { ...state, error: invalidMessage, suggestionsOpen: false, selectedSuggestion: -1 };
  }
  return {
    ...state,
    url,
    draft: url,
    loaded: url === state.url && state.loaded,
    error: null,
    suggestionsOpen: false,
    selectedSuggestion: -1,
  };
}

// The guest committed a navigation — one the user made inside the page or one the bar asked
// for — and the bar follows it. An in-page navigation (hash, pushState) keeps the title and
// the load state.
export function navigated(state: BrowserState, url: string, inPage: boolean): BrowserState {
  const next = { ...state, url, draft: url, error: null };
  return inPage ? next : { ...next, title: '', loaded: false };
}

export function titled(state: BrowserState, title: string): BrowserState {
  return title === state.title ? state : { ...state, title };
}

export function navFlags(
  state: BrowserState,
  canGoBack: boolean,
  canGoForward: boolean
): BrowserState {
  if (canGoBack === state.canGoBack && canGoForward === state.canGoForward) return state;
  return { ...state, canGoBack, canGoForward };
}

export function frameLoaded(state: BrowserState): BrowserState {
  return state.loaded ? state : { ...state, loaded: true };
}

// The frame dies with the pane on a tab switch and loads again on the next mount.
export function frameUnloaded(state: BrowserState): BrowserState {
  return state.loaded ? { ...state, loaded: false } : state;
}

// The browser's own error page is what the frame shows, so the load counts as settled.
export function loadFailed(state: BrowserState, cause: string): BrowserState {
  return { ...state, loaded: true, error: cause };
}

// A visit moves its entry to the front; a later title for the same page replaces the earlier
// one, which is how a page titled after `did-navigate` ends up named.
export function visited(
  state: BrowserState,
  url: string,
  title: string,
  lastVisited: number
): BrowserState {
  const rest = state.history.filter((entry) => entry.url !== url);
  const history = [{ url, title, lastVisited }, ...rest].slice(0, HISTORY_CAP);
  return { ...state, history };
}

// Substring on the URL or the title, case-insensitive; the empty draft matches everything,
// so an empty bar offers the most recent pages.
export function suggestionsFor(state: BrowserState): HistoryEntry[] {
  const needle = state.draft.trim().toLowerCase();
  return state.history
    .filter(
      (entry) =>
        entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle)
    )
    .slice(0, SUGGESTION_LIMIT);
}

export function suggestionsOpened(state: BrowserState): BrowserState {
  return state.suggestionsOpen ? state : { ...state, suggestionsOpen: true };
}

export function suggestionsClosed(state: BrowserState): BrowserState {
  if (!state.suggestionsOpen && state.selectedSuggestion === -1) return state;
  return { ...state, suggestionsOpen: false, selectedSuggestion: -1 };
}

// Arrow keys wrap through the rows; the draft is what Enter loads until a row is selected.
export function suggestionMoved(state: BrowserState, delta: 1 | -1): BrowserState {
  const count = suggestionsFor(state).length;
  if (count === 0) return state;
  const from = state.selectedSuggestion;
  const to = from === -1 ? (delta === 1 ? 0 : count - 1) : (from + delta + count) % count;
  return { ...state, suggestionsOpen: true, selectedSuggestion: to };
}

// A chosen row's URL is already normalized, so the submit cannot reject it.
export function suggestionChosen(state: BrowserState, index: number): BrowserState {
  const entry = suggestionsFor(state)[index];
  if (!entry) return state;
  return submitted({ ...state, draft: entry.url }, '');
}

// What Share with agent puts in the chat input. `Page:` is the prefix the orchestrator role
// recognises; the text is the page's innerText, cut so one share cannot fill the context;
// null text is the web build, which cannot read a cross-origin frame.
export const SHARE_TEXT_CAP = 8000;

export function sharedPage(title: string, url: string, text: string | null): string {
  const head = `Page: ${title.trim() || url}\n${url}`;
  if (text === null) return head;
  const body = text.trim();
  const cut = body.length > SHARE_TEXT_CAP ? `${body.slice(0, SHARE_TEXT_CAP)}…[truncated]` : body;
  return `${head}\n\n${cut}`;
}

export function paneState(state: BrowserState, pageHost: string): BrowserPaneState {
  if (state.error !== null) return 'error';
  if (state.url === '') return 'empty';
  if (unreachableFromHere(pageHost, state.url)) return 'partial';
  return state.loaded ? 'ready' : 'loading';
}

// Task 19's settings pattern: one `goose.*` key per concern with JSON inside; the project's
// cwd is part of the key so two projects never share a list.
export function historyKey(cwd: string): string {
  return `goose.browserHistory:${cwd}`;
}

function isHistoryEntry(entry: unknown): entry is HistoryEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const { url, title, lastVisited } = entry as Record<string, unknown>;
  return typeof url === 'string' && typeof title === 'string' && typeof lastVisited === 'number';
}

// localStorage's two calls, so a test can hand in a Map.
export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readHistory(storage: HistoryStorage, cwd: string): HistoryEntry[] {
  try {
    const raw = storage.getItem(historyKey(cwd));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry).slice(0, HISTORY_CAP) : [];
  } catch {
    return [];
  }
}

export function writeHistory(storage: HistoryStorage, cwd: string, history: HistoryEntry[]): void {
  try {
    storage.setItem(historyKey(cwd), JSON.stringify(history));
  } catch {
    // Quota or a private window: the list is a convenience, the page still loads.
  }
}

export interface BrowserStore {
  getState(): BrowserState;
  subscribe(listener: () => void): () => void;
  apply(update: (state: BrowserState) => BrowserState): void;
}

export function createBrowserStore(defaultUrl: string, history: HistoryEntry[] = []): BrowserStore {
  let state = initialBrowser(defaultUrl, history);
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
