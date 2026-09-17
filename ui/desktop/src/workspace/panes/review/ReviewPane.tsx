// The Review pane (PRD step 15; task 70): the review session's last reply parsed by the
// Reviewer role's Return shape — the verdict as a chip, each section a collapsible list,
// every `file:line` a link into the Editor — for the newest review of the cwd, the others
// listed above it. The reply is read from the session store while the session is in memory
// and from its JSON export once it is not (task 30's reader); a reply that does not parse
// shows as markdown. No Apply: the Reviewer never fixes, and neither does the pane.
// Reaches ACP through src/acp only.

import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { defineMessages, useIntl } from '../../../i18n';
import { useNavigation } from '../../../hooks/useNavigation';
import { useConfig } from '../../../components/ConfigContext';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../utils';
import type { ProviderDetails } from '../../../types/providers';
import { ChatState } from '../../../types/chatState';
import { acpChatSessionStore, useAcpChatSessionSnapshot } from '../../../acp/chatSessionStore';
import { acpExportSession, acpListSessions } from '../../../acp/sessions';
import { MarkdownView } from '../../MarkdownView';
import { usePaneContext } from '../../pane-context';
import { runtimeLabel } from '../../session-controls';
import { artifactFromExport, lastAssistantText } from '../artifact/artifact-state';
import {
  fileLinks,
  parseReview,
  resolveLinkPath,
  type Review,
  type ReviewSectionId,
  type Verdict,
} from './review-parse';
import { rerunReview, useReviewRun } from './review-session';
import { paneState, reviewRows, type ReviewRead, type ReviewRow } from './review-state';

const i18n = defineMessages({
  empty: {
    id: 'reviewPane.empty',
    defaultMessage: 'No review yet — Review branch… in Changes',
  },
  list: { id: 'reviewPane.list', defaultMessage: 'Reviews' },
  reviewing: { id: 'reviewPane.reviewing', defaultMessage: 'Reviewing…' },
  loading: { id: 'reviewPane.loading', defaultMessage: 'Loading…' },
  noReply: {
    id: 'reviewPane.noReply',
    defaultMessage: 'No verdict yet — the reviewer has not replied',
  },
  unparsed: {
    id: 'reviewPane.unparsed',
    defaultMessage: 'No verdict in this reply — shown as the reviewer wrote it',
  },
  retry: { id: 'reviewPane.retry', defaultMessage: 'Retry' },
  rerun: { id: 'reviewPane.rerun', defaultMessage: 'Re-review' },
  openTranscript: { id: 'reviewPane.openTranscript', defaultMessage: 'Open transcript' },
  verdict: { id: 'reviewPane.verdict', defaultMessage: 'Verdict' },
  pass: { id: 'reviewPane.pass', defaultMessage: 'PASS' },
  passWithIssues: { id: 'reviewPane.passWithIssues', defaultMessage: 'PASS WITH ISSUES' },
  fail: { id: 'reviewPane.fail', defaultMessage: 'FAIL' },
  requirements: { id: 'reviewPane.requirements', defaultMessage: 'Requirements coverage' },
  plan: { id: 'reviewPane.plan', defaultMessage: 'Plan adherence' },
  correctness: { id: 'reviewPane.correctness', defaultMessage: 'Correctness issues' },
  architecture: { id: 'reviewPane.architecture', defaultMessage: 'Architecture concerns' },
  testGaps: { id: 'reviewPane.testGaps', defaultMessage: 'Test gaps' },
  fixes: { id: 'reviewPane.fixes', defaultMessage: 'Recommended fixes' },
  nothing: { id: 'reviewPane.nothing', defaultMessage: 'Nothing listed' },
  openAt: { id: 'reviewPane.openAt', defaultMessage: 'Open {path} at line {line}' },
});

const VERDICT_MESSAGES: Record<Verdict, keyof typeof i18n> = {
  PASS: 'pass',
  'PASS WITH ISSUES': 'passWithIssues',
  FAIL: 'fail',
};

// DESIGN.md §Tokens: success for a pass, warning for a pass with something to look at,
// danger for a fail — beside its word, never alone.
const VERDICT_CLASSES: Record<Verdict, string> = {
  PASS: 'border-text-success text-text-success',
  'PASS WITH ISSUES': 'border-text-warning text-text-warning',
  FAIL: 'border-text-danger text-text-danger',
};

const SECTION_MESSAGES: Record<ReviewSectionId, keyof typeof i18n> = {
  requirements: 'requirements',
  plan: 'plan',
  correctness: 'correctness',
  architecture: 'architecture',
  testGaps: 'testGaps',
  fixes: 'fixes',
};

type ExportLoad =
  | { status: 'loading' }
  | { status: 'loaded'; text: string | null }
  | { status: 'error'; message: string };

