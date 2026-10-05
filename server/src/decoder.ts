import type { Endianness, MessageDef, SignalDatabase, SignalDef, SignalMeta } from '@giulietta/protocol';

// Data-driven parser: sva znanja o porukama auta su u signals/*.json.
// Ovaj fajl se NE mijenja tokom reverse engineeringa — mijenja se samo JSON.

export interface CompiledSignal extends Required<Pick<SignalDef, 'name' | 'startBit' | 'length'>> {
  endianness: Endianness;
  signed: boolean;
  factor: number;
  offset: number;
  def: SignalDef;
}

export interface CompiledMessage {
  id: number;
  name: string;
  length: number;
  staleMs: number;
  signals: CompiledSignal[];
}

export type CompiledDatabase = Map<number, CompiledMessage>;

export function parseCanId(key: string): number {
  const id = Number.parseInt(key, key.toLowerCase().startsWith('0x') ? 16 : 10);
  if (!Number.isFinite(id) || id < 0 || id > 0x1fffffff) throw new Error(`Neispravan CAN ID: ${key}`);
  return id;
}

export function compileDatabase(db: SignalDatabase): CompiledDatabase {
  const out: CompiledDatabase = new Map();
  const seen = new Set<string>();
  for (const [key, msg] of Object.entries(db.messages)) {
    const id = parseCanId(key);
    out.set(id, compileMessage(id, msg, seen));
  }
  return out;
}

function compileMessage(id: number, msg: MessageDef, seen: Set<string>): CompiledMessage {
  const length = msg.length ?? 8;
  const signals = msg.signals.map((s): CompiledSignal => {
    if (seen.has(s.name)) throw new Error(`Signal "${s.name}" je definisan više puta`);
    seen.add(s.name);
    if (s.length < 1 || s.length > 64) throw new Error(`Signal "${s.name}": length mora biti 1..64`);
    if (s.startBit < 0 || s.startBit + s.length > length * 8) {
      throw new Error(`Signal "${s.name}" izlazi van ${length}-bajtnog frame-a`);
    }
    return {
      name: s.name,
      startBit: s.startBit,
      length: s.length,
      endianness: s.endianness ?? 'big',
      signed: s.signed ?? false,
      factor: s.factor ?? 1,
      offset: s.offset ?? 0,
      def: s,
    };
  });
  return { id, name: msg.name, length, staleMs: msg.staleMs ?? 1000, signals };
}

export function signalMeta(db: CompiledDatabase): SignalMeta[] {
  const out: SignalMeta[] = [];
  for (const msg of db.values()) {
    for (const s of msg.signals) {
      out.push({ name: s.name, label: s.def.label, unit: s.def.unit, min: s.def.min, max: s.def.max, canId: msg.id });
    }
  }
  return out;
}

// --- bitovi -----------------------------------------------------------------

function toBigInt(data: Uint8Array, endianness: Endianness): bigint {
  let v = 0n;
  if (endianness === 'big') {
    for (let i = 0; i < data.length; i++) v = (v << 8n) | BigInt(data[i]!);
  } else {
    for (let i = data.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(data[i]!);
  }
  return v;
}

/** Pomjeraj od LSB-a cijelog payload integera do LSB-a signala. */
function shiftFor(totalBits: number, startBit: number, length: number, endianness: Endianness): bigint {
  return BigInt(endianness === 'big' ? totalBits - startBit - length : startBit);
}

export function extractBits(
  data: Uint8Array,
  startBit: number,
  length: number,
  endianness: Endianness,
  signed: boolean,
): number | null {
  const totalBits = data.length * 8;
  if (startBit + length > totalBits) return null;
  const mask = (1n << BigInt(length)) - 1n;
  let raw = (toBigInt(data, endianness) >> shiftFor(totalBits, startBit, length, endianness)) & mask;
  if (signed && raw >> BigInt(length - 1) === 1n) raw -= 1n << BigInt(length);
  return Number(raw);
}

export function insertBits(data: Uint8Array, startBit: number, length: number, endianness: Endianness, raw: number): void {
  const totalBits = data.length * 8;
  const mask = (1n << BigInt(length)) - 1n;
  const shift = shiftFor(totalBits, startBit, length, endianness);
  let v = toBigInt(data, endianness);
  v = (v & ~(mask << shift)) | ((BigInt(raw) & mask) << shift);
  const n = data.length;
  for (let i = 0; i < n; i++) {
    const byte = Number((v >> BigInt(8 * i)) & 0xffn);
    if (endianness === 'big') data[n - 1 - i] = byte;
    else data[i] = byte;
  }
}

// --- frame <-> fizičke vrijednosti -------------------------------------------

export function decodeFrame(db: CompiledDatabase, id: number, data: Uint8Array): Record<string, number> | null {
  const msg = db.get(id);
  if (!msg) return null;
  const out: Record<string, number> = {};
  for (const s of msg.signals) {
    const raw = extractBits(data, s.startBit, s.length, s.endianness, s.signed);
    if (raw === null) continue;
    out[s.name] = round(raw * s.factor + s.offset);
  }
  return out;
}

/** Inverz od decodeFrame — koristi ga simulator. Vrijednosti van opsega se odsijecaju. */
export function encodeSignals(msg: CompiledMessage, values: Record<string, number>): Uint8Array {
  const data = new Uint8Array(msg.length);
  for (const s of msg.signals) {
    const phys = values[s.name];
    if (phys === undefined) continue;
    const minRaw = s.signed ? -(2 ** (s.length - 1)) : 0;
    const maxRaw = s.signed ? 2 ** (s.length - 1) - 1 : 2 ** s.length - 1;
    const raw = Math.min(maxRaw, Math.max(minRaw, Math.round((phys - s.offset) / s.factor)));
    insertBits(data, s.startBit, s.length, s.endianness, raw);
  }
  return data;
}

/** Uklanja float šum (0.1 * 3 = 0.30000000000000004). */
function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
