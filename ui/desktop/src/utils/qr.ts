// A byte-mode QR encoder (ISO/IEC 18004), versions 1–10 at error-correction level M:
// enough for a tailnet URL with a 64-hex key (~100 bytes, version 7) and nothing more.
// Written here rather than pulled in: the tree carries no QR library (task 62).

export interface QrCode {
  size: number;
  mask: number;
  /** Row-major; true is a dark module. */
  modules: boolean[][];
}

const EC_LEVEL_M = 0b00;
const MAX_VERSION = 10;

// Per version at level M: [ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks, group2DataCodewords].
const EC_BLOCKS_M: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];

const ALIGNMENT_CENTERS: ReadonlyArray<readonly number[]> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  GF_EXP[i] = x;
  GF_LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];

const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

const rsGenerator = (degree: number): number[] => {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
};

const rsRemainder = (data: number[], generator: number[]): number[] => {
  const remainder = new Array<number>(generator.length - 1).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    for (let i = 0; i < remainder.length; i++) {
      remainder[i] ^= gfMul(generator[i + 1], factor);
    }
  }
  return remainder;
};

const dataCapacityBytes = (version: number): number => {
  const [, g1, d1, g2, d2] = EC_BLOCKS_M[version - 1];
  return g1 * d1 + g2 * d2;
};

const countBits = (version: number): number => (version < 10 ? 8 : 16);

const smallestVersion = (byteLength: number): number => {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const headerBits = 4 + countBits(version);
    if (byteLength * 8 + headerBits <= dataCapacityBytes(version) * 8) return version;
  }
  throw new Error(`text of ${byteLength} bytes exceeds QR version ${MAX_VERSION}`);
};

class BitBuffer {
  bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

const dataCodewords = (bytes: Uint8Array, version: number): number[] => {
  const capacity = dataCapacityBytes(version) * 8;
  const buffer = new BitBuffer();
  buffer.push(0b0100, 4);
  buffer.push(bytes.length, countBits(version));
  for (const byte of bytes) buffer.push(byte, 8);
  buffer.push(0, Math.min(4, capacity - buffer.bits.length));
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    codewords.push(parseInt(buffer.bits.slice(i, i + 8).join(''), 2));
  }
  for (let pad = 0xec; codewords.length < capacity / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
};

// Blocks are interleaved codeword by codeword, data first then EC (spec 7.6).
const interleave = (data: number[], version: number): number[] => {
  const [ecCount, g1, d1, g2, d2] = EC_BLOCKS_M[version - 1];
  const generator = rsGenerator(ecCount);
  const blocks: number[][] = [];
  let offset = 0;
  for (const [count, length] of [
    [g1, d1],
    [g2, d2],
  ]) {
    for (let i = 0; i < count; i++) {
      blocks.push(data.slice(offset, offset + length));
      offset += length;
    }
  }
  const ecBlocks = blocks.map((block) => rsRemainder(block, generator));
  const out: number[] = [];
  const longest = Math.max(...blocks.map((block) => block.length));
  for (let i = 0; i < longest; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecCount; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
};

type Grid = { dark: boolean[][]; reserved: boolean[][]; size: number };

const setModule = (grid: Grid, row: number, col: number, dark: boolean): void => {
  grid.dark[row][col] = dark;
  grid.reserved[row][col] = true;
};

const drawFinder = (grid: Grid, row: number, col: number): void => {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.size || cc >= grid.size) continue;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      setModule(grid, rr, cc, ring !== 2 && ring !== 4);
    }
  }
};

const drawAlignment = (grid: Grid, row: number, col: number): void => {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      setModule(grid, row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
  }
};

const drawFunctionPatterns = (grid: Grid, version: number): void => {
  const { size } = grid;
  drawFinder(grid, 0, 0);
  drawFinder(grid, 0, size - 7);
  drawFinder(grid, size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    setModule(grid, 6, i, i % 2 === 0);
    setModule(grid, i, 6, i % 2 === 0);
  }
  const centers = ALIGNMENT_CENTERS[version - 1];
  const last = centers.length - 1;
  centers.forEach((row, i) => {
    centers.forEach((col, j) => {
      const underFinder =
        (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (!underFinder) drawAlignment(grid, row, col);
    });
  });
  // Format-information cells are reserved now so data routes around them and filled last.
  for (let i = 0; i < 9; i++) {
    grid.reserved[8][i] = true;
    grid.reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    grid.reserved[8][size - 1 - i] = true;
    grid.reserved[size - 1 - i][8] = true;
  }
  setModule(grid, size - 8, 8, true);
  if (version >= 7) drawVersionInfo(grid, version);
};

const drawVersionInfo = (grid: Grid, version: number): void => {
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  const bits = (version << 12) | remainder;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = grid.size - 11 + (i % 3);
    setModule(grid, a, b, dark);
    setModule(grid, b, a, dark);
  }
};

