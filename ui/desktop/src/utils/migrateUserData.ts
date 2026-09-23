import fs from 'node:fs';
import path from 'node:path';
import log from './logger';

const CACHES_TO_SKIP = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
]);

function shouldSkipFile(file: string): boolean {
  if (file.startsWith('Singleton')) {
    return true;
  }
  if (CACHES_TO_SKIP.has(file)) {
    return true;
  }
  return false;
}

export function migrateUserData(
  appData: string,
  from: string,
  to: string
): 'copied' | 'skipped' | 'failed' {
  try {
    const fromPath = path.join(appData, from);
    const toPath = path.join(appData, to);

    const fromSettingsFile = path.join(fromPath, 'settings.json');
    const toSettingsFile = path.join(toPath, 'settings.json');

    if (!fs.existsSync(fromSettingsFile)) {
      log.info(`[migrateUserData] Source not found: ${fromPath}`);
      return 'skipped';
    }

    if (fs.existsSync(toSettingsFile)) {
      log.info(`[migrateUserData] Target already exists: ${toPath}`);
      return 'skipped';
    }

    fs.cpSync(fromPath, toPath, {
      recursive: true,
      force: false,
      filter: (src: string, _dest: string) => {
        const basename = path.basename(src);
        if (shouldSkipFile(basename)) {
          log.debug(`[migrateUserData] Skipping: ${basename}`);
          return false;
        }
        return true;
      },
    });

    log.info(`[migrateUserData] Successfully copied ${fromPath} to ${toPath}`);
    return 'copied';
  } catch (error) {
    log.error(`[migrateUserData] Migration failed: ${error}`);
    return 'failed';
  }
}
