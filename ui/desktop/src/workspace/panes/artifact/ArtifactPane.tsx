// The Artifact pane (PRD step 11; task 30): the markdown a worker handed back — Brief, Plan,
// Result, Review — read-only, one row per child the open session delegated to (task 65's
// delegations store), newest first. A child's artifact is its last assistant message, read
// once through the session's JSON export: one request, no session/load (which would stand
// the child's agent up), nothing in the chat store. Reaches ACP through src/acp only.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { useNavigation } from '../../../hooks/useNavigation';
import { useConfig } from '../../../components/ConfigContext';
import { Button } from '../../../components/ui/button';
import type { ProviderDetails } from '../../../types/providers';
import { useSessionDelegations, type Delegation } from '../../../acp/delegations';
import { acpExportSession } from '../../../acp/sessions';
import { MarkdownView } from '../../MarkdownView';
import { usePaneContext } from '../../pane-context';
import { runtimeLabel } from '../../session-controls';
import { artifactFromExport, firstLine, paneState, type ArtifactLoad } from './artifact-state';

const i18n = defineMessages({
  empty: {
    id: 'artifactPane.empty',
    defaultMessage: 'No artifacts yet — delegate work and the results land here',
  },
  list: { id: 'artifactPane.list', defaultMessage: 'Artifacts' },
  loading: { id: 'artifactPane.loading', defaultMessage: 'Loading…' },
  retry: { id: 'artifactPane.retry', defaultMessage: 'Retry' },
  noTranscript: {
    id: 'artifactPane.noTranscript',
    defaultMessage: 'No artifact yet — the worker has not replied',
  },
  copy: { id: 'artifactPane.copy', defaultMessage: 'Copy' },
  copied: { id: 'artifactPane.copied', defaultMessage: 'Copied' },
  openTranscript: { id: 'artifactPane.openTranscript', defaultMessage: 'Open transcript' },
});

type Loads = Readonly<Record<string, ArtifactLoad>>;

// The role names the row until task 72 carries it on reload-seeded rows; the delegation's
// title stands in meanwhile.
function roleOf(row: Delegation): string {
  return row.source ?? row.title;
}

export function ArtifactPane() {
  const intl = useIntl();
  const setView = useNavigation();
  const { getProviders } = useConfig();
  const { sessionId, artifact } = usePaneContext();
  // DESIGN.md §Vocabulary: the header names the runtime as the user says it, so a provider
  // outside the fixed four (claude-code, say) reads by its display name, never its id.
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const delegations = useSessionDelegations(sessionId);
  const rows = [...delegations].reverse();
  const [picked, setPicked] = useState<string | null>(null);
  const [loads, setLoads] = useState<Loads>({});
  const [copied, setCopied] = useState(false);
  // The status each child's artifact was read at: a child that finishes after its first
  // read (running → done) is read again for the handoff it wrote meanwhile.
  const readAt = useRef(new Map<string, Delegation['status']>());

  const load = useCallback((childSessionId: string) => {
    setLoads((current) => ({ ...current, [childSessionId]: { status: 'loading' } }));
    acpExportSession(childSessionId, 'json')
      .then((json) => {
        const text = artifactFromExport(json);
        setLoads((current) => ({ ...current, [childSessionId]: { status: 'loaded', text } }));
      })
      .catch((error: Error) => {
        setLoads((current) => ({
          ...current,
          [childSessionId]: { status: 'error', message: error.message },
        }));
      });
  }, []);

  useEffect(() => {
    for (const row of delegations) {
      const id = row.subagentSessionId;
      if (readAt.current.has(id) && readAt.current.get(id) === row.status) continue;
      readAt.current.set(id, row.status);
      load(id);
    }
  }, [delegations, load]);

  useEffect(() => {
    getProviders(false).then(setProviders);
  }, [getProviders]);

  useEffect(() => {
    if (artifact) setPicked(artifact);
  }, [artifact]);

  const selected = rows.find((row) => row.subagentSessionId === picked) ?? rows[0];
  const selectedLoad = selected ? loads[selected.subagentSessionId] : undefined;
  const state = paneState(selectedLoad, rows.length > 0);
  const text = selectedLoad?.status === 'loaded' ? selectedLoad.text : null;
  const header = selected
    ? [
        roleOf(selected),
        selected.provider && runtimeLabel(selected.provider, providers),
        selected.model,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const copy = async () => {
    if (text === null) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="flex flex-col h-full min-h-0 text-sm"
      data-testid="artifact-pane"
      data-state={state}
    >
      {!selected && (
        <p className="p-3 text-text-secondary" data-testid="artifact-empty">
          {intl.formatMessage(i18n.empty)}
        </p>
      )}
      {selected && (
        <>
          <div
            role="listbox"
            aria-label={intl.formatMessage(i18n.list)}
            className="max-h-40 shrink-0 overflow-auto border-b border-border-primary"
            data-testid="artifact-list"
          >
            {rows.map((row) => {
              const id = row.subagentSessionId;
              const rowLoad = loads[id];
              const line =
                rowLoad?.status === 'loaded' && rowLoad.text !== null
                  ? firstLine(rowLoad.text)
                  : row.title;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={id === selected.subagentSessionId}
                  className="flex w-full flex-col px-2 py-1 text-left hover:bg-background-secondary aria-selected:bg-background-secondary"
                  data-testid={`artifact-row-${id}`}
                  onClick={() => setPicked(id)}
                >
                  <span className="truncate text-text-primary">{roleOf(row)}</span>
                  {line !== roleOf(row) && (
                    <span className="truncate text-xs text-text-secondary">{line}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 px-2 py-1 border-b border-border-primary text-xs">
            <span
              className="min-w-0 flex-1 truncate text-text-secondary"
              title={header}
              data-testid="artifact-header"
            >
              {header}
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={text === null}
              onClick={copy}
              data-testid="artifact-copy"
            >
              {copied ? <Check /> : <Copy />}
              {intl.formatMessage(copied ? i18n.copied : i18n.copy)}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                setView('pair', {
                  disableAnimation: true,
                  resumeSessionId: selected.subagentSessionId,
                })
              }
              data-testid="artifact-open-transcript"
            >
              {intl.formatMessage(i18n.openTranscript)}
            </Button>
          </div>

          {state === 'loading' && (
            <p className="p-3 text-text-secondary" aria-live="polite">
              {intl.formatMessage(i18n.loading)}
            </p>
          )}
          {selectedLoad?.status === 'error' && (
            <div className="p-3 flex flex-col gap-2" role="alert" data-testid="artifact-error">
              <span className="font-mono text-xs text-text-danger break-all">
                {selectedLoad.message}
              </span>
              <Button
                variant="outline"
                size="xs"
                className="self-start"
                onClick={() => load(selected.subagentSessionId)}
              >
                {intl.formatMessage(i18n.retry)}
              </Button>
            </div>
          )}
          {state === 'partial' && (
            <div
              className="px-2 py-1 border-b border-border-primary bg-background-secondary text-xs text-text-warning"
              role="status"
              data-testid="artifact-partial"
            >
              {intl.formatMessage(i18n.noTranscript)}
            </div>
          )}
          {text !== null && (
            <div className="flex-1 min-h-0 overflow-auto" data-testid="artifact-body">
              <MarkdownView text={text} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
