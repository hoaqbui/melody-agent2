import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import MentionPopover from './MentionPopover';

vi.mock('../acp/autocomplete', () => ({
  listAgentMentionItems: vi.fn().mockResolvedValue([]),
  listSlashCommandItems: vi.fn().mockResolvedValue([]),
}));

const props = {
  onClose: vi.fn(),
  onSelect: vi.fn(),
  position: { x: 0, y: 0 },
  query: '',
  isSlashCommand: false,
  selectedIndex: -1,
  onSelectedIndexChange: vi.fn(),
  workingDir: '/workspace',
};

describe('MentionPopover', () => {
  it('popover portal renders into document.body', () => {
    window.electron.listFiles = vi.fn().mockResolvedValue([]);

    render(<MentionPopover {...props} isOpen />, { wrapper: IntlTestWrapper });

    const popover = document.body.querySelector('.fixed.z-50');
    expect(popover).toBeInTheDocument();
    expect(popover?.parentElement).toBe(document.body);
  });
});
