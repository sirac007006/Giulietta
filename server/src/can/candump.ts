import type { CanFrame } from './source.js';

// Format `candump -l`:  (1696426222.123456) can0 3E8#0C80820000000000
// Remote frameovi (3E8#R) i CAN FD (3E8##1...) se preskaču — Giulietta je CAN 2.0B.
const LINE = /^\((\d+)\.(\d+)\)\s+(\S+)\s+([0-9A-Fa-f]{1,8})#([0-9A-Fa-f]*)\s*$/;

export interface CandumpLine extends CanFrame {
  iface: string;
}

export function parseCandumpLine(line: string): CandumpLine | null {
  const m = LINE.exec(line.trim());
  if (!m) return null;
  const [, sec, frac, iface, idHex, dataHex] = m;
  if (dataHex!.length % 2 !== 0 || dataHex!.length > 16) return null;
  const data = new Uint8Array(dataHex!.length / 2);
  for (let i = 0; i < data.length; i++) data[i] = Number.parseInt(dataHex!.slice(i * 2, i * 2 + 2), 16);
  const ts = Number(sec) * 1000 + Number(`0.${frac}`) * 1000;
  return { ts, iface: iface!, id: Number.parseInt(idHex!, 16), data };
}

export function parseCandump(text: string): CandumpLine[] {
  const out: CandumpLine[] = [];
  for (const line of text.split(/\r?\n/)) {
    const f = parseCandumpLine(line);
    if (f) out.push(f);
  }
  return out;
}

export function formatCandumpLine(frame: CanFrame, iface = 'can0'): string {
  const sec = Math.floor(frame.ts / 1000);
  const usec = Math.round((frame.ts - sec * 1000) * 1000);
  const id = frame.id.toString(16).toUpperCase().padStart(frame.id > 0x7ff ? 8 : 3, '0');
  const data = Array.from(frame.data, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
  return `(${sec}.${String(usec).padStart(6, '0')}) ${iface} ${id}#${data}`;
}
