/* global Notification */
import { defaultSettings, type SettingKey, type Settings } from '../utils/settings';
import type { OpenExternalUrlResult } from '../utils/urlSecurity';

type ElectronApi = typeof window.electron;
type IpcListener = Parameters<ElectronApi['on']>[1];
type IpcEvent = Parameters<IpcListener>[0];

const SETTINGS_STORAGE_KEY = 'goose.settings';
const SIDECAR_KEY_STORAGE_KEY = 'goose.sidecarKey';

// The desktop's URL carries the per-launch sidecar key once; it is kept for the next
// visit and taken off the address bar so a screenshot or a shared tab does not carry it.
function readSidecarKey(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('key');
  if (fromUrl) {
    window.localStorage.setItem(SIDECAR_KEY_STORAGE_KEY, fromUrl);
    url.searchParams.delete('key');
    window.history.replaceState(null, '', url);
    return fromUrl;
  }
  return window.localStorage.getItem(SIDECAR_KEY_STORAGE_KEY) ?? '';
}

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

function emit(channel: string, ...args: unknown[]): void {
  listeners.get(channel)?.forEach((callback) => callback(ipcEvent, ...args));
}

const sidecarKey = readSidecarKey();

// getConfig and appConfig.get are synchronous in the preload contract, so the fetch has to
// finish before the renderer, the next import of the web entry, evaluates.
const config = await fetchConfig();

const implemented: Partial<ElectronApi> = {
  platform: clientPlatform(),
  getConfig: () => config,
  logInfo: (txt) => console.info(txt),
  // Here ACP goes through the sidecar's proxy, so its upgrade carries the key like any other.
  getAcpUrl: async () =>
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/acp?key=${sidecarKey}`,
  getSidecarUrl: async () => `${window.location.origin}/?key=${sidecarKey}`,
  getPhoneUrl: async () => `${window.location.origin}/?key=${sidecarKey}`,
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
  emit,
  isAnyWindowFocused: async () => document.hasFocus(),
  // The browser's Notification, only once Settings › App asked and the user allowed it —
  // never on load. A click brings the tab forward and opens the route as Electron's does.
  showNotification: ({ title, body, route }) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const notification = new Notification(title, { body });
    notification.onclick = () => {
      window.focus();
      if (route) emit('notification-click', route);
    };
  },
  requestNotificationPermission: async () => {
    if (typeof Notification === 'undefined') return false;
    return (await Notification.requestPermission()) === 'granted';
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
