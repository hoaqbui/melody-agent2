// The Browser pane (PRD step 12): Back · Forward · Refresh · address bar · Share over the
// page. On the desktop the page is an Electron <webview> — the only frame that reports its
// URL, title, history and text for any origin; main.ts locks its guest down. The web build
// keeps an iframe: no history, no text, and a loopback address is not reachable from there.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Share, Square } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import { AppEvents } from '../../../constants/events';
import { usePaneContext } from '../../pane-context';
import {
  createBrowserStore,
  frameLoaded,
  frameUnloaded,
  loadFailed,
  navFlags,
  navigated,
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
  visited,
  writeHistory,
  type BrowserStore,
} from './browser-state';

const i18n = defineMessages({
  back: { id: 'browserPane.back', defaultMessage: 'Back' },
  forward: { id: 'browserPane.forward', defaultMessage: 'Forward' },
  refresh: { id: 'browserPane.refresh', defaultMessage: 'Refresh' },
  stop: { id: 'browserPane.stop', defaultMessage: 'Stop' },
  address: { id: 'browserPane.address', defaultMessage: 'Address' },
  suggestions: { id: 'browserPane.suggestions', defaultMessage: 'Recently opened' },
  share: { id: 'browserPane.share', defaultMessage: 'Share with agent' },
  shareUrlOnly: {
    id: 'browserPane.shareUrlOnly',
    defaultMessage: 'Share sends the address only from here',
  },
  noDevServer: {
    id: 'browserPane.noDevServer',
    defaultMessage: 'No dev server listed — enter a URL',
  },
  loading: { id: 'browserPane.loading', defaultMessage: 'Loading…' },
  invalidUrl: {
    id: 'browserPane.invalidUrl',
    defaultMessage: 'Only http and https URLs open here',
  },
  loadFailed: {
    id: 'browserPane.loadFailed',
    defaultMessage: '{cause} — Refresh to try again',
  },
  unreachable: {
    id: 'browserPane.unreachable',
    defaultMessage: '{url} is not reachable from here — it is localhost on {mac}',
  },
  frame: { id: 'browserPane.frame', defaultMessage: 'Browser' },
});

// No per-project config on the desktop names a dev server yet (the only `.goose` reader is
// recipes, src/recipe/recipe_management.ts), so the default is empty.
const DEFAULT_URL = '';

// The web shim's window.electron answers every key with a stub, so the shape cannot tell the
// builds apart; the user agent can.
const HAS_WEBVIEW = /\bElectron\//.test(window.navigator.userAgent);

// Chromium's code for a load the user or a newer navigation cancelled.
const ERR_ABORTED = -3;

// Cookies outlive a restart but never mix with the app's own `persist:goose` session.
const PARTITION = 'persist:workspace-browser';

// The part of Electron's WebviewTag the pane calls; src/workspace cannot import 'electron'
// (.dependency-cruiser.cjs renderer-runs-in-a-browser).
interface WebviewElement extends HTMLElement {
  getURL(): string;
  getTitle(): string;
  loadURL(url: string): Promise<void>;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  executeJavaScript(code: string): Promise<unknown>;
}

// One address and history per cwd, kept across promote and close (DESIGN.md Nothing Lost
// Rule); the history also lands in localStorage so it survives a restart.
const stores = new Map<string, BrowserStore>();

function storeFor(cwd: string): BrowserStore {
  let store = stores.get(cwd);
  if (!store) {
    const created = createBrowserStore(DEFAULT_URL, readHistory(window.localStorage, cwd));
    let written = created.getState().history;
    created.subscribe(() => {
      const { history } = created.getState();
      if (history !== written) {
        written = history;
        writeHistory(window.localStorage, cwd, history);
      }
    });
    stores.set(cwd, created);
    store = created;
  }
  return store;
}

