import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../sessions';
import type { ExtensionConfig } from '../types/extensions';
import type { Session } from '../types/session';
import type { FixedExtensionEntry } from '../components/ConfigContext';
import type { GooseExtension, GooseExtensionEntry } from '@aaif/goose-acp-client';
import { getConfiguredGooseExtensions } from '../acp/extensions';
import { acpChatSessionController } from '../acp/chatSessionController';
import { beginConfiguredRecipeParameterScope } from '../acp/recipeParamRequests';
import { getAcpFeatureCapabilities } from '../acp/capabilities';
import { addWorktree } from '../workspace/worktree';

vi.mock('../acp/extensions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../acp/extensions')>();
  return {
    ...actual,
    getConfiguredGooseExtensions: vi.fn(),
  };
});

vi.mock('../acp/chatSessionController', () => ({
  acpChatSessionController: {
    createSession: vi.fn(),
  },
}));

vi.mock('../acp/recipeParamRequests', () => ({
  beginConfiguredRecipeParameterScope: vi.fn(),
}));

vi.mock('../acp/recipe', () => ({
  decodeRecipe: vi.fn(async () => testRecipe),
}));

vi.mock('../recipe', () => ({
  scanRecipe: vi.fn(async () => ({ has_security_warnings: false })),
}));

vi.mock('../recipe/recipe_management', () => ({
  listSavedRecipes: vi.fn(async () => [{ id: 'recipe-1', recipe: testRecipe }]),
}));

vi.mock('../recipe/consent', () => ({
  requestRecipeConsent: vi.fn(async () => true),
}));

vi.mock('../acp/capabilities', () => ({
  getAcpFeatureCapabilities: vi.fn(),
}));

const testRecipe = vi.hoisted(() => ({ title: 'Test recipe', description: 'Recipe used in tests' }));

vi.mock('../workspace/worktree', () => ({
  addWorktree: vi.fn(),
}));

const testSession: Session = {
  id: 'session-1',
  name: 'untitled',
  message_count: 0,
  created_at: '2026-06-19T00:00:00.000Z',
  updated_at: '2026-06-19T00:00:00.000Z',
  working_dir: '/tmp',
  extension_data: { active: [], installed: [] },
};

const extensionConfig = (name: string): ExtensionConfig => ({
  name,
  type: 'builtin',
  description: `${name} extension`,
});

const configuredExtension = (name: string, enabled: boolean): FixedExtensionEntry => ({
  ...extensionConfig(name),
  enabled,
});

const gooseExtension = (name: string): GooseExtension => ({
  type: 'builtin',
  name,
  description: `${name} extension`,
});

const gooseExtensionEntry = (name: string): GooseExtensionEntry => ({
  extension: gooseExtension(name),
  enabled: true,
});

const mockedGetConfiguredGooseExtensions = vi.mocked(getConfiguredGooseExtensions);
const mockedCreateAcpSession = vi.mocked(acpChatSessionController.createSession);
const mockedBeginConfiguredRecipeParameterScope = vi.mocked(beginConfiguredRecipeParameterScope);
const mockedGetAcpFeatureCapabilities = vi.mocked(getAcpFeatureCapabilities);
const mockedAddWorktree = vi.mocked(addWorktree);
const finishConfiguredRecipeParameterScope = vi.fn();

