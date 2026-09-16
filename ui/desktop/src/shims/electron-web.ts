import { defaultSettings, type SettingKey, type Settings } from '../utils/settings';
import type { OpenExternalUrlResult } from '../utils/urlSecurity';

type ElectronApi = typeof window.electron;
type IpcListener = Parameters<ElectronApi['on']>[1];
type IpcEvent = Parameters<IpcListener>[0];

const SETTINGS_STORAGE_KEY = 'goose.settings';

function readSettings(): Partial<Settings> {
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
}

function writeSettings(settings: Partial<Settings>): void {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

async function fetchConfig(): Promise<Record<string, unknown>> {
  const response = await fetch('./config');
  if (!response.ok) {
    throw new Error(`sidecar /config answered ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function clientPlatform(): string {
  const ua = window.navigator.userAgent;
  if (/Windows/.test(ua)) return 'win32';
  if (/Mac|iPhone|iPad/.test(ua)) return 'darwin';
  return 'linux';
}

const listeners = new Map<string, Set<IpcListener>>();
const ipcEvent = {} as IpcEvent;

// getConfig and appConfig.get are synchronous in the preload contract, so the fetch has to
// finish before the renderer, the next import of the web entry, evaluates.
const config = await fetchConfig();

const implemented: Partial<ElectronApi> = {
  platform: clientPlatform(),
  getConfig: () => config,
  logInfo: (txt) => console.info(txt),
  getAcpUrl: async () =>
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/acp`,
  getSetting: async <K extends SettingKey>(key: K): Promise<Settings[K]> =>
    ({ ...defaultSettings, ...readSettings() })[key],
  setSetting: async <K extends SettingKey>(key: K, value: Settings[K]): Promise<void> =>
    writeSettings({ ...readSettings(), [key]: value }),
  on: (channel, callback) => {
    const set = listeners.get(channel) ?? new Set();
    set.add(callback);
    listeners.set(channel, set);
  },
  off: (channel, callback) => {
    listeners.get(channel)?.delete(callback);
  },
  emit: (channel, ...args) => {
    listeners.get(channel)?.forEach((callback) => callback(ipcEvent, ...args));
  },
  // window.open returns null whenever noopener is set, so a popup block is not observable here.
  openExternal: async (url): Promise<OpenExternalUrlResult> => {
    window.open(url, '_blank', 'noopener');
    return 'opened';
  },
};

// Every other preload method is Electron-only; its first call is logged so a component that
// needs it is found in the console, not by a thrown TypeError. Most of them return a promise
// the caller chains on, so the stub resolves to nothing rather than returning nothing.
const warned = new Set<string>();
const electronWeb = new Proxy(implemented, {
  get(target, key: string) {
    if (key in target) {
      return target[key as keyof ElectronApi];
    }
    return (): Promise<undefined> => {
      if (!warned.has(key)) {
        warned.add(key);
        console.warn(`window.electron.${key} is not available in the web build`);
      }
      return Promise.resolve(undefined);
    };
  },
}) as ElectronApi;

window.electron = electronWeb;
window.appConfig = {
  get: (key) => config[key],
  getAll: () => ({ ...config }),
};
