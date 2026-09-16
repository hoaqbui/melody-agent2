// The Browser pane (PRD step 12): an address bar over an iframe of the project's dev server.
// Any http(s) URL opens; Reset returns to the default. index.html's CSP already allows the
// frame (`frame-src 'self' https: http:`).

import { useEffect, useSyncExternalStore, type FormEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import { usePaneContext } from '../../pane-context';
import {
  createBrowserStore,
  frameLoaded,
  frameUnloaded,
  paneState,
  reset,
  submitted,
  typed,
  type BrowserStore,
} from './browser-state';

const i18n = defineMessages({
  address: { id: 'browserPane.address', defaultMessage: 'Address' },
  go: { id: 'browserPane.go', defaultMessage: 'Go' },
  reset: { id: 'browserPane.reset', defaultMessage: 'Reset' },
  noDevServer: {
    id: 'browserPane.noDevServer',
    defaultMessage: 'No dev server listed — enter a URL',
  },
  loading: { id: 'browserPane.loading', defaultMessage: 'Loading…' },
  invalidUrl: {
    id: 'browserPane.invalidUrl',
    defaultMessage: 'Only http and https URLs open here',
  },
  unreachable: {
    id: 'browserPane.unreachable',
    defaultMessage: '{url} is not reachable from here — it is localhost on {mac}',
  },
  frame: { id: 'browserPane.frame', defaultMessage: 'Browser' },
});

// No per-project config on the desktop names a dev server yet (the only `.goose` reader is
// recipes, src/recipe/recipe_management.ts), so the default is empty and Reset clears.
const DEFAULT_URL = '';

// One address per cwd, kept across promote and close (DESIGN.md Nothing Lost Rule).
const stores = new Map<string, BrowserStore>();

function storeFor(cwd: string): BrowserStore {
  let store = stores.get(cwd);
  if (!store) {
    store = createBrowserStore(DEFAULT_URL);
    stores.set(cwd, store);
  }
  return store;
}

function useBrowser(store: BrowserStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
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

  useEffect(() => {
    store.apply(frameUnloaded);
  }, [store]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    store.apply((current) => submitted(current, intl.formatMessage(i18n.invalidUrl)));
  };

  const atDefault = browser.url === browser.defaultUrl && browser.draft === browser.defaultUrl;

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
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-label={intl.formatMessage(i18n.address)}
          aria-invalid={browser.error !== null || undefined}
          className="min-w-0 flex-1 rounded border border-border-primary bg-background-primary px-2 py-0.5 text-text-primary outline-none focus:ring-1 focus:ring-ring-primary"
          value={browser.draft}
          placeholder="http://localhost:5173"
          data-testid="browser-address"
          onChange={(event) => store.apply((current) => typed(current, event.target.value))}
        />
        <Button type="submit" variant="outline" size="xs" data-testid="browser-go">
          {intl.formatMessage(i18n.go)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={atDefault && browser.error === null}
          title={intl.formatMessage(i18n.reset)}
          data-testid="browser-reset"
          onClick={() => store.apply(reset)}
        >
          <RotateCcw className="size-3.5" />
          <span className="sr-only">{intl.formatMessage(i18n.reset)}</span>
        </Button>
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
      {(body === 'loading' || body === 'ready') && (
        <div className="relative flex-1 min-h-0">
          {body === 'loading' && (
            <p
              className="absolute inset-x-0 top-0 px-3 py-1 text-xs text-text-secondary"
              aria-live="polite"
            >
              {intl.formatMessage(i18n.loading)}
            </p>
          )}
          <iframe
            key={browser.url}
            src={browser.url}
            title={intl.formatMessage(i18n.frame)}
            className="h-full w-full border-0 bg-background-primary"
            data-testid="browser-frame"
            onLoad={() => store.apply(frameLoaded)}
          />
        </div>
      )}
    </div>
  );
}
