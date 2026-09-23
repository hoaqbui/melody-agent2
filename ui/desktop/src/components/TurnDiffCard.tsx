import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { Button } from './ui/button';
import { cn } from '../utils';
import { sidecarFetch, type GitDiffRequest, type GitDiffResponse } from '../native/sidecar';
import { useToolCardSlot } from '../workspace/tool-card-slot';
import { repoRelative, type TurnDiff } from './turn-diff';

const i18n = defineMessages({
  openInChanges: { id: 'turnDiffCard.openInChanges', defaultMessage: 'Open in Changes' },
  openInEditor: { id: 'turnDiffCard.openInEditor', defaultMessage: 'Open in Editor' },
  loading: { id: 'turnDiffCard.loading', defaultMessage: 'Loading…' },
  error: { id: 'turnDiffCard.error', defaultMessage: 'Failed to load diff' },
  newContent: { id: 'turnDiffCard.newContent', defaultMessage: 'new content' },
});

interface TurnDiffCardProps {
  diff: TurnDiff;
  line?: number;
}

type LineKind = 'context' | 'add' | 'remove';
interface DiffLine {
  type: LineKind;
  text: string;
}
interface LineDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

// Above this many cells the O(n*m) LCS table gets expensive; a whole-file write's arguments
// can be large, so past the cap every line is shown as removed/added rather than diffed.
const MAX_LOCAL_DIFF_CELLS = 250_000;

function splitLines(text: string): string[] {
  return text.replace(/\n$/, '').split('\n');
}

function diffLines(oldText: string, newText: string): LineDiff {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length;
  const m = b.length;

  if (n * m > MAX_LOCAL_DIFF_CELLS) {
    return {
      lines: [
        ...a.map((text): DiffLine => ({ type: 'remove', text })),
        ...b.map((text): DiffLine => ({ type: 'add', text })),
      ],
      added: m,
      removed: n,
    };
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: 'context', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'remove', text: a[i] });
      removed++;
      i++;
    } else {
      lines.push({ type: 'add', text: b[j] });
      added++;
      j++;
    }
  }
  while (i < n) {
    lines.push({ type: 'remove', text: a[i] });
    removed++;
    i++;
  }
  while (j < m) {
    lines.push({ type: 'add', text: b[j] });
    added++;
    j++;
  }
  return { lines, added, removed };
}

function formatDiffLines(lines: DiffLine[]): string {
  return lines
    .map((line) => (line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ') + line.text)
    .join('\n');
}

function parseDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { added, removed };
}

export function TurnDiffCard({ diff, line }: TurnDiffCardProps) {
  const intl = useIntl();
  const slot = useToolCardSlot();
  const [isExpanded, setIsExpanded] = useState(false);
  const [snapshotDiff, setSnapshotDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasSnapshots = Boolean(slot?.snapshots && slot.cwd);
  const [loading, setLoading] = useState(hasSnapshots);

  useEffect(() => {
    if (!slot?.snapshots || !slot.cwd) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const request: GitDiffRequest = {
      cwd: slot.cwd,
      base: slot.snapshots.start,
      head: slot.snapshots.end,
      path: repoRelative(diff.path, slot.gitToplevel || slot.cwd),
    };

    sidecarFetch<GitDiffResponse>('/git/diff', request)
      .then((response) => {
        if (!cancelled) {
          setSnapshotDiff(response.diff);
          setLoading(false);
        }
      })
      .catch((cause: Error) => {
        if (!cancelled) {
          setError(cause.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slot?.snapshots, slot?.cwd, slot?.gitToplevel, diff.path]);

  const local = useMemo(() => diffLines(diff.oldText, diff.newText), [diff.oldText, diff.newText]);
  // A write's arguments never carry the prior file content; without a snapshot pair to read
  // the real old text from, the card can only report what was written, not what changed.
  const isUnknownWrite = diff.kind === 'write' && !hasSnapshots;

  const stats = hasSnapshots
    ? snapshotDiff !== null
      ? parseDiffStats(snapshotDiff)
      : { added: 0, removed: 0 }
    : isUnknownWrite
      ? { added: splitLines(diff.newText).length, removed: 0 }
      : { added: local.added, removed: local.removed };

  const body = hasSnapshots
    ? snapshotDiff
    : isUnknownWrite
      ? diff.newText
      : formatDiffLines(local.lines);

  const basename = diff.path.split('/').pop() || diff.path;

  return (
    <div
      className="turn-diff-card border border-border-primary rounded-md overflow-hidden"
      data-testid="turn-diff-card"
      data-path={diff.path}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-background-secondary hover:bg-background-primary transition-colors text-sm font-mono"
      >
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', isExpanded && 'rotate-180')}
        />
        <span className="flex-1 min-w-0 truncate">{basename}</span>
        {!error && !loading && (
          <span className="shrink-0 text-xs">
            <span className="text-text-success">+{stats.added}</span>
            {isUnknownWrite ? (
              <span className="ml-1 text-text-secondary">
                {intl.formatMessage(i18n.newContent)}
              </span>
            ) : (
              <>
                {' '}
                <span className="text-text-danger">−{stats.removed}</span>
              </>
            )}
          </span>
        )}
        {loading && (
          <span className="shrink-0 text-xs text-text-secondary">
            {intl.formatMessage(i18n.loading)}
          </span>
        )}
        {error && (
          <span className="shrink-0 text-xs text-text-danger">
            {intl.formatMessage(i18n.error)}
          </span>
        )}
      </button>

      {isExpanded && (
        <>
          <div className="border-t border-border-primary">
            {error ? (
              <div className="p-3 text-xs text-text-danger whitespace-pre-wrap font-mono">
                {error}
              </div>
            ) : loading ? (
              <div className="p-3 text-xs text-text-secondary">
                {intl.formatMessage(i18n.loading)}
              </div>
            ) : (
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-text-primary">
                {body}
              </pre>
            )}
          </div>
          {slot && (
            <div className="border-t border-border-primary flex gap-2 p-2">
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  slot.presetDiffPath(repoRelative(diff.path, slot.gitToplevel || slot.cwd));
                  slot.openPane('diff');
                }}
              >
                {intl.formatMessage(i18n.openInChanges)}
              </Button>
              <Button size="xs" variant="outline" onClick={() => slot.openFile(diff.path, line)}>
                {intl.formatMessage(i18n.openInEditor)}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
