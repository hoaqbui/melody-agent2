import { describe, expect, it } from 'vitest';
import { BAR_KEYS, keySequence, withCtrl } from './terminal-keys';

describe('terminal keys', () => {
  it('maps every bar key to a control or CSI sequence', () => {
    expect(keySequence('esc')).toBe('\x1b');
    expect(keySequence('tab')).toBe('\t');
    expect(keySequence('up')).toBe('\x1b[A');
    expect(keySequence('left')).toBe('\x1b[D');
    expect(keySequence('right')).toBe('\x1b[C');
    expect(BAR_KEYS.every((key) => keySequence(key).length > 0)).toBe(true);
  });

  it('folds an armed Ctrl into the control code', () => {
    expect(withCtrl('c')).toBe('\x03');
    expect(withCtrl('C')).toBe('\x03');
    expect(withCtrl('[')).toBe('\x1b');
    expect(withCtrl('_')).toBe('\x1f');
  });

  it('passes through what Ctrl cannot fold', () => {
    expect(withCtrl('1')).toBe('1');
    expect(withCtrl('\x1b[A')).toBe('\x1b[A');
    expect(withCtrl('')).toBe('');
  });
});
