import { describe, expect, it } from 'vitest';
import { auraTokens, darkTokens, lightTokens } from './theme-tokens';

type Rgb = [number, number, number];

// The charcoal ground the translucent dark surfaces sit on: what the web build paints
// under them and the darkest ground the glass ever has (DESIGN.md §Tokens & theme,
// 2026-09-16).
const GROUND: Rgb = [0x1c, 0x1c, 0x1c];

function parse(color: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [n >> 16, (n >> 8) & 0xff, n & 0xff], alpha: 1 };
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (!rgba) throw new Error(`unparsed colour ${color}`);
  return {
    rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
    alpha: Number(rgba[4]),
  };
}

function over(color: string, ground: Rgb): Rgb {
  const { rgb, alpha } = parse(color);
  return rgb.map((c, i) => c * alpha + ground[i] * (1 - alpha)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(text: string, background: string): number {
  const bg = over(background, GROUND);
  const fg = over(text, bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const surfaces = [
  '--color-background-primary',
  '--color-background-secondary',
  '--color-background-tertiary',
] as const;

describe('dark theme (Charcoal Monokai)', () => {
  it('resolves every token the light theme defines', () => {
    for (const key of Object.keys(lightTokens) as (keyof typeof lightTokens)[]) {
      expect(darkTokens[key], key).toMatch(/\S/);
    }
  });

  it.each(surfaces)('keeps body text at WCAG AA on %s', (surface) => {
    const background = darkTokens[surface];
    for (const role of ['primary', 'secondary'] as const) {
      const text = darkTokens[`--color-text-${role}`];
      expect(contrast(text, background), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Hint text (tertiary, disabled) is for hints and disabled controls only — never body
  // copy — so it is held to the 3:1 large-text/UI floor, on every surface.
  it.each(surfaces)('keeps hint text (tertiary, disabled) at 3:1 on %s', (surface) => {
    const background = darkTokens[surface];
    for (const role of ['tertiary', 'disabled'] as const) {
      const text = darkTokens[`--color-text-${role}`];
      expect(contrast(text, background), `${role} on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(surfaces)('keeps the status colours legible as text on %s', (surface) => {
    const background = darkTokens[surface];
    for (const role of ['info', 'success', 'warning', 'danger'] as const) {
      const text = darkTokens[`--color-text-${role}`];
      expect(contrast(text, background), `${role} on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps inverse text at WCAG AA on the accent surface', () => {
    expect(
      contrast(darkTokens['--color-text-inverse'], darkTokens['--color-background-inverse'])
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every glass surface at or above the Glass Rule alpha floor', () => {
    for (const surface of surfaces) {
      expect(parse(darkTokens[surface]).alpha, surface).toBeGreaterThanOrEqual(0.72);
    }
  });
});

describe('light and aura themes', () => {
  // Snapshot taken at fork commit a8d8763e3, before the dark theme became Charcoal
  // Monokai: light and aura are upstream's / task 22's and stay byte-for-byte.
  it('light tokens are unchanged', () => {
    expect(lightTokens).toMatchSnapshot();
  });

  it('aura tokens are unchanged', () => {
    expect(auraTokens).toMatchSnapshot();
  });
});
