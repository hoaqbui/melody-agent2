import { describe, expect, it } from 'vitest';

import { bindAddresses, isPrivateAddress } from './bind.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '100.127.56.10',
  ])('accepts %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['::1', 'fd7a:115c:a1e0::1', 'FC00::1'])('accepts %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '0.0.0.0',
    '::',
    '8.8.8.8',
    '172.32.0.1',
    '100.128.0.1',
    '169.254.1.1',
    '2001:db8::1',
    'fe80::1',
    'localhost',
    '',
  ])('refuses %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('bindAddresses', () => {
  it('adds loopback beside the tailnet address for the desktop renderer', () => {
    expect(bindAddresses('100.127.56.10')).toEqual(['100.127.56.10', '127.0.0.1']);
  });

  it('listens on loopback alone without a tailnet', () => {
    expect(bindAddresses(null)).toEqual(['127.0.0.1']);
  });

  it('honours an explicit --bind as the only listener', () => {
    expect(bindAddresses(null, '127.0.0.1')).toEqual(['127.0.0.1']);
    expect(bindAddresses('100.127.56.10', '192.168.1.10')).toEqual(['192.168.1.10']);
  });
});