const drawFormatInfo = (grid: Grid, mask: number): void => {
  const data = (EC_LEVEL_M << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const { size } = grid;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) grid.dark[i][8] = bit(i);
  grid.dark[7][8] = bit(6);
  grid.dark[8][8] = bit(7);
  grid.dark[8][7] = bit(8);
  for (let i = 9; i < 15; i++) grid.dark[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) grid.dark[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) grid.dark[size - 15 + i][8] = bit(i);
};

// The zig-zag placement: two-column strips from the right, upward then downward,
// skipping the timing column at 6 (spec 7.7.3).
const placeData = (grid: Grid, codewords: number[]): void => {
  const { size } = grid;
  let bitIndex = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (grid.reserved[row][col]) continue;
        let dark = false;
        if (bitIndex < total) {
          dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        grid.dark[row][col] = dark;
      }
    }
  }
};

const MASKS: ReadonlyArray<(row: number, col: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const applyMask = (grid: Grid, mask: number): void => {
  const test = MASKS[mask];
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      if (!grid.reserved[row][col] && test(row, col)) grid.dark[row][col] = !grid.dark[row][col];
    }
  }
};

// Spec 7.8.3 as python-qrcode reads it: same-colour runs of five or more (rule 1), 2×2
// blocks (rule 2), a 1:1:3:1:1 run with four light modules on one side (rule 3), and
// the dark share's distance from 50% (rule 4).
const penalty = (modules: boolean[][]): number => {
  const size = modules.length;
  let score = 0;
  const line = (i: number, j: number, transposed: boolean): boolean =>
    transposed ? modules[j][i] : modules[i][j];
  for (const transposed of [false, true]) {
    for (let i = 0; i < size; i++) {
      let run = 0;
      let last = line(i, 0, transposed);
      for (let j = 0; j < size; j++) {
        const cell = line(i, j, transposed);
        if (cell === last) {
          run++;
          continue;
        }
        if (run >= 5) score += run - 2;
        run = 1;
        last = cell;
      }
      if (run >= 5) score += run - 2;
      for (let j = 0; j + 11 <= size; j++) {
        const at = (k: number) => line(i, j + k, transposed);
        const core = !at(1) && at(4) && !at(5) && at(6) && !at(9);
        const before = at(0) && at(2) && at(3) && !at(7) && !at(8) && !at(10);
        const after = !at(0) && !at(2) && !at(3) && at(7) && at(8) && at(10);
        if (core && (before || after)) score += 40;
      }
    }
  }
  for (let row = 0; row + 1 < size; row++) {
    for (let col = 0; col + 1 < size; col++) {
      const a = modules[row][col];
      if (
        a === modules[row][col + 1] &&
        a === modules[row + 1][col] &&
        a === modules[row + 1][col + 1]
      ) {
        score += 3;
      }
    }
  }
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
};

const cloneRows = (rows: boolean[][]): boolean[][] => rows.map((row) => row.slice());

export const qr = (text: string): QrCode => {
  const bytes = new TextEncoder().encode(text);
  const version = smallestVersion(bytes.length);
  const size = version * 4 + 17;
  const grid: Grid = {
    size,
    dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
  drawFunctionPatterns(grid, version);
  placeData(grid, interleave(dataCodewords(bytes, version), version));

  let best: QrCode | undefined;
  let bestScore = Infinity;
  for (let mask = 0; mask < MASKS.length; mask++) {
    const candidate: Grid = { size, dark: cloneRows(grid.dark), reserved: grid.reserved };
    applyMask(candidate, mask);
    drawFormatInfo(candidate, mask);
    const score = penalty(candidate.dark);
    if (score < bestScore) {
      bestScore = score;
      best = { size, mask, modules: candidate.dark };
    }
  }
  return best!;
};

const QUIET_ZONE = 4;

// One path of unit squares over a white ground: scanners want dark-on-light whatever
// the app's theme, so the colours are fixed here rather than themed.
export const qrSvg = (code: QrCode): { viewBox: string; path: string } => {
  const parts: string[] = [];
  code.modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) parts.push(`M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`);
    });
  });
  const extent = code.size + QUIET_ZONE * 2;
  return { viewBox: `0 0 ${extent} ${extent}`, path: parts.join('') };
};