function useBrowser(store: BrowserStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

// A same-origin iframe names its page; a cross-origin one throws, and the address stands in.
function iframeTitle(frame: HTMLIFrameElement | null): string {
  try {
    return frame?.contentDocument?.title ?? '';
  } catch {
    return '';
  }
}

export function BrowserPane() {
  const intl = useIntl();
  const { cwd } = usePaneContext();
  const store = storeFor(cwd);
  const browser = useBrowser(store);
  const pageHost = window.location.hostname;
  const state = paneState(browser, pageHost);
  // A rejected draft keeps what the frame showed (DESIGN.md Error: input and selection kept).
  const body = state === 'error' ? paneState({ ...browser, error: null }, pageHost) : state;
  const showFrame = body === 'loading' || body === 'ready';
  const suggestions = suggestionsFor(browser);
  const listOpen = browser.suggestionsOpen && suggestions.length > 0;
  const listId = useId();

  const webviewRef = useRef<WebviewElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Guest methods throw until `dom-ready`; a remount starts over.
  const guestReady = useRef(false);
  const guest = useCallback(() => (guestReady.current ? webviewRef.current : null), []);

  useEffect(() => {
    store.apply((current) => navFlags(frameUnloaded(current), false, false));
  }, [store]);

  useEffect(() => {
    const element = webviewRef.current;
    if (!HAS_WEBVIEW || !showFrame || !element) return;
    guestReady.current = false;
    const syncFlags = () =>
      store.apply((current) => navFlags(current, element.canGoBack(), element.canGoForward()));
    const record = (url: string) =>
      store.apply((current) => visited(current, url, element.getTitle(), Date.now()));
    const onDomReady = () => {
      guestReady.current = true;
      const wanted = store.getState().url;
      if (wanted !== element.getURL()) void element.loadURL(wanted);
    };
    const onStart = () => store.apply(frameUnloaded);
    const onStop = () => store.apply(frameLoaded);
    const onNavigate = (event: Event) => {
      const { url } = event as Event & { url: string };
      store.apply((current) => navigated(current, url, false));
      syncFlags();
      record(url);
    };
    const onNavigateInPage = (event: Event) => {
      const { url, isMainFrame } = event as Event & { url: string; isMainFrame: boolean };
      if (!isMainFrame) return;
      store.apply((current) => navigated(current, url, true));
      syncFlags();
      record(url);
    };
    const onTitle = (event: Event) => {
      const { title } = event as Event & { title: string };
      store.apply((current) => visited(titled(current, title), current.url, title, Date.now()));
    };
    const onFail = (event: Event) => {
      const { errorCode, errorDescription, isMainFrame } = event as Event & {
        errorCode: number;
        errorDescription: string;
        isMainFrame: boolean;
      };
      if (!isMainFrame || errorCode === ERR_ABORTED) return;
      const cause = intl.formatMessage(i18n.loadFailed, { cause: errorDescription });
      store.apply((current) => loadFailed(current, cause));
    };
    element.addEventListener('dom-ready', onDomReady);
    element.addEventListener('did-start-loading', onStart);
    element.addEventListener('did-stop-loading', onStop);
    element.addEventListener('did-navigate', onNavigate);
    element.addEventListener('did-navigate-in-page', onNavigateInPage);
    element.addEventListener('page-title-updated', onTitle);
    element.addEventListener('did-fail-load', onFail);
    // The guest is created when `src` is first parsed, with the partition read then; binding
    // `src` in JSX would reload the page on every navigation the bar follows. `allowpopups`
    // lets a `window.open` reach main.ts, which denies the window and loads the URL here.
    element.setAttribute('partition', PARTITION);
    element.setAttribute('allowpopups', '');
    element.setAttribute('src', store.getState().url);
    return () => {
      guestReady.current = false;
      element.removeEventListener('dom-ready', onDomReady);
      element.removeEventListener('did-start-loading', onStart);
      element.removeEventListener('did-stop-loading', onStop);
      element.removeEventListener('did-navigate', onNavigate);
      element.removeEventListener('did-navigate-in-page', onNavigateInPage);
      element.removeEventListener('page-title-updated', onTitle);
      element.removeEventListener('did-fail-load', onFail);
    };
  }, [intl, showFrame, store]);

  // The bar asked for an address the guest is not on: a submit or a suggestion.
  useEffect(() => {
    const element = guest();
    if (element && browser.url !== '' && element.getURL() !== browser.url) {
      void element.loadURL(browser.url);
    }
  }, [browser.url, guest]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    store.apply((current) => submitted(current, intl.formatMessage(i18n.invalidUrl)));
  };

  const onAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      store.apply((current) => suggestionMoved(current, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && browser.selectedSuggestion !== -1) {
      event.preventDefault();
      store.apply((current) => suggestionChosen(current, current.selectedSuggestion));
    } else if (event.key === 'Escape' && browser.suggestionsOpen) {
      event.preventDefault();
      store.apply(suggestionsClosed);
    }
  };

  const onRefresh = () => {
    const element = guest();
    if (element) {
      if (browser.loaded) element.reload();
      else element.stop();
      return;
    }
    if (iframeRef.current) {
      store.apply(frameUnloaded);
      iframeRef.current.src = browser.url;
    }
  };

  // Push, never pull: the page reaches the chat only through this click, and the text is in
  // the input for the user to read before ⌘Enter (AGENTS.md: sources are data).
  const onShare = async () => {
    const element = guest();
    const title = element ? element.getTitle() : iframeTitle(iframeRef.current);
    let text: string | null = null;
    if (element) {
      try {
        text = String((await element.executeJavaScript('document.body.innerText')) ?? '');
      } catch {
        text = '';
      }
    }
    window.dispatchEvent(
      new CustomEvent(AppEvents.INSERT_INPUT_TEXT, {
        detail: sharedPage(title, browser.url, text),
      })
    );
  };

  const stopping = HAS_WEBVIEW && showFrame && !browser.loaded;

  return (
    <div
      className="flex flex-col h-full min-h-0 text-sm"
      data-testid="browser-pane"
      data-state={state}
    >
      <form
        className="flex items-center gap-1 px-2 py-1 border-b border-border-primary text-xs"
        onSubmit={onSubmit}
      >
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!browser.canGoBack}
          title={intl.formatMessage(i18n.back)}
          data-testid="browser-back"
          onClick={() => guest()?.goBack()}
        >
          <ArrowLeft className="size-3.5" />
          <span className="sr-only">{intl.formatMessage(i18n.back)}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!browser.canGoForward}
          title={intl.formatMessage(i18n.forward)}
          data-testid="browser-forward"
          onClick={() => guest()?.goForward()}
        >
          <ArrowRight className="size-3.5" />
          <span className="sr-only">{intl.formatMessage(i18n.forward)}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!showFrame}
          title={intl.formatMessage(stopping ? i18n.stop : i18n.refresh)}
          data-testid="browser-refresh"
          data-action={stopping ? 'stop' : 'refresh'}
          onClick={onRefresh}
        >
          {stopping ? <Square className="size-3.5" /> : <RotateCw className="size-3.5" />}
          <span className="sr-only">{intl.formatMessage(stopping ? i18n.stop : i18n.refresh)}</span>
        </Button>
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-label={intl.formatMessage(i18n.address)}
            aria-invalid={browser.error !== null || undefined}
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-activedescendant={
              listOpen && browser.selectedSuggestion !== -1
                ? `${listId}-${browser.selectedSuggestion}`
                : undefined
            }
            className="w-full rounded border border-border-primary bg-background-primary px-2 py-0.5 text-text-primary outline-none focus:ring-1 focus:ring-ring-primary"
            value={browser.draft}
            placeholder="http://localhost:5173"
            data-testid="browser-address"
            onChange={(event) => store.apply((current) => typed(current, event.target.value))}
            onKeyDown={onAddressKeyDown}
            onFocus={() => store.apply(suggestionsOpened)}
            onBlur={() => store.apply(suggestionsClosed)}
          />
          {/* Into Rule: the list grows out of the address bar and closes back into it. */}
          <div
            className={`absolute inset-x-0 top-full z-10 grid transition-[grid-template-rows,visibility] duration-150 ease-out ${listOpen ? '' : 'invisible'}`}
            style={{ gridTemplateRows: listOpen ? '1fr' : '0fr' }}
            inert={!listOpen}
          >
            <ul
              id={listId}
              role="listbox"
              aria-label={intl.formatMessage(i18n.suggestions)}
              className="min-h-0 overflow-hidden rounded-b border border-t-0 border-border-primary bg-background-primary shadow-md"
              data-testid="browser-suggestions"
            >
              {suggestions.map((entry, index) => {
                const selected = index === browser.selectedSuggestion;
                return (
                  <li
                    key={entry.url}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={selected}
                    className={`flex flex-col gap-0.5 px-2 py-1 cursor-default ${selected ? 'bg-background-secondary' : ''}`}
                    data-testid="browser-suggestion"
                    data-url={entry.url}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => store.apply((current) => suggestionChosen(current, index))}
                  >
                    <span className="truncate text-text-primary">{entry.title || entry.url}</span>
                    {entry.title && (
                      <span className="truncate text-text-secondary">{entry.url}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!showFrame}
          title={intl.formatMessage(HAS_WEBVIEW ? i18n.share : i18n.shareUrlOnly)}
          data-testid="browser-share"
          onClick={() => void onShare()}
        >
          <Share className="size-3.5" />
          <span className="sr-only">{intl.formatMessage(i18n.share)}</span>
        </Button>
        {!HAS_WEBVIEW && (
          <span className="truncate text-text-secondary" data-testid="browser-share-note">
            {intl.formatMessage(i18n.shareUrlOnly)}
          </span>
        )}
      </form>

      {state === 'error' && (
        <p className="px-3 py-1 text-xs text-text-danger" role="alert">
          {browser.error}
        </p>
      )}
      {body === 'empty' && (
        <p className="p-3 text-text-secondary">{intl.formatMessage(i18n.noDevServer)}</p>
      )}
      {body === 'partial' && (
        <p
          className="p-3 text-text-secondary break-all"
          role="status"
          data-testid="browser-unreachable"
        >
          {intl.formatMessage(i18n.unreachable, { url: browser.url, mac: pageHost })}
        </p>
      )}
      {showFrame && (
        <div className="relative flex-1 min-h-0">
          {body === 'loading' && (
            <p
              className="absolute inset-x-0 top-0 px-3 py-1 text-xs text-text-secondary"
              aria-live="polite"
            >
              {intl.formatMessage(i18n.loading)}
            </p>
          )}
          {HAS_WEBVIEW ? (
            <webview
              ref={webviewRef}
              title={intl.formatMessage(i18n.frame)}
              className="h-full w-full bg-background-primary"
              data-testid="browser-frame"
            />
          ) : (
            <iframe
              ref={iframeRef}
              src={browser.url}
              title={intl.formatMessage(i18n.frame)}
              className="h-full w-full border-0 bg-background-primary"
              data-testid="browser-frame"
              onLoad={() => store.apply(frameLoaded)}
            />
          )}
        </div>
      )}
    </div>
  );
}
