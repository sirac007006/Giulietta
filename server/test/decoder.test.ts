import { describe, expect, it } from 'vitest';
import type { SignalDatabase } from '@giulietta/protocol';
import { compileDatabase, decodeFrame, encodeSignals, extractBits, insertBits } from '../src/decoder.js';

const bytes = (...b: number[]) => Uint8Array.from(b);

describe('extractBits', () => {
  it('big-endian: startBit 0 / 16 bita = (b0 << 8) | b1 (primjer iz plana)', () => {
    // 800 rpm * 4 = 3200 = 0x0C80
    expect(extractBits(bytes(0x0c, 0x80, 0, 0), 0, 16, 'big', false)).toBe(3200);
  });

  it('big-endian: bajt usred payload-a', () => {
    expect(extractBits(bytes(0, 0, 0x7f, 0), 16, 8, 'big', false)).toBe(0x7f);
  });

  it('big-endian: polovina bajta (nibble)', () => {
    // 0xA5 -> gornji nibble 0xA, donji 0x5
    expect(extractBits(bytes(0xa5), 0, 4, 'big', false)).toBe(0xa);
    expect(extractBits(bytes(0xa5), 4, 4, 'big', false)).toBe(0x5);
  });

  it('little-endian: startBit 0 / 16 bita = (b1 << 8) | b0', () => {
    expect(extractBits(bytes(0x80, 0x0c), 0, 16, 'little', false)).toBe(3200);
  });

  it('little-endian: jedan bit (flag)', () => {
    expect(extractBits(bytes(0b0000_0100), 2, 1, 'little', false)).toBe(1);
    expect(extractBits(bytes(0b0000_0100), 3, 1, 'little', false)).toBe(0);
  });

  it('signed vrijednosti (two\'s complement)', () => {
    expect(extractBits(bytes(0xff), 0, 8, 'big', true)).toBe(-1);
    expect(extractBits(bytes(0xff, 0x38), 0, 16, 'big', true)).toBe(-200);
  });

  it('vraća null ako signal izlazi van primljenog frame-a', () => {
    expect(extractBits(bytes(0x01), 0, 16, 'big', false)).toBeNull();
  });
});

describe('insertBits je inverz extractBits', () => {
  for (const endianness of ['big', 'little'] as const) {
    it(`${endianness}: round-trip`, () => {
      const buf = new Uint8Array(8);
      insertBits(buf, 3, 13, endianness, 0x1abc & 0x1fff);
      insertBits(buf, 20, 8, endianness, 0x5a);
      expect(extractBits(buf, 3, 13, endianness, false)).toBe(0x1abc & 0x1fff);
      expect(extractBits(buf, 20, 8, endianness, false)).toBe(0x5a);
    });
  }

  it('signed round-trip', () => {
    const buf = new Uint8Array(2);
    insertBits(buf, 0, 16, 'big', -200);
    expect(extractBits(buf, 0, 16, 'big', true)).toBe(-200);
  });
});

describe('decodeFrame / encodeSignals', () => {
  const db: SignalDatabase = {
    messages: {
      '0x3E8': {
        name: 'engine_data',
        length: 8,
        signals: [
          { name: 'rpm', startBit: 0, length: 16, factor: 0.25, offset: 0 },
          { name: 'temp', startBit: 16, length: 8, factor: 1, offset: -40 },
        ],
      },
    },
  };
  const compiled = compileDatabase(db);

  it('dekodira po definiciji (primjer iz plana)', () => {
    const frame = bytes(0x0c, 0x80, 130, 0, 0, 0, 0, 0);
    expect(decodeFrame(compiled, 0x3e8, frame)).toEqual({ rpm: 800, temp: 90 });
  });

  it('vraća null za nepoznat ID', () => {
    expect(decodeFrame(compiled, 0x123, bytes(1, 2))).toBeNull();
  });

  it('encode -> decode daje iste fizičke vrijednosti', () => {
    const data = encodeSignals(compiled.get(0x3e8)!, { rpm: 3000, temp: 21 });
    expect(decodeFrame(compiled, 0x3e8, data)).toEqual({ rpm: 3000, temp: 21 });
  });

  it('encode ograničava vrijednost na opseg bitova', () => {
    const data = encodeSignals(compiled.get(0x3e8)!, { rpm: 999999, temp: -100 });
    const out = decodeFrame(compiled, 0x3e8, data)!;
    expect(out.rpm).toBe(0xffff * 0.25);
    expect(out.temp).toBe(-40);
  });

  it('odbija duplo ime signala', () => {
    expect(() =>
      compileDatabase({
        messages: {
          '0x1': { name: 'a', signals: [{ name: 'x', startBit: 0, length: 8 }] },
          '0x2': { name: 'b', signals: [{ name: 'x', startBit: 0, length: 8 }] },
        },
      }),
    ).toThrow(/x/);
  });
});