describe('createSession ACP session extensions', () => {
  beforeEach(() => {
    Object.assign(window.electron, {
      hasAcceptedRecipeBefore: vi.fn(async () => true),
      recordRecipeHash: vi.fn(async () => true),
    });
    mockedGetConfiguredGooseExtensions.mockReset();
    mockedGetConfiguredGooseExtensions.mockResolvedValue([
      gooseExtensionEntry('developer'),
      gooseExtensionEntry('memory'),
    ]);
    mockedCreateAcpSession.mockReset();
    mockedCreateAcpSession.mockResolvedValue(testSession);
    finishConfiguredRecipeParameterScope.mockReset();
    mockedBeginConfiguredRecipeParameterScope.mockReset();
    mockedBeginConfiguredRecipeParameterScope.mockReturnValue({
      id: 'scope-1',
      finish: finishConfiguredRecipeParameterScope,
    });
    mockedGetAcpFeatureCapabilities.mockReset();
    mockedGetAcpFeatureCapabilities.mockResolvedValue({
      localInference: false,
      recipeParameterScopes: true,
    });
    mockedAddWorktree.mockReset();
  });

  it('sends non-empty extension configs as ACP session extensions', async () => {
    await createSession('/tmp', {
      extensionConfigs: [extensionConfig('developer')],
    });

    expect(mockedGetConfiguredGooseExtensions).toHaveBeenCalledOnce();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', [gooseExtension('developer')], {
      recipeDeeplink: undefined,
      recipeId: undefined,
      recipeParameterScopeId: undefined,
    });
  });

  it('sends an explicitly empty selection as an empty list, not as "unspecified"', async () => {
    await createSession('/tmp', {
      extensionConfigs: [],
      allExtensions: [configuredExtension('developer', true), configuredExtension('memory', false)],
    });

    expect(mockedGetConfiguredGooseExtensions).not.toHaveBeenCalled();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', [], {
      recipeDeeplink: undefined,
      recipeId: undefined,
      recipeParameterScopeId: undefined,
    });
  });

  it('leaves the set unspecified when no configured extensions are enabled', async () => {
    await createSession('/tmp', {
      allExtensions: [configuredExtension('developer', false)],
    });

    expect(mockedGetConfiguredGooseExtensions).not.toHaveBeenCalled();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', undefined, {
      recipeDeeplink: undefined,
      recipeId: undefined,
      recipeParameterScopeId: undefined,
    });
  });

  it('leaves the set unspecified while the configured extensions are still loading', async () => {
    await createSession('/tmp', { allExtensions: [] });

    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', undefined, {
      recipeDeeplink: undefined,
      recipeId: undefined,
      recipeParameterScopeId: undefined,
    });
  });

  it('scopes startup parameters to recipe deeplink session creation', async () => {
    await createSession('/tmp', { recipeDeeplink: 'goose://recipe?url=example' });

    expect(mockedBeginConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', undefined, {
      recipeDeeplink: 'goose://recipe?url=example',
      recipeId: undefined,
      recipeParameterScopeId: 'scope-1',
    });
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('finishes the deeplink parameter scope when session creation fails', async () => {
    mockedCreateAcpSession.mockRejectedValueOnce(new Error('session creation failed'));

    await expect(
      createSession('/tmp', { recipeDeeplink: 'goose://recipe?url=example' })
    ).rejects.toThrow('session creation failed');

    expect(mockedBeginConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('finishes the deeplink parameter scope when extension lookup fails', async () => {
    mockedGetConfiguredGooseExtensions.mockRejectedValueOnce(new Error('extension lookup failed'));

    await expect(
      createSession('/tmp', {
        recipeDeeplink: 'goose://recipe?url=example',
        extensionConfigs: [extensionConfig('developer')],
      })
    ).rejects.toThrow('extension lookup failed');

    expect(mockedBeginConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
    expect(mockedCreateAcpSession).not.toHaveBeenCalled();
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('reports incompatible Goose servers before sending scoped parameters', async () => {
    mockedGetAcpFeatureCapabilities.mockResolvedValueOnce({
      localInference: false,
      recipeParameterScopes: false,
    });

    await expect(
      createSession('/tmp', { recipeDeeplink: 'goose://recipe?url=example' })
    ).rejects.toThrow(
      'The connected Melody server does not support securely scoped deeplink recipe parameters. Update the server and try again.'
    );

    expect(mockedCreateAcpSession).not.toHaveBeenCalled();
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('does not activate startup parameters for ordinary or recipe-id sessions', async () => {
    await createSession('/tmp');
    await createSession('/tmp', { recipeId: 'recipe-1' });

    expect(mockedBeginConfiguredRecipeParameterScope).not.toHaveBeenCalled();
  });

  it('starts a worktree session in the worktree the sidecar adds', async () => {
    mockedAddWorktree.mockResolvedValueOnce({
      path: '/tmp/.worktrees/wt-20260916-0aff',
      branch: 'wt/wt-20260916-0aff',
    });

    await createSession('/tmp', { worktree: 'wt-20260916-0aff' });

    expect(mockedAddWorktree).toHaveBeenCalledWith('/tmp', 'wt-20260916-0aff');
    // Upstream (#12070 era): no extension choice → `undefined`, not an empty list.
    expect(mockedCreateAcpSession).toHaveBeenCalledWith(
      '/tmp/.worktrees/wt-20260916-0aff',
      undefined,
      expect.anything()
    );
  });

  it('starts no session when the worktree cannot be added', async () => {
    mockedAddWorktree.mockRejectedValueOnce(new Error('already exists'));

    await expect(createSession('/tmp', { worktree: 'wt-20260916-0aff' })).rejects.toThrow(
      'already exists'
    );

    expect(mockedCreateAcpSession).not.toHaveBeenCalled();
  });
});
