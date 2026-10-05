import { describe, expect, it } from 'vitest';
import { formatCandumpLine, parseCandump, parseCandumpLine } from '../src/can/candump.js';

describe('candump -l format', () => {
  it('parsira standardnu liniju', () => {
    const f = parseCandumpLine('(1696426222.123456) can0 3E8#0C80820000000000')!;
    expect(f.iface).toBe('can0');
    expect(f.id).toBe(0x3e8);
    expect(Array.from(f.data)).toEqual([0x0c, 0x80, 0x82, 0, 0, 0, 0, 0]);
    expect(f.ts).toBeCloseTo(1696426222123.456, 2);
  });

  it('parsira prazan payload i extended ID', () => {
    expect(parseCandumpLine('(1.000000) can0 123#')!.data.length).toBe(0);
    expect(parseCandumpLine('(1.000000) can0 18DAF110#0102')!.id).toBe(0x18daf110);
  });

  it('preskače remote, CAN FD i smeće', () => {
    expect(parseCandumpLine('(1.0) can0 123#R')).toBeNull();
    expect(parseCandumpLine('(1.0) can0 123##1AABB')).toBeNull();
    expect(parseCandumpLine('nije candump')).toBeNull();
    expect(parseCandumpLine('(1.0) can0 123#ABC')).toBeNull();
  });

  it('parseCandump podnosi CRLF i prazne linije', () => {
    expect(parseCandump('(1.0) can0 1#01\r\n\r\n(2.0) can0 2#02\r\n')).toHaveLength(2);
  });

  it('format -> parse je round-trip', () => {
    const frame = { id: 0x0fa, data: Uint8Array.from([1, 2, 255]), ts: 1700000000123.5 };
    const line = formatCandumpLine(frame);
    expect(line).toBe('(1700000000.123500) can0 0FA#0102FF');
    const back = parseCandumpLine(line)!;
    expect(back.id).toBe(frame.id);
    expect(Array.from(back.data)).toEqual([1, 2, 255]);
  });
});