// A finding's own markdown (bold, code, a link) inline, no paragraph around it.
function Inline({ text }: { text: string }) {
  // Markdown drops the spaces at a paragraph's edges; beside a link they are the item's.
  const core = text.trim();
  const lead = text.slice(0, text.length - text.trimStart().length);
  const trail = text.slice(text.trimEnd().length);
  return (
    <>
      {lead}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node: _node, ...props }) => <span {...props} />,
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {core}
      </ReactMarkdown>
      {trail}
    </>
  );
}

// An item's text with each `file:line` a button into the Editor.
function Finding({ item, cwd }: { item: string; cwd: string }) {
  const intl = useIntl();
  const { openFile } = usePaneContext();
  const parts: ReactNode[] = [];
  let at = 0;
  for (const { link, text, start, end } of fileLinks(item)) {
    parts.push(<Inline key={`${at}-text`} text={item.slice(at, start)} />);
    parts.push(
      <button
        key={start}
        type="button"
        className="font-mono underline hover:text-text-primary"
        title={intl.formatMessage(i18n.openAt, { path: link.path, line: link.line })}
        data-testid="review-link"
        data-path={link.path}
        data-line={link.line}
        onClick={() => openFile(resolveLinkPath(link.path, cwd), link.line)}
      >
        {text}
      </button>
    );
    at = end;
  }
  parts.push(<Inline key={`${at}-text`} text={item.slice(at)} />);
  return <li className="py-0.5">{parts}</li>;
}

function ParsedReview({ review, cwd }: { review: Review; cwd: string }) {
  const intl = useIntl();
  return (
    <div className="flex flex-col gap-2 p-2" data-testid="review-body">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">{intl.formatMessage(i18n.verdict)}</span>
        <span
          className={cn(
            'rounded-chip border px-2 py-0.5 text-xs font-medium',
            VERDICT_CLASSES[review.verdict]
          )}
          data-testid="review-verdict"
          data-verdict={review.verdict}
        >
          {intl.formatMessage(i18n[VERDICT_MESSAGES[review.verdict]])}
        </span>
      </div>
      {review.sections.map((section) => (
        <details
          key={section.id}
          open={section.items.length > 0}
          className="rounded-panel border border-border-primary px-2 py-1"
          data-testid={`review-section-${section.id}`}
        >
          <summary className="cursor-pointer select-none text-xs text-text-secondary">
            {intl.formatMessage(i18n[SECTION_MESSAGES[section.id]])} · {section.items.length}
          </summary>
          {section.items.length === 0 ? (
            <p className="px-2 text-xs text-text-tertiary">{intl.formatMessage(i18n.nothing)}</p>
          ) : (
            <ul className="list-disc pl-5 text-xs">
              {section.items.map((item, index) => (
                <Finding key={index} item={item} cwd={cwd} />
              ))}
            </ul>
          )}
        </details>
      ))}
    </div>
  );
}

