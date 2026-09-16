// The key bar for touch screens (PRD step 13; DESIGN.md §Accessibility): the keys a phone
// keyboard lacks, as the byte sequences an xterm-256color shell expects. Pure, no DOM.

export type BarKey = 'esc' | 'tab' | 'up' | 'down' | 'left' | 'right';

export const BAR_KEYS: readonly BarKey[] = ['esc', 'tab', 'up', 'down', 'left', 'right'];

const SEQUENCES: Record<BarKey, string> = {
  esc: '\x1b',
  tab: '\t',
  up: '\x1b[A',
  down: '\x1b[B',
  left: '\x1b[D',
  right: '\x1b[C',
};

export function keySequence(key: BarKey): string {
  return SEQUENCES[key];
}

// Ctrl on the bar arms the next character: letters and the five ASCII punctuation
// controls fold to their control code, anything else passes through unchanged.
export function withCtrl(data: string): string {
  if (data.length !== 1) return data;
  const upper = data.toUpperCase();
  if ((upper >= 'A' && upper <= 'Z') || (upper >= '[' && upper <= '_')) {
    return String.fromCharCode(upper.charCodeAt(0) & 0x1f);
  }
  return data;
}
