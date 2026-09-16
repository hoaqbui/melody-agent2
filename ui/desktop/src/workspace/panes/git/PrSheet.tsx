// "Push and open PR…" (task 66): a sheet prefilled from the branch — the last commit's
// subject as the title, the commits since the base as the body — and a Draft checkbox. The
// text is the user's to edit; nothing reaches GitHub until Create, and then only through
// the sidecar's gh (ui/sidecar/src/git.ts). Shared by the Git pane and the Changes pane's
// worktree row.

import { useEffect, useState, type FormEvent } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  sidecarFetch,
  type GitLogRequest,
  type GitLogResponse,
  type GitPrCreateRequest,
  type GitPrCreateResponse,
} from '../../../native/sidecar';
import { cn } from '../../../utils';

const i18n = defineMessages({
  title: { id: 'gitPane.prSheetTitle', defaultMessage: 'Open a pull request' },
  description: {
    id: 'gitPane.prSheetDescription',
    defaultMessage: 'From {branch} — edit the text, then Create.',
  },
  descriptionInto: {
    id: 'gitPane.prSheetDescriptionInto',
    defaultMessage: 'From {branch} into {base} — edit the text, then Create.',
  },
  titleField: { id: 'gitPane.prSheetTitleField', defaultMessage: 'Title' },
  body: { id: 'gitPane.prSheetBody', defaultMessage: 'Body' },
  draft: { id: 'gitPane.prSheetDraft', defaultMessage: 'Draft' },
  reading: { id: 'gitPane.prSheetReading', defaultMessage: 'Reading the commits…' },
  titleRequired: { id: 'gitPane.prSheetTitleRequired', defaultMessage: 'Give the PR a title' },
  cancel: { id: 'gitPane.prSheetCancel', defaultMessage: 'Cancel' },
  create: { id: 'gitPane.prSheetCreate', defaultMessage: 'Create' },
  creating: { id: 'gitPane.prSheetCreating', defaultMessage: 'Creating…' },
});

const field = 'text-xs text-text-secondary';
const control =
  'w-full rounded-md border bg-background-primary px-3 py-1 text-sm hover:border-border-secondary focus:border-border-secondary focus-visible:outline-none';

export interface PrSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  cwd: string;
  branch: string;
  // The branch the PR lands on; the remote's default branch when omitted (gh's own default).
  base?: string;
  onCreated(pr: GitPrCreateResponse): void;
}

export function prBodyFromCommits(commits: readonly { subject: string }[]): string {
  return commits.map((commit) => `- ${commit.subject}`).join('\n');
}

export function PrSheet({ open, onOpenChange, cwd, branch, base, onCreated }: PrSheetProps) {
  const intl = useIntl();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const [logBase, setLogBase] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill on every open: the branch may have new commits since the last one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReading(true);
    setError(null);
    setDraft(false);
    const request: GitLogRequest = { cwd };
    if (base !== undefined) request.base = base;
    sidecarFetch<GitLogResponse>('/git/log', request)
      .then((response) => {
        if (cancelled) return;
        setTitle(response.commits[0]?.subject ?? '');
        setBody(prBodyFromCommits(response.commits));
        setLogBase(response.base);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base, cwd, open]);

  const target = base ?? logBase;
  const problem = reading
    ? intl.formatMessage(i18n.reading)
    : !title.trim()
      ? intl.formatMessage(i18n.titleRequired)
      : null;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (problem || creating) return;
    const request: GitPrCreateRequest = { cwd, title: title.trim(), body, draft };
    if (base !== undefined) request.base = base;
    setCreating(true);
    setError(null);
    try {
      const created = await sidecarFetch<GitPrCreateResponse>('/git/pr/create', request);
      onOpenChange(false);
      onCreated(created);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="pr-sheet">
        <form onSubmit={create} className="contents">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(i18n.title)}</DialogTitle>
            <DialogDescription>
              {target === null
                ? intl.formatMessage(i18n.description, { branch })
                : intl.formatMessage(i18n.descriptionInto, { branch, base: target })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={field}>{intl.formatMessage(i18n.titleField)}</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={reading || creating}
                data-testid="pr-title"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={field}>{intl.formatMessage(i18n.body)}</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={reading || creating}
                rows={6}
                className={cn(control, 'resize-y font-mono text-xs')}
                data-testid="pr-body"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft}
                onChange={(event) => setDraft(event.target.checked)}
                disabled={creating}
                className="accent-bgApp"
                data-testid="pr-draft"
              />
              {intl.formatMessage(i18n.draft)}
            </label>

            {error && (
              <p
                className="whitespace-pre-wrap font-mono text-xs text-text-danger"
                role="alert"
                data-testid="pr-error"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              {intl.formatMessage(i18n.cancel)}
            </Button>
            <Button
              type="submit"
              disabled={creating || problem !== null}
              title={problem ?? undefined}
              data-testid="pr-create"
            >
              {intl.formatMessage(creating ? i18n.creating : i18n.create)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
