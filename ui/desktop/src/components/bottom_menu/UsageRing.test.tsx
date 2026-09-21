import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../../i18n/test-utils';
import { UsageRing } from './UsageRing';

const mount = (props: Partial<Parameters<typeof UsageRing>[0]> = {}) =>
  render(
    <UsageRing contextTokens={64_000} contextLimit={128_000} seatLabel="Claude" {...props}>
      <button type="button">send</button>
    </UsageRing>,
    { wrapper: IntlTestWrapper }
  );

describe('UsageRing', () => {
  it('reads the most spent limit as a meter and names it in the title', () => {
    mount();
    const ring = screen.getByTestId('usage-ring');
    expect(ring).toHaveAttribute('aria-valuenow', '50');
    expect(ring).toHaveAttribute('data-state', 'filling');
    expect(ring).toHaveAttribute('title', 'Context window: 64k / 128k (50%)');
  });

  it('turns warm past 80% and takes a plan limit when that is the higher one', () => {
    mount({
      planLimits: [{ id: 'weekly', label: 'Weekly', used: 85, max: 100, resets: 'Resets Sat' }],
    });
    const ring = screen.getByTestId('usage-ring');
    expect(ring).toHaveAttribute('aria-valuenow', '85');
    expect(ring).toHaveAttribute('data-warm', 'true');
    expect(ring).toHaveAttribute('title', 'Weekly: 85 / 100 (85%)');
  });

  it('is unknown with no limit and carries no number', () => {
    mount({ contextLimit: 0 });
    const ring = screen.getByTestId('usage-ring');
    expect(ring).toHaveAttribute('data-state', 'unknown');
    expect(ring).not.toHaveAttribute('aria-valuenow');
  });

  it('opens the breakdown on hover, names an unreported seat, and closes on Escape', () => {
    const onCompact = vi.fn();
    mount({ onCompact });
    expect(screen.queryByTestId('usage-breakdown')).toBeNull();
    fireEvent.pointerEnter(screen.getByTestId('usage-ring').parentElement!);
    const panel = screen.getByTestId('usage-breakdown');
    expect(panel).toHaveTextContent('Context window');
    expect(panel).toHaveTextContent('Compacts automatically at 97%');
    expect(screen.getByTestId('usage-not-reported')).toHaveTextContent(
      'Plan limits: not reported by Claude'
    );
    screen.getByTestId('usage-compact').click();
    expect(onCompact).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByTestId('usage-breakdown')).toBeNull();
  });

  it('lists each plan limit with its reset when a seat reports them', () => {
    mount({
      planLimits: [
        { id: 'five-hour', label: '5-hour limit', used: 10, max: 100, resets: 'Resets in 3 hr' },
        { id: 'weekly', label: 'Weekly · all models', used: 20, max: 100, resets: 'Resets Sat' },
      ],
    });
    fireEvent.pointerEnter(screen.getByTestId('usage-ring').parentElement!);
    expect(screen.getByTestId('usage-limit-five-hour')).toHaveTextContent('Resets in 3 hr · 10%');
    expect(screen.getByTestId('usage-limit-weekly')).toHaveTextContent('Resets Sat · 20%');
    expect(screen.queryByTestId('usage-not-reported')).toBeNull();
  });
});
