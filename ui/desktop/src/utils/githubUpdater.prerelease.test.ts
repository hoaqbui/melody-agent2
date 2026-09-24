import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubUpdater, selectLatestRelease } from './githubUpdater';

vi.mock('electron', () => ({ app: { getVersion: () => '0.9.0-alpha.1' } }));
vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch')!;

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
  Object.defineProperty(process, 'arch', originalArch);
  vi.unstubAllGlobals();
});

describe('selectLatestRelease', () => {
  function release(tag_name: string, draft = false, prerelease = true) {
    return { tag_name, name: tag_name, published_at: '', html_url: '', draft, prerelease, assets: [] };
  }

  it('takes the highest semver from a prerelease-only release list', () => {
    const older = release('v0.9.0-alpha.1');
    const newer = release('v0.9.0-alpha.2');

    expect(selectLatestRelease([older, newer])).toBe(newer);
    expect(selectLatestRelease([newer, older])).toBe(newer);
  });

  it('skips drafts', () => {
    const draft = release('v0.9.0-alpha.9', true);
    const published = release('v0.9.0-alpha.2');

    expect(selectLatestRelease([draft, published])).toBe(published);
  });
});

describe('GitHubUpdater offers the highest prerelease', () => {
  it('offers 0.9.0-alpha.2 over the installed 0.9.0-alpha.1 from a prerelease-only release list', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });

    const releases = [
      {
        tag_name: 'v0.9.0-alpha.1',
        name: 'Melody 0.9.0-alpha.1',
        published_at: '2026-09-01T00:00:00Z',
        html_url: 'https://example.invalid/releases/v0.9.0-alpha.1',
        draft: false,
        prerelease: true,
        assets: [
          {
            name: 'Melody-linux-x64.zip',
            browser_download_url: 'https://example.invalid/v0.9.0-alpha.1/Melody-linux-x64.zip',
            size: 100,
          },
        ],
      },
      {
        tag_name: 'v0.9.0-alpha.2',
        name: 'Melody 0.9.0-alpha.2',
        published_at: '2026-09-02T00:00:00Z',
        html_url: 'https://example.invalid/releases/v0.9.0-alpha.2',
        draft: false,
        prerelease: true,
        assets: [
          {
            name: 'Melody-linux-x64.zip',
            browser_download_url: 'https://example.invalid/v0.9.0-alpha.2/Melody-linux-x64.zip',
            size: 100,
          },
        ],
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'https://api.github.com/repos/hoaqbui/melody-agent2/releases') {
          return new Response(JSON.stringify(releases));
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const result = await new GitHubUpdater().checkForUpdates();

    expect(result).toMatchObject({
      updateAvailable: true,
      latestVersion: '0.9.0-alpha.2',
      downloadUrl: 'https://example.invalid/v0.9.0-alpha.2/Melody-linux-x64.zip',
    });
  });
});
