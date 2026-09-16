// One panel's strip in the dock: its tabs, a close for the active one, and the ⋯ menu that
// is the keyboard's route to what the pointer does by dragging (DESIGN.md §Accessibility).
// The Dock owns the drag; the strip only reports where a pointer went down.

import {
  Fragment,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Ellipsis, GripVertical, X } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { cn } from '../utils';
import type { PaneId, Panel as PanelState } from './pane-store';

const i18n = defineMessages({
  panelMenu: { id: 'dock.panelMenu', defaultMessage: 'Panel' },
  tearOff: { id: 'dock.tearOff', defaultMessage: 'Tear off' },
  moveUp: { id: 'dock.moveUp', defaultMessage: 'Move up' },
  moveDown: { id: 'dock.moveDown', defaultMessage: 'Move down' },
  close: { id: 'dock.close', defaultMessage: 'Close' },
  closePane: { id: 'dock.closePane', defaultMessage: 'Close {pane}' },
});

export interface PaneChrome {
  title: string;
  Icon: ComponentType<{ className?: string }>;
}

// DESIGN.md Floating Button Rule: --shadow-sm at rest, --shadow-md lifted.
const floating = 'shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]';

interface PanelProps {
  panel: PanelState;
  index: number;
  count: number;
  chrome: Record<PaneId, PaneChrome>;
  gridRow: number;
  // The tab in flight, and where in this strip it would land; null when none is over it.
  dragging: PaneId | null;
  over: number | null;
  onSelect(id: PaneId): void;
  onClose(id: PaneId): void;
  onTearOff(id: PaneId): void;
  onMove(from: number, to: number): void;
  onTabPointerDown(event: ReactPointerEvent<HTMLElement>, id: PaneId): void;
  onHeaderPointerDown(event: ReactPointerEvent<HTMLElement>): void;
  // After the strip's own controls: the rail's launchers, on the top panel (task 60).
  trailing?: ReactNode;
}

function DropMarker() {
  return <span aria-hidden className="h-5 w-0.5 shrink-0 rounded bg-text-primary" />;
}

export function Panel({
  panel,
  index,
  count,
  chrome,
  gridRow,
  dragging,
  over,
  onSelect,
  onClose,
  onTearOff,
  onMove,
  onTabPointerDown,
  onHeaderPointerDown,
  trailing,
}: PanelProps) {
  const intl = useIntl();
  const active = chrome[panel.active];
  // The marker sits before the `over`-th tab that is not the one in flight.
  const marker = (position: number) => over !== null && over === position && <DropMarker />;
  let placed = 0;
  return (
    <div
      className={cn(
        'flex min-w-0 select-none items-center gap-1 border-b border-border-primary px-2 py-1 text-sm touch-none',
        over !== null && 'bg-background-secondary'
      )}
      style={{ gridRow }}
      data-testid="workspace-panel"
      data-dock-strip={index}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        // The ⋯ menu is a portal: its items bubble here in React's tree, not the DOM's.
        if (!event.currentTarget.contains(target) || target.closest('button')) return;
        onHeaderPointerDown(event);
      }}
    >
      <GripVertical className="size-4 shrink-0 cursor-grab text-text-secondary" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {panel.tabs.map((id) => {
          const { title, Icon } = chrome[id];
          const before = id === dragging ? false : marker(placed);
          if (id !== dragging) placed += 1;
          return (
            <Fragment key={id}>
              {before}
              <Button
                variant={panel.active === id ? 'secondary' : 'ghost'}
                size="xs"
                className={cn(
                  'touch-none',
                  panel.active === id && floating,
                  id === dragging && 'opacity-50'
                )}
                aria-pressed={panel.active === id}
                data-testid={`workspace-side-tab-${id}`}
                data-dock-tab={id}
                onPointerDown={(event) => onTabPointerDown(event, id)}
                onClick={() => onSelect(id)}
              >
                <Icon />
                {title}
              </Button>
            </Fragment>
          );
        })}
        {marker(placed)}
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="w-6 px-0"
        aria-label={intl.formatMessage(i18n.closePane, { pane: active.title })}
        data-testid={`workspace-pane-close-${panel.active}`}
        onClick={() => onClose(panel.active)}
      >
        <X />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="w-6 px-0"
            aria-label={intl.formatMessage(i18n.panelMenu)}
            data-testid="workspace-panel-menu"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="workspace-panel-menu-content">
          <DropdownMenuItem
            disabled={panel.tabs.length === 1}
            data-testid="workspace-panel-tear-off"
            onClick={() => onTearOff(panel.active)}
          >
            {intl.formatMessage(i18n.tearOff)}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === 0}
            data-testid="workspace-panel-move-up"
            onClick={() => onMove(index, index - 1)}
          >
            {intl.formatMessage(i18n.moveUp)}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === count - 1}
            data-testid="workspace-panel-move-down"
            onClick={() => onMove(index, index + 1)}
          >
            {intl.formatMessage(i18n.moveDown)}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="workspace-panel-close"
            onClick={() => onClose(panel.active)}
          >
            {intl.formatMessage(i18n.close)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {trailing}
    </div>
  );
}
