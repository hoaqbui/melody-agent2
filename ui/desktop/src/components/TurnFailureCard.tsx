import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import type { MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from '../i18n';
import { cn } from '../utils';
import { Button } from './ui/button';
import type { ClassifiedTurnError, TurnErrorKind } from '../acp/errors';

const i18n = defineMessages({
  headlineAuth: {
    id: 'turnFailureCard.headlineAuth',
    defaultMessage: 'The turn stopped: sign-in expired',
  },
  headlineQuota: {
    id: 'turnFailureCard.headlineQuota',
    defaultMessage: 'The turn stopped: usage limit reached',
  },
  headlineNetwork: {
    id: 'turnFailureCard.headlineNetwork',
    defaultMessage: 'The turn stopped: the connection dropped',
  },
  headlineOther: {
    id: 'turnFailureCard.headlineOther',
    defaultMessage: 'The turn stopped',
  },
  bodyAuth: {
    id: 'turnFailureCard.bodyAuth',
    defaultMessage: 'Sign in again, then retry to pick the turn back up.',
  },
  bodyQuota: {
    id: 'turnFailureCard.bodyQuota',
    defaultMessage:
      "This seat's usage limit was reached. A reset time isn't available for this runtime yet.",
  },
  bodyNetwork: {
    id: 'turnFailureCard.bodyNetwork',
    defaultMessage:
      'The connection closed before the reply finished. Nothing changed after the last completed step.',
  },
  bodyOther: {
    id: 'turnFailureCard.bodyOther',
    defaultMessage: 'The turn stopped before it finished.',
  },
  signIn: { id: 'turnFailureCard.signIn', defaultMessage: 'Sign in' },
  retry: { id: 'turnFailureCard.retry', defaultMessage: 'Retry' },
  copyDetails: { id: 'turnFailureCard.copyDetails', defaultMessage: 'Copy details' },
  copied: { id: 'turnFailureCard.copied', defaultMessage: 'Copied' },
});

const HEADLINE_MESSAGE: Record<TurnErrorKind, MessageDescriptor> = {
  auth: i18n.headlineAuth,
  quota: i18n.headlineQuota,
  network: i18n.headlineNetwork,
  other: i18n.headlineOther,
};

const BODY_MESSAGE: Record<TurnErrorKind, MessageDescriptor> = {
  auth: i18n.bodyAuth,
  quota: i18n.bodyQuota,
  network: i18n.bodyNetwork,
  other: i18n.bodyOther,
};

export interface TurnFailureCardProps {
  failure: ClassifiedTurnError;
  provider?: string | null;
  model?: string | null;
  onRetry: () => void;
}

export default function TurnFailureCard({
  failure,
  provider,
  model,
  onRetry,
}: TurnFailureCardProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const isQuota = failure.kind === 'quota';

  const detailLine = [
    failure.detail,
    provider,
    model,
    failure.failedAt ? intl.formatTime(failure.failedAt) : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const handleCopyDetails = async () => {
    try {
      await navigator.clipboard.writeText(detailLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy turn failure details:', err);
    }
  };

  return (
    <div
      data-testid="turn-failure-card"
      className={cn(
        'rounded-lg border p-4 my-2',
        isQuota
          ? 'border-yellow-600/30 dark:border-yellow-500/30 bg-yellow-500/10'
          : 'border-red-600/30 dark:border-red-500/30 bg-red-500/10'
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn(
            'h-4 w-4 mt-0.5 shrink-0',
            isQuota ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
          )}
        />
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'text-sm font-semibold',
              isQuota ? 'text-yellow-800 dark:text-yellow-200' : 'text-red-700 dark:text-red-300'
            )}
          >
            {intl.formatMessage(HEADLINE_MESSAGE[failure.kind])}
          </div>
          <div className="text-sm text-text-secondary mt-1">
            {intl.formatMessage(BODY_MESSAGE[failure.kind])}
          </div>
          <div className="mt-2 rounded-md bg-background-secondary px-2 py-1.5 font-mono text-xs text-text-secondary truncate">
            {detailLine}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {failure.kind === 'auth' && (
              <Button size="sm" onClick={() => navigate('/runtimes')}>
                {intl.formatMessage(i18n.signIn)}
              </Button>
            )}
            <Button
              size="sm"
              variant={failure.kind === 'auth' ? 'outline' : 'default'}
              onClick={onRetry}
              data-testid="turn-failure-retry"
            >
              {intl.formatMessage(i18n.retry)}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopyDetails}
              data-testid="turn-failure-copy"
            >
              {copied ? intl.formatMessage(i18n.copied) : intl.formatMessage(i18n.copyDetails)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
