/* global Notification, NotificationPermission */
import { useState, useEffect, useRef } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Check, ChevronDown, Copy, QrCode, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import UpdateSection from './UpdateSection';

import { COST_TRACKING_ENABLED, UPDATES_ENABLED } from '../../../updates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import ThemeSelector from '../../GooseSidebar/ThemeSelector';
import BlockLogoBlack from './icons/block-lockup_black.png';
import BlockLogoWhite from './icons/block-lockup_white.png';
import TelemetrySettings from './TelemetrySettings';
import { trackSettingToggled } from '../../../utils/analytics';
import { AppEvents } from '../../../constants/events';
import type { LanguageSetting, WorkspaceUi } from '../../../utils/settings';
import { qr, qrSvg } from '../../../utils/qr';

const i18n = defineMessages({
  appearanceTitle: { id: 'settings.appearance.title', defaultMessage: 'Appearance' },
  appearanceDesc: {
    id: 'settings.appearance.description',
    defaultMessage: 'Configure how goose appears on your system',
  },
  notifications: { id: 'settings.notifications.title', defaultMessage: 'Notifications' },
  notificationsDesc: {
    id: 'settings.notifications.description',
    defaultMessage: 'Notifications are managed by your OS - {link}',
  },
  configGuide: { id: 'settings.notifications.configGuide', defaultMessage: 'Configuration guide' },
  openSettings: { id: 'settings.notifications.openSettings', defaultMessage: 'Open Settings' },
  taskNotifications: {
    id: 'settings.notifications.task.title',
    defaultMessage: 'Task completion notifications',
  },
  taskNotificationsDesc: {
    id: 'settings.notifications.task.description',
    defaultMessage: 'Notify when Goose finishes a task while the window is in the background',
  },
  menuBarIcon: { id: 'settings.menuBarIcon.title', defaultMessage: 'Menu bar icon' },
  menuBarIconDesc: {
    id: 'settings.menuBarIcon.description',
    defaultMessage: 'Show goose in the menu bar',
  },
  dockIcon: { id: 'settings.dockIcon.title', defaultMessage: 'Dock icon' },
  dockIconDesc: { id: 'settings.dockIcon.description', defaultMessage: 'Show goose in the dock' },
  preventSleep: { id: 'settings.preventSleep.title', defaultMessage: 'Prevent Sleep' },
  preventSleepDesc: {
    id: 'settings.preventSleep.description',
    defaultMessage:
      'Keep your computer awake while goose is running a task (screen can still lock)',
  },
  costTracking: { id: 'settings.costTracking.title', defaultMessage: 'Cost Tracking' },
  costTrackingDesc: {
    id: 'settings.costTracking.description',
    defaultMessage: 'Show model pricing and usage costs',
  },
  themeTitle: { id: 'settings.theme.title', defaultMessage: 'Theme' },
  themeDesc: {
    id: 'settings.theme.description',
    defaultMessage: 'Customize the look and feel of goose',
  },
  workspaceTitle: { id: 'settings.workspace.title', defaultMessage: 'Workspace' },
  workspaceDesc: {
    id: 'settings.workspace.description',
    defaultMessage: 'Easy shows one lever; Advanced shows every control the session has',
  },
  advancedControls: {
    id: 'settings.workspace.advancedControls',
    defaultMessage: 'Advanced controls',
  },
  advancedControlsDesc: {
    id: 'settings.workspace.advancedControls.description',
    defaultMessage: 'Runtime, Mode and the Session controls in the chat card',
  },
  phoneTitle: { id: 'settings.phone.title', defaultMessage: 'Phone' },
  phoneDesc: {
    id: 'settings.phone.description',
    defaultMessage: 'Open goose on your phone over the tailnet — scan the code or copy the address',
  },
  phoneNoTailnet: {
    id: 'settings.phone.noTailnet',
    defaultMessage: 'No tailnet address — start Tailscale and relaunch goose',
  },
  phoneCopy: { id: 'settings.phone.copy', defaultMessage: 'Copy' },
  phoneCopied: { id: 'settings.phone.copied', defaultMessage: 'Copied' },
  phoneQr: { id: 'settings.phone.qr', defaultMessage: 'QR code for the phone address' },
  phonePort: { id: 'settings.phone.port', defaultMessage: 'Port' },
  phonePortDesc: {
    id: 'settings.phone.port.description',
    defaultMessage:
      'The address the phone bookmarks; 0 lets the system pick. Takes effect at the next launch',
  },
  phoneNotifications: {
    id: 'settings.phone.notifications',
    defaultMessage: 'Notifications on this phone',
  },
  phoneNotificationsDesc: {
    id: 'settings.phone.notifications.description',
    defaultMessage:
      'Ask the browser once to show a notification when work finishes; until then a finished session only gets a dot',
  },
  phoneNotificationsAllow: {
    id: 'settings.phone.notifications.allow',
    defaultMessage: 'Allow notifications',
  },
  phoneNotificationsAllowed: {
    id: 'settings.phone.notifications.allowed',
    defaultMessage: 'Allowed',
  },
  phoneNotificationsBlocked: {
    id: 'settings.phone.notifications.blocked',
    defaultMessage: 'Blocked in the browser — allow them in its site settings',
  },
  languageTitle: { id: 'settings.language.title', defaultMessage: 'Language' },
  languageDesc: {
    id: 'settings.language.description',
    defaultMessage: 'Choose the display language for goose',
  },
  languageSystem: { id: 'settings.language.systemDefault', defaultMessage: 'System Default' },
  languageEnglish: { id: 'settings.language.english', defaultMessage: 'English' },
  languageChineseSimplified: {
    id: 'settings.language.zhCN',
    defaultMessage: 'Chinese (Simplified)',
  },
  languageRussian: { id: 'settings.language.russian', defaultMessage: 'Russian' },
  languageTurkish: { id: 'settings.language.turkish', defaultMessage: 'Turkish' },
  languageHindi: { id: 'settings.language.hindi', defaultMessage: 'Hindi' },
  languageJapanese: { id: 'settings.language.japanese', defaultMessage: 'Japanese' },
  languageSpanish: { id: 'settings.language.spanish', defaultMessage: 'Spanish' },
  languageKorean: { id: 'settings.language.korean', defaultMessage: 'Korean' },
  languageFrench: { id: 'settings.language.french', defaultMessage: 'French' },
  languageGerman: { id: 'settings.language.german', defaultMessage: 'German' },
  languageItalian: { id: 'settings.language.italian', defaultMessage: 'Italian' },
  languagePortuguese: { id: 'settings.language.portuguese', defaultMessage: 'Portuguese' },
  languageIndonesian: { id: 'settings.language.indonesian', defaultMessage: 'Indonesian' },
  languageMalay: { id: 'settings.language.malay', defaultMessage: 'Malay' },
  languageVietnamese: { id: 'settings.language.vietnamese', defaultMessage: 'Vietnamese' },
  languageChineseTraditional: {
    id: 'settings.language.zhTW',
    defaultMessage: 'Chinese (Traditional)',
  },
  helpTitle: { id: 'settings.help.title', defaultMessage: 'Help & feedback' },
  helpDesc: {
    id: 'settings.help.description',
    defaultMessage: 'Help us improve goose by reporting issues or requesting new features',
  },
  reportBug: { id: 'settings.help.reportBug', defaultMessage: 'Report a Bug' },
  requestFeature: { id: 'settings.help.requestFeature', defaultMessage: 'Request a Feature' },
  versionTitle: { id: 'settings.version.title', defaultMessage: 'Version' },
  updatesTitle: { id: 'settings.updates.title', defaultMessage: 'Updates' },
  updatesDesc: {
    id: 'settings.updates.description',
    defaultMessage: 'Check for and install updates to keep goose running at its best',
  },
  notificationsModalTitle: {
    id: 'settings.notifications.modal.title',
    defaultMessage: 'How to Enable Notifications',
  },
  notificationsMacInstructions: {
    id: 'settings.notifications.modal.macInstructions',
    defaultMessage: 'To enable notifications on macOS:',
  },
  notificationsMacStep1: {
    id: 'settings.notifications.modal.macStep1',
    defaultMessage: 'Open System Preferences',
  },
  notificationsMacStep2: {
    id: 'settings.notifications.modal.macStep2',
    defaultMessage: 'Click on Notifications',
  },
  notificationsMacStep3: {
    id: 'settings.notifications.modal.macStep3',
    defaultMessage: 'Find and select goose in the application list',
  },
  notificationsMacStep4: {
    id: 'settings.notifications.modal.macStep4',
    defaultMessage: 'Enable notifications and adjust settings as desired',
  },
  notificationsWinInstructions: {
    id: 'settings.notifications.modal.winInstructions',
    defaultMessage: 'To enable notifications on Windows:',
  },
  notificationsWinStep1: {
    id: 'settings.notifications.modal.winStep1',
    defaultMessage: 'Open Settings',
  },
  notificationsWinStep2: {
    id: 'settings.notifications.modal.winStep2',
    defaultMessage: 'Go to System > Notifications',
  },
  notificationsWinStep3: {
    id: 'settings.notifications.modal.winStep3',
    defaultMessage: 'Find and select goose in the application list',
  },
  notificationsWinStep4: {
    id: 'settings.notifications.modal.winStep4',
    defaultMessage: 'Toggle notifications on and adjust settings as desired',
  },
  close: { id: 'settings.close', defaultMessage: 'Close' },
});

