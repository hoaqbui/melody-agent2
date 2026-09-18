// Starting a review and running one again (task 70): a normal session on the Reviewer
// role's rolled seat, tagged in its title, its prompt sent from here — the Review pane is
// its face, so no chat mounts it until Open transcript. Reaches ACP through src/acp only
// and keeps each run's outcome for the pane, since a prompt sent outside the chat has no
// message list to land its error in.

import { useCallback, useSyncExternalStore } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { useConfig } from '../../../components/ConfigContext';
import { toastError } from '../../../toasts';
import { AppEvents } from '../../../constants/events';
import { acpChatSessionActions } from '../../../acp/chatSessionStore';
import { formatAcpError } from '../../../acp/errors';
import { acpListProviderDetails } from '../../../acp/providers';
import { encodeRecipe } from '../../../acp/recipe';
import { acpRenameSession } from '../../../acp/sessions';
import { listAgentSources } from '../../../acp/sources';
import { createSession } from '../../../sessions';
import { usePaneContext } from '../../pane-context';
import { prompt } from '../../prompt';
import {
  reviewPrompt,
  reviewTitle,
  reviewerRecipe,
  roleRuntimes,
  REVIEWER_ROLE,
} from '../../session-controls';
import { rollRuntime } from './review-state';

const i18n = defineMessages({
  startFailed: { id: 'reviewPane.startFailed', defaultMessage: "Couldn't start review" },
  noRole: { id: 'reviewPane.noRole', defaultMessage: 'No reviewer role in this project' },
  noRuntime: {
    id: 'reviewPane.noRuntime',
    defaultMessage: "None of the reviewer role's runtimes is installed",
  },
});

export interface ReviewRun {
  error: string | null;
}

const runs = new Map<string, ReviewRun>();
const listeners = new Set<() => void>();

function setRun(sessionId: string, run: ReviewRun): void {
  runs.set(sessionId, run);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReviewRun(sessionId: string): ReviewRun | undefined {
  return useSyncExternalStore(
    subscribe,
    () => runs.get(sessionId),
    () => runs.get(sessionId)
  );
}

// Wrapper around the lifted prompt that tracks the ReviewRun state (task 90).
async function promptReview(sessionId: string, text: string, cwd: string): Promise<void> {
  setRun(sessionId, { error: null });
  try {
    await prompt(sessionId, text, cwd);
  } catch (error) {
    setRun(sessionId, { error: String(error) });
  }
}

class ReviewStartError extends Error {
  constructor(readonly reason: 'noRole' | 'noRuntime') {
    super(reason);
  }
}

export function rerunReview(sessionId: string, branch: string, base: string, cwd: string): void {
  void promptReview(sessionId, reviewPrompt(branch, base, cwd), cwd);
}

// Review branch… as the Changes and Git panes offer it: the session starts, is tagged, gets
// its first prompt, and the Review pane opens on it; a failure to start is a toast with the
// cause, the panes' own rows untouched.
export function useStartReview(): (branch: string, base: string) => Promise<void> {
  const intl = useIntl();
  const { extensionsList } = useConfig();
  const { cwd, openReview } = usePaneContext();
  return useCallback(
    async (branch: string, base: string) => {
      try {
        const [sources, providers] = await Promise.all([
          listAgentSources(cwd),
          acpListProviderDetails(),
        ]);
        // PRD step 2's rule for the orchestrator holds: the project's own role.
        const role = sources.find((source) => source.name === REVIEWER_ROLE && !source.global);
        if (!role) throw new ReviewStartError('noRole');
        const seat = rollRuntime(roleRuntimes(role), providers);
        if (!seat) throw new ReviewStartError('noRuntime');
        const recipeDeeplink = await encodeRecipe(reviewerRecipe(role, seat));
        const session = await createSession(cwd, {
          provider: seat.provider,
          recipeDeeplink,
          allExtensions: extensionsList,
        });
        const title = reviewTitle(branch, base);
        await acpRenameSession(session.id, title);
        acpChatSessionActions.setSessionMetadata(session.id, {
          ...session,
          name: title,
          user_set_name: true,
        });
        window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED));
        void promptReview(session.id, reviewPrompt(branch, base, cwd), cwd);
        openReview(session.id);
      } catch (error) {
        toastError({
          title: intl.formatMessage(i18n.startFailed),
          msg:
            error instanceof ReviewStartError
              ? intl.formatMessage(i18n[error.reason])
              : formatAcpError(error),
        });
      }
    },
    [cwd, extensionsList, intl, openReview]
  );
}
