import { execFile } from 'node:child_process';
import { isIPv4, isIPv6 } from 'node:net';

const TAILSCALE_CANDIDATES = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

const inV4Block = (octets: number[], prefix: number[], bits: number): boolean => {
  const value = octets.reduce((acc, octet) => (acc << 8) | octet, 0) >>> 0;
  const base = prefix.reduce((acc, octet) => (acc << 8) | octet, 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
};

// Loopback, RFC 1918, the Tailscale CGNAT range and IPv6 ULA are the only
// places a remote shell may listen; the wildcard and public addresses are
// refused (ARCHITECTURE.md §Invariants: Tailscale is the sidecar's only gate).
export const isPrivateAddress = (address: string): boolean => {
  if (isIPv4(address)) {
    const octets = address.split('.').map(Number);
    return (
      inV4Block(octets, [127, 0, 0, 0], 8) ||
      inV4Block(octets, [10, 0, 0, 0], 8) ||
      inV4Block(octets, [172, 16, 0, 0], 12) ||
      inV4Block(octets, [192, 168, 0, 0], 16) ||
      inV4Block(octets, [100, 64, 0, 0], 10)
    );
  }
  if (isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd');
  }
  return false;
};

const tailscaleIp = (binary: string): Promise<string | null> =>
  new Promise((resolve) => {
    execFile(binary, ['ip', '-4'], { timeout: 3000 }, (error, stdout) => {
      const first = stdout.trim().split('\n')[0]?.trim();
      resolve(!error && first && isIPv4(first) ? first : null);
    });
  });

const LOOPBACK = '127.0.0.1';

// An explicit --bind is exactly that address. Otherwise the tailnet address
// carries the phone and loopback carries the desktop renderer, whose CSP names
// only 127.0.0.1; without a tailnet there is only loopback.
export const bindAddresses = (tailnetIp: string | null, explicit?: string): string[] => {
  if (explicit) {
    return [explicit];
  }
  return tailnetIp ? [tailnetIp, LOOPBACK] : [LOOPBACK];
};

export const resolveBindAddresses = async (explicit?: string): Promise<string[]> => {
  if (explicit) {
    return bindAddresses(null, explicit);
  }
  for (const binary of TAILSCALE_CANDIDATES) {
    const ip = await tailscaleIp(binary);
    if (ip) {
      return bindAddresses(ip);
    }
  }
  return bindAddresses(null);
};
