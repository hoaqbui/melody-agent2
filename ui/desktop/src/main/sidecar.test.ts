import { describe, expect, it } from 'vitest';

import { gooseHttpOrigin, sidecarEntryPath } from './sidecar';

describe('gooseHttpOrigin', () => {
  it('drops the token and path from the goose serve ACP URL', () => {
    expect(gooseHttpOrigin('wss://127.0.0.1:52301/acp?token=s3cret')).toBe(
      'https://127.0.0.1:52301'
    );
    expect(gooseHttpOrigin('ws://127.0.0.1:3284/acp?token=s3cret')).toBe('http://127.0.0.1:3284');
  });
});

describe('sidecarEntryPath', () => {
  it('reads the workspace build in development and the bundled resource when packaged', () => {
    expect(sidecarEntryPath(false, '/repo/ui/desktop', '/unused')).toBe(
      '/repo/ui/sidecar/dist/index.js'
    );
    expect(
      sidecarEntryPath(true, '/App/Contents/Resources/app.asar', '/App/Contents/Resources')
    ).toBe('/App/Contents/Resources/sidecar/index.mjs');
  });
});