export function ReviewPane() {
  const intl = useIntl();
  const setView = useNavigation();
  const { getProviders } = useConfig();
  const { cwd, review } = usePaneContext();
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Attempts at the session list and at the export, bumped by Retry.
  const [attempt, setAttempt] = useState(0);
  const [exported, setExported] = useState<Record<string, ExportLoad>>({});

  useEffect(() => {
    getProviders(false).then(setProviders);
  }, [getProviders]);

  // The tagged sessions of the cwd, from the server's list — read again when a review
  // starts so the new one is on it.
  useEffect(() => {
    let cancelled = false;
    acpListSessions()
      .then((page) => {
        if (!cancelled) setRows(reviewRows(page.sessions, cwd));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, cwd, review]);

  useEffect(() => {
    if (review) setPicked(review);
  }, [review]);

  // A review that just started is in the store before the list has it.
  const started = review ? acpChatSessionStore.getSnapshot(review)?.session : undefined;
  const listed =
    rows === null
      ? []
      : started && !rows.some((row) => row.id === started.id)
        ? reviewRows(
            [
              {
                id: started.id,
                name: started.name,
                workingDir: started.working_dir,
                createdAt: started.created_at,
                providerId: started.provider_name ?? undefined,
                modelId: started.model_config?.model_name,
              },
            ],
            cwd
          ).concat(rows)
        : rows;
  const selected = listed.find((row) => row.id === picked) ?? listed[0];
  const selectedId = selected?.id ?? '';
  const snapshot = useAcpChatSessionSnapshot(selectedId);
  const run = useReviewRun(selectedId);
  const live = snapshot?.session ? snapshot : undefined;

  // A session the store no longer holds (the app restarted) is read through its export,
  // never `session/load`, which would stand its agent up.
  useEffect(() => {
    if (!selectedId || live) return;
    let cancelled = false;
    setExported((current) => ({ ...current, [selectedId]: { status: 'loading' } }));
    acpExportSession(selectedId, 'json')
      .then((json) => {
        if (cancelled) return;
        const text = artifactFromExport(json);
        setExported((current) => ({ ...current, [selectedId]: { status: 'loaded', text } }));
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setExported((current) => ({
          ...current,
          [selectedId]: { status: 'error', message: error.message },
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, live, selectedId]);

  const exportLoad = exported[selectedId];
  const streaming = live
    ? live.activePromptAttemptId !== null || live.chatState !== ChatState.Idle
    : !exportLoad || exportLoad.status === 'loading';
  const text = live
    ? lastAssistantText(live.messages)
    : exportLoad?.status === 'loaded'
      ? exportLoad.text
      : null;
  const parsed = text === null || streaming ? null : parseReview(text);
  const read: ReviewRead | undefined = selected
    ? {
        streaming,
        text,
        parsed: parsed !== null,
        error:
          run?.error ??
          snapshot?.sessionLoadError ??
          (exportLoad?.status === 'error' ? exportLoad.message : null),
      }
    : undefined;
  const state = paneState(read, rows === null || listed.length > 0);
  const header = selected
    ? [
        selected.branch,
        selected.base,
        runtimeLabel(live?.session?.provider_name ?? selected.provider ?? '', providers),
        live?.session?.model_config?.model_name ?? selected.model,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const rerun = () => selected && rerunReview(selected.id, selected.branch, selected.base, cwd);

  return (
    <div
      className="flex flex-col h-full min-h-0 text-sm"
      data-testid="review-pane"
      data-state={state}
    >
      {rows === null && (
        <p className="p-3 text-text-secondary" aria-live="polite">
          {intl.formatMessage(i18n.loading)}
        </p>
      )}
      {rows !== null && !selected && (
        <p className="p-3 text-text-secondary" data-testid="review-empty">
          {intl.formatMessage(i18n.empty)}
        </p>
      )}
      {selected && (
        <>
          {listed.length > 1 && (
            <div
              role="listbox"
              aria-label={intl.formatMessage(i18n.list)}
              className="max-h-32 shrink-0 overflow-auto border-b border-border-primary"
              data-testid="review-list"
            >
              {listed.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  aria-selected={row.id === selected.id}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-background-secondary aria-selected:bg-background-secondary"
                  data-testid={`review-row-${row.id}`}
                  onClick={() => setPicked(row.id)}
                >
                  <span className="truncate font-mono text-xs">{row.branch}</span>
                  <span className="truncate text-xs text-text-secondary">
                    {row.createdAt.slice(0, 16).replace('T', ' ')}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 px-2 py-1 border-b border-border-primary text-xs">
            <span
              className="min-w-0 flex-1 truncate font-mono text-text-secondary"
              title={header}
              data-testid="review-header"
            >
              {header}
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={streaming}
              data-testid="review-rerun"
              onClick={rerun}
            >
              {intl.formatMessage(i18n.rerun)}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              data-testid="review-open-transcript"
              onClick={() =>
                setView('pair', { disableAnimation: true, resumeSessionId: selected.id })
              }
            >
              {intl.formatMessage(i18n.openTranscript)}
            </Button>
          </div>

          {state === 'loading' && (
            <p className="p-3 text-text-secondary" aria-live="polite" data-testid="review-loading">
              {intl.formatMessage(live ? i18n.reviewing : i18n.loading)}
            </p>
          )}
          {state === 'error' && read?.error && (
            <div className="p-3 flex flex-col gap-2" role="alert" data-testid="review-error">
              <span className="font-mono text-xs text-text-danger break-all">{read.error}</span>
              <Button
                variant="outline"
                size="xs"
                className="self-start"
                onClick={() => (live ? rerun() : setAttempt((count) => count + 1))}
              >
                {intl.formatMessage(live ? i18n.rerun : i18n.retry)}
              </Button>
            </div>
          )}
          {state === 'partial' && (
            <div
              className="px-2 py-1 border-b border-border-primary bg-background-secondary text-xs text-text-warning"
              role="status"
              data-testid="review-partial"
            >
              {intl.formatMessage(text === null ? i18n.noReply : i18n.unparsed)}
            </div>
          )}
          {state === 'ready' && parsed && (
            <div className="flex-1 min-h-0 overflow-auto">
              <ParsedReview review={parsed} cwd={cwd} />
            </div>
          )}
          {/* What has landed so far while the reviewer writes, and a reply with no verdict. */}
          {state !== 'ready' && state !== 'error' && text !== null && (
            <div className="flex-1 min-h-0 overflow-auto" data-testid="review-raw">
              <MarkdownView text={text} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
