import { describe, expect, it } from 'vitest';

import { isPrivateAddress } from './bind.js';

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
