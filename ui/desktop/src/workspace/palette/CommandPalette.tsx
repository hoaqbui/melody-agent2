// Command palette ⌘K (task 92): composed from dialog.tsx + input.tsx, groups Panes ·
// Session · Sessions · Routines · Lever · Go to, filters by query with fuzzy match.
// Mounted at WorkspaceShell when ⌘K is pressed or the ⋯ menu's row is clicked;
// phone width opens from the search tab on the rail, full-screen.

import { useEffect, useRef, useState, useMemo, useCallback, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { cn } from '../../utils';
import { buildCommands, filterCommands, type Command, type PaletteContext, type PaletteState } from './palette-state';

const i18n = defineMessages({
  placeholder: { id: 'commandPalette.placeholder', defaultMessage: 'Type to search…' },
  noMatches: { id: 'commandPalette.noMatches', defaultMessage: 'Nothing matches "{query}"' },
  loading: { id: 'commandPalette.loading', defaultMessage: 'Loading…' },
});

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: PaletteContext;
  // Focus returns here when the palette closes.
  onFocusReturn?: () => void;
}

type GroupName = Command['group'];
const GROUP_ORDER: GroupName[] = ['panes', 'session', 'sessions', 'routines', 'lever', 'go-to'];
const GROUP_TITLES: Record<GroupName, string> = {
  panes: 'Panes',
  session: 'Session',
  sessions: 'Sessions',
  routines: 'Routines',
  lever: 'Lever',
  'go-to': 'Go to',
};

function CommandPaletteContent({
  query,
  onQueryChange,
  state,
  commands,
  selectedIndex,
  onSelectedIndexChange,
  onExecute,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  state: PaletteState;
  commands: Command[];
  selectedIndex: number;
  onSelectedIndexChange: (i: number) => void;
  onExecute: (command: Command) => void;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Group and sort commands by group order.
  const grouped = useMemo(() => {
    const groups = new Map<GroupName, Command[]>();
    for (const group of GROUP_ORDER) {
      groups.set(group, []);
    }
    for (const cmd of commands) {
      groups.get(cmd.group)?.push(cmd);
    }
    return Array.from(groups.entries()).filter(([_, cmds]) => cmds.length > 0);
  }, [commands]);

  // Flatten for selection.
  const flat = useMemo(
    () =>
      grouped.flatMap(([, cmds]) => cmds),
    [grouped]
  );

  // Clamp selection.
  useEffect(() => {
    if (selectedIndex >= flat.length) {
      onSelectedIndexChange(Math.max(0, flat.length - 1));
    }
  }, [flat.length, selectedIndex, onSelectedIndexChange]);

  // Scroll selected item into view.
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0 && selectedIndex < flat.length) {
      const item = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, flat.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onSelectedIndexChange(Math.min(selectedIndex + 1, flat.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSelectedIndexChange(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSelectedIndexChange(flat.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < flat.length) {
        onExecute(flat[selectedIndex]);
      }
    }
  };

  return (
    <>
      <div className="px-4 py-3 border-b border-border-primary">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-text-secondary pointer-events-none" />
          <Input
            ref={inputRef}
            autoFocus
            data-testid="palette-input"
            placeholder={intl.formatMessage(i18n.placeholder)}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
          />
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto"
        data-testid="palette-list"
        data-state={state}
        role="listbox"
      >
        {flat.length === 0 && query.trim() && state === 'empty' && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary" data-testid="palette-empty">
            {intl.formatMessage(i18n.noMatches, { query })}
          </div>
        )}

        {flat.length === 0 && !query.trim() && state === 'empty' && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary" data-testid="palette-empty">
            {intl.formatMessage(i18n.placeholder)}
          </div>
        )}

        {state === 'loading' && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary" data-testid="palette-loading">
            {intl.formatMessage(i18n.loading)}
          </div>
        )}

        {grouped.map(([groupName, groupCommands]) => (
          <div key={groupName} data-testid={`palette-group-${groupName}`}>
            <div className="px-4 py-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
              {GROUP_TITLES[groupName]}
            </div>
            {groupCommands.map((cmd) => {
              const flatIdx = flat.indexOf(cmd);
              return (
                <button
                  key={cmd.id}
                  data-testid={`palette-item-${cmd.id}`}
                  data-index={flatIdx}
                  role="option"
                  aria-selected={flatIdx === selectedIndex}
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-background-secondary focus:outline-none',
                    flatIdx === selectedIndex && 'bg-background-secondary'
                  )}
                  onClick={() => {
                    onSelectedIndexChange(flatIdx);
                    onExecute(cmd);
                  }}
                  onMouseEnter={() => onSelectedIndexChange(flatIdx)}
                >
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="text-xs text-text-secondary truncate">{cmd.hint}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

export function CommandPalette({ open, onOpenChange, context, onFocusReturn }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allCommands, setAllCommands] = useState<Command[]>([]);

  // Build commands once at open.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    const cmds = buildCommands(context);
    setAllCommands(cmds);
  }, [open, context]);

  // Filter and manage sessions search.
  const filtered = useMemo(() => {
    if (!query.trim()) {
      return filterCommands(allCommands, '');
    }
    return filterCommands(allCommands, query);
  }, [allCommands, query]);

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    setSelectedIndex(0);
  }, []);

  const handleExecute = (command: Command) => {
    void command.run();
    onOpenChange(false);
    onFocusReturn?.();
  };

  // Determine state based on filtered results.
  const displayState: PaletteState = filtered.length === 0 && query.trim() ? 'empty' : 'ready';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-2xl p-0 gap-0 max-h-96 flex flex-col"
        data-testid="command-palette"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <CommandPaletteContent
          query={query}
          onQueryChange={handleQueryChange}
          state={displayState}
          commands={filtered}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          onExecute={handleExecute}
        />
      </DialogContent>
    </Dialog>
  );
}