const LANGUAGE_OPTIONS: Array<{ value: LanguageSetting; message: keyof typeof i18n }> = [
  { value: 'system', message: 'languageSystem' },
  { value: 'en', message: 'languageEnglish' },
  { value: 'es', message: 'languageSpanish' },
  { value: 'fr', message: 'languageFrench' },
  { value: 'de', message: 'languageGerman' },
  { value: 'it', message: 'languageItalian' },
  { value: 'pt', message: 'languagePortuguese' },
  { value: 'id', message: 'languageIndonesian' },
  { value: 'ms', message: 'languageMalay' },
  { value: 'vi', message: 'languageVietnamese' },
  { value: 'hi', message: 'languageHindi' },
  { value: 'ja', message: 'languageJapanese' },
  { value: 'ko', message: 'languageKorean' },
  { value: 'ru', message: 'languageRussian' },
  { value: 'tr', message: 'languageTurkish' },
  { value: 'zh-CN', message: 'languageChineseSimplified' },
  { value: 'zh-TW', message: 'languageChineseTraditional' },
];

interface AppSettingsSectionProps {
  scrollToSection?: string;
}

// The phone's browser has to be asked for notifications; Electron never is (task 68).
const IS_WEB_BUILD = !/\bElectron\//.test(window.navigator.userAgent);

function browserNotificationPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
}

// Black on white whatever the theme: a scanner wants dark modules on a light ground.
function PhoneQr({ url, label }: { url: string; label: string }) {
  const { viewBox, path } = qrSvg(qr(url));
  return (
    <div className="relative shrink-0 rounded-md bg-white p-1" data-testid="settings-phone-qr">
      <svg
        viewBox={viewBox}
        width={160}
        height={160}
        shapeRendering="crispEdges"
        role="img"
        aria-label={label}
      >
        <path d={path} fill="#000" />
      </svg>
      <QrCode className="absolute right-1 bottom-1 h-3 w-3 text-black/40" aria-hidden />
    </div>
  );
}

export default function AppSettingsSection({ scrollToSection }: AppSettingsSectionProps) {
  const [menuBarIconEnabled, setMenuBarIconEnabled] = useState(true);
  const [dockIconEnabled, setDockIconEnabled] = useState(true);
  const [wakelockEnabled, setWakelockEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isDockSwitchDisabled, setIsDockSwitchDisabled] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showPricing, setShowPricing] = useState(true);
  const [language, setLanguage] = useState<LanguageSetting>('system');
  const [workspaceUi, setWorkspaceUi] = useState<WorkspaceUi>('easy');
  // undefined until read; null when the sidecar has no tailnet listener.
  const [phoneUrl, setPhoneUrl] = useState<string | null | undefined>();
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [phoneNotifications, setPhoneNotifications] = useState<NotificationPermission>(() =>
    IS_WEB_BUILD ? browserNotificationPermission() : 'default'
  );
  const [sidecarPort, setSidecarPort] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const updateSectionRef = useRef<HTMLDivElement>(null);
  const phoneSectionRef = useRef<HTMLDivElement>(null);
  const shouldShowUpdates = !window.appConfig.get('GOOSE_VERSION');

  useEffect(() => {
    setIsMacOS(window.electron.platform === 'darwin');
  }, []);

  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.electron.getSetting('showPricing').then(setShowPricing);
    window.electron.getSetting('language').then((value) => setLanguage(value ?? 'system'));
    window.electron.getSetting('workspace.ui').then((value) => setWorkspaceUi(value ?? 'easy'));
    window.electron.getSetting('sidecar.port').then((value) => setSidecarPort(String(value)));
    // Read on every mount: the key, and so the URL, changes with every launch.
    window.electron
      .getPhoneUrl()
      .then((url) => setPhoneUrl(url))
      .catch(() => setPhoneUrl(null));
  }, []);

  useEffect(() => {
    const target =
      scrollToSection === 'update'
        ? updateSectionRef.current
        : scrollToSection === 'phone'
          ? phoneSectionRef.current
          : null;
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [scrollToSection]);

  useEffect(() => {
    window.electron.getMenuBarIconState().then((enabled) => {
      setMenuBarIconEnabled(enabled);
    });

    window.electron.getWakelockState().then((enabled) => {
      setWakelockEnabled(enabled);
    });

    window.electron.getSetting('enableNotifications').then((enabled) => {
      setNotificationsEnabled(enabled ?? true);
    });

    if (isMacOS) {
      window.electron.getDockIconState().then((enabled) => {
        setDockIconEnabled(enabled);
      });
    }
  }, [isMacOS]);

  const handleMenuBarIconToggle = async () => {
    const newState = !menuBarIconEnabled;
    // If we're turning off the menu bar icon and the dock icon is hidden,
    // we need to show the dock icon to maintain accessibility
    if (!newState && !dockIconEnabled && isMacOS) {
      const success = await window.electron.setDockIcon(true);
      if (success) {
        setDockIconEnabled(true);
      }
    }
    const success = await window.electron.setMenuBarIcon(newState);
    if (success) {
      setMenuBarIconEnabled(newState);
      trackSettingToggled('menu_bar_icon', newState);
    }
  };

  const handleDockIconToggle = async () => {
    const newState = !dockIconEnabled;
    // If we're turning off the dock icon and the menu bar icon is hidden,
    // we need to show the menu bar icon to maintain accessibility
    if (!newState && !menuBarIconEnabled) {
      const success = await window.electron.setMenuBarIcon(true);
      if (success) {
        setMenuBarIconEnabled(true);
      }
    }

    // Disable the switch to prevent rapid toggling
    setIsDockSwitchDisabled(true);
    setTimeout(() => {
      setIsDockSwitchDisabled(false);
    }, 1000);

    // Set the dock icon state
    const success = await window.electron.setDockIcon(newState);
    if (success) {
      setDockIconEnabled(newState);
      trackSettingToggled('dock_icon', newState);
    }
  };

  const handleWakelockToggle = async () => {
    const newState = !wakelockEnabled;
    const success = await window.electron.setWakelock(newState);
    if (success) {
      setWakelockEnabled(newState);
      trackSettingToggled('prevent_sleep', newState);
    }
  };

  const handleNotificationsToggle = async (checked: boolean) => {
    setNotificationsEnabled(checked);
    await window.electron.setSetting('enableNotifications', checked);
    trackSettingToggled('task_notifications', checked);
  };

  const handleShowPricingToggle = async (checked: boolean) => {
    setShowPricing(checked);
    await window.electron.setSetting('showPricing', checked);
    trackSettingToggled('cost_tracking', checked);
    // Trigger event for other components
    window.dispatchEvent(new CustomEvent('showPricingChanged'));
  };

  // The workspace shell listens for the event and switches its face live (task 58).
  const handleAdvancedControlsToggle = async (checked: boolean) => {
    const next: WorkspaceUi = checked ? 'advanced' : 'easy';
    setWorkspaceUi(next);
    await window.electron.setSetting('workspace.ui', next);
    window.dispatchEvent(new CustomEvent(AppEvents.WORKSPACE_UI_CHANGED, { detail: next }));
  };

  const handlePhoneCopy = async () => {
    if (!phoneUrl) return;
    await navigator.clipboard.writeText(phoneUrl);
    setPhoneCopied(true);
    setTimeout(() => setPhoneCopied(false), 1500);
  };

  const handlePhoneNotifications = async () => {
    await window.electron.requestNotificationPermission();
    setPhoneNotifications(browserNotificationPermission());
  };

  // Anything but a port in range reverts, as the main process would on read.
  const handleSidecarPortBlur = async () => {
    const value = Number(sidecarPort);
    const previous = await window.electron.getSetting('sidecar.port');
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      setSidecarPort(String(previous));
      return;
    }
    if (value !== previous) {
      await window.electron.setSetting('sidecar.port', value);
    }
  };

  const handleLanguageChange = async (value: string) => {
    const nextLanguage = LANGUAGE_OPTIONS.find((option) => option.value === value)?.value;
    if (!nextLanguage || nextLanguage === language) {
      return;
    }

    setLanguage(nextLanguage);
    try {
      await window.electron.setSetting('language', nextLanguage);
      window.electron.reloadApp();
    } catch (error) {
      console.error('Failed to update language setting:', error);
      setLanguage(language);
    }
  };

  const intl = useIntl();
  const selectedLanguage =
    LANGUAGE_OPTIONS.find((option) => option.value === language) ?? LANGUAGE_OPTIONS[0];

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1">
      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="">{intl.formatMessage(i18n.appearanceTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.appearanceDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-primary text-xs">
                {intl.formatMessage(i18n.notifications)}
              </h3>
              <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                {intl.formatMessage(i18n.notificationsDesc, {
                  link: (
                    <span
                      className="underline hover:cursor-pointer"
                      onClick={() => setShowNotificationModal(true)}
                    >
                      {intl.formatMessage(i18n.configGuide)}
                    </span>
                  ),
                })}
              </p>
            </div>
            <div className="flex items-center">
              <Button
                className="flex items-center gap-2 justify-center"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await window.electron.openNotificationsSettings();
                  } catch (error) {
                    console.error('Failed to open notification settings:', error);
                  }
                }}
              >
                <Settings />
                {intl.formatMessage(i18n.openSettings)}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-primary text-xs">
                {intl.formatMessage(i18n.taskNotifications)}
              </h3>
              <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                {intl.formatMessage(i18n.taskNotificationsDesc)}
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsToggle}
                variant="mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-primary text-xs">{intl.formatMessage(i18n.menuBarIcon)}</h3>
              <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                {intl.formatMessage(i18n.menuBarIconDesc)}
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={menuBarIconEnabled}
                onCheckedChange={handleMenuBarIconToggle}
                variant="mono"
              />
            </div>
          </div>

          {isMacOS && (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-text-primary text-xs">{intl.formatMessage(i18n.dockIcon)}</h3>
                <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                  {intl.formatMessage(i18n.dockIconDesc)}
                </p>
              </div>
              <div className="flex items-center">
                <Switch
                  disabled={isDockSwitchDisabled}
                  checked={dockIconEnabled}
                  onCheckedChange={handleDockIconToggle}
                  variant="mono"
                />
              </div>
            </div>
          )}

          {/* Prevent Sleep */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-primary text-xs">{intl.formatMessage(i18n.preventSleep)}</h3>
              <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                {intl.formatMessage(i18n.preventSleepDesc)}
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={wakelockEnabled}
                onCheckedChange={handleWakelockToggle}
                variant="mono"
              />
            </div>
          </div>

          {/* Cost Tracking */}
          {COST_TRACKING_ENABLED && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-text-primary">{intl.formatMessage(i18n.costTracking)}</h3>
                <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                  {intl.formatMessage(i18n.costTrackingDesc)}
                </p>
              </div>
              <div className="flex items-center">
                <Switch
                  checked={showPricing}
                  onCheckedChange={handleShowPricingToggle}
                  variant="mono"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="mb-1">{intl.formatMessage(i18n.workspaceTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.workspaceDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-text-primary text-xs">
                {intl.formatMessage(i18n.advancedControls)}
              </h3>
              <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                {intl.formatMessage(i18n.advancedControlsDesc)}
              </p>
            </div>
            <div className="flex items-center">
              <Switch
                checked={workspaceUi === 'advanced'}
                onCheckedChange={handleAdvancedControlsToggle}
                variant="mono"
                data-testid="settings-advanced-controls"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div ref={phoneSectionRef}>
        <Card className="rounded-lg" data-testid="settings-phone">
          <CardHeader className="pb-0">
            <CardTitle className="mb-1">{intl.formatMessage(i18n.phoneTitle)}</CardTitle>
            <CardDescription>{intl.formatMessage(i18n.phoneDesc)}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-4 space-y-4">
            {phoneUrl === null && (
              <p className="text-xs text-text-secondary" data-testid="settings-phone-url">
                {intl.formatMessage(i18n.phoneNoTailnet)}
              </p>
            )}
            {phoneUrl && (
              <div className="flex flex-wrap items-start gap-4">
                <PhoneQr url={phoneUrl} label={intl.formatMessage(i18n.phoneQr)} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p
                    className="text-xs text-text-primary break-all select-all"
                    data-testid="settings-phone-url"
                  >
                    {phoneUrl}
                  </p>
                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={handlePhoneCopy}
                      data-testid="settings-phone-copy"
                    >
                      {phoneCopied ? <Check /> : <Copy />}
                      {intl.formatMessage(phoneCopied ? i18n.phoneCopied : i18n.phoneCopy)}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {IS_WEB_BUILD && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-text-primary text-xs">
                    {intl.formatMessage(i18n.phoneNotifications)}
                  </h3>
                  <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                    {intl.formatMessage(
                      phoneNotifications === 'denied'
                        ? i18n.phoneNotificationsBlocked
                        : i18n.phoneNotificationsDesc
                    )}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={handlePhoneNotifications}
                  disabled={phoneNotifications !== 'default'}
                  data-testid="settings-phone-notifications"
                >
                  {phoneNotifications === 'granted' && <Check />}
                  {intl.formatMessage(
                    phoneNotifications === 'granted'
                      ? i18n.phoneNotificationsAllowed
                      : i18n.phoneNotificationsAllow
                  )}
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-text-primary text-xs">{intl.formatMessage(i18n.phonePort)}</h3>
                <p className="text-xs text-text-secondary max-w-md mt-[2px]">
                  {intl.formatMessage(i18n.phonePortDesc)}
                </p>
              </div>
              <Input
                type="number"
                min={0}
                max={65535}
                step={1}
                className="w-24 h-8"
                value={sidecarPort}
                onChange={(event) => setSidecarPort(event.target.value)}
                onBlur={handleSidecarPortBlur}
                aria-label={intl.formatMessage(i18n.phonePort)}
                data-testid="settings-phone-port"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="mb-1">{intl.formatMessage(i18n.themeTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.themeDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <ThemeSelector className="w-auto" hideTitle horizontal />
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="mb-1">{intl.formatMessage(i18n.languageTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.languageDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full max-w-[260px] items-center justify-between gap-2 rounded-md border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary transition-colors hover:border-border-primary">
              <span className="truncate">{intl.formatMessage(i18n[selectedLanguage.message])}</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[260px]">
              <DropdownMenuRadioGroup value={language} onValueChange={handleLanguageChange}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {intl.formatMessage(i18n[option.message])}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
      <TelemetrySettings />

      <Card className="rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="mb-1">{intl.formatMessage(i18n.helpTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.helpDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 px-4">
          <div className="flex space-x-4">
            <Button
              onClick={() => {
                window.open(
                  'https://github.com/aaif-goose/goose/issues/new?template=bug_report.md',
                  '_blank'
                );
              }}
              variant="secondary"
              size="sm"
            >
              {intl.formatMessage(i18n.reportBug)}
            </Button>
            <Button
              onClick={() => {
                window.open(
                  'https://github.com/aaif-goose/goose/issues/new?template=feature_request.md',
                  '_blank'
                );
              }}
              variant="secondary"
              size="sm"
            >
              {intl.formatMessage(i18n.requestFeature)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Version Section - only show if GOOSE_VERSION is set */}
      {!shouldShowUpdates && (
        <Card className="rounded-lg">
          <CardHeader className="pb-0">
            <CardTitle className="mb-1">{intl.formatMessage(i18n.versionTitle)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 px-4">
            <div className="flex items-center gap-3">
              <img
                src={isDarkMode ? BlockLogoWhite : BlockLogoBlack}
                alt="Block Logo" // TODO: replace with AAIF logo asset
                className="h-8 w-auto"
              />
              <span className="text-2xl font-mono text-black dark:text-white">
                {String(window.appConfig.get('GOOSE_VERSION') || 'Development')}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update Section - only show if GOOSE_VERSION is NOT set */}
      {UPDATES_ENABLED && shouldShowUpdates && (
        <div ref={updateSectionRef}>
          <Card className="rounded-lg">
            <CardHeader className="pb-0">
              <CardTitle className="mb-1">{intl.formatMessage(i18n.updatesTitle)}</CardTitle>
              <CardDescription>{intl.formatMessage(i18n.updatesDesc)}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <UpdateSection />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notification Instructions Modal */}
      <Dialog
        open={showNotificationModal}
        onOpenChange={(open) => !open && setShowNotificationModal(false)}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="text-iconStandard" size={24} />
              {intl.formatMessage(i18n.notificationsModalTitle)}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {/* OS-specific instructions */}
            {isMacOS ? (
              <div className="space-y-4">
                <p>{intl.formatMessage(i18n.notificationsMacInstructions)}</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>{intl.formatMessage(i18n.notificationsMacStep1)}</li>
                  <li>{intl.formatMessage(i18n.notificationsMacStep2)}</li>
                  <li>{intl.formatMessage(i18n.notificationsMacStep3)}</li>
                  <li>{intl.formatMessage(i18n.notificationsMacStep4)}</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-4">
                <p>{intl.formatMessage(i18n.notificationsWinInstructions)}</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>{intl.formatMessage(i18n.notificationsWinStep1)}</li>
                  <li>{intl.formatMessage(i18n.notificationsWinStep2)}</li>
                  <li>{intl.formatMessage(i18n.notificationsWinStep3)}</li>
                  <li>{intl.formatMessage(i18n.notificationsWinStep4)}</li>
                </ol>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotificationModal(false)}>
              {intl.formatMessage(i18n.close)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
