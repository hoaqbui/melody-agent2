import { describe, expect, it } from 'vitest';
import type { PaneContextValue } from './pane-context';

describe('pane-context types', () => {
  it('PaneContextValue includes gitStatus', () => {
    const context: PaneContextValue = {
      cwd: '/test',
      mode: 'desktop',
      sessionId: 'session-1',
      messages: [],
      file: null,
      line: null,
      openFile: () => {},
      markUnseen: () => {},
      artifact: null,
      openArtifact: () => {},
      review: null,
      openReview: () => {},
      insertIntoChat: () => {},
      gitStatus: null,
      openPane: () => {},
      focusCommit: () => {},
    };
    expect(context.gitStatus).toBeNull();
  });

  it('gitStatus can hold a GitStatusResponse', () => {
    const context: PaneContextValue = {
      cwd: '/test',
      mode: 'desktop',
      sessionId: 'session-1',
      messages: [],
      file: null,
      line: null,
      openFile: () => {},
      markUnseen: () => {},
      artifact: null,
      openArtifact: () => {},
      review: null,
      openReview: () => {},
      insertIntoChat: () => {},
      gitStatus: {
        toplevel: '/repo',
        branch: 'main',
        upstream: 'origin/main',
        ahead: 1,
        behind: 0,
        entries: [],
      },
      openPane: () => {},
      focusCommit: () => {},
    };
    expect(context.gitStatus).not.toBeNull();
    expect(context.gitStatus?.branch).toBe('main');
  });
});
