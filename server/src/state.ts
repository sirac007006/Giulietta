import type { DiagFrame } from '@giulietta/protocol';
import { decodeFrame, type CompiledDatabase } from './decoder.js';
import type { CanFrame } from './can/source.js';

interface SignalEntry {
  value: number;
  ts: number;
  staleMs: number;
}

interface FrameStats {
  data: Uint8Array;
  changed: number;
  count: number;
  lastTs: number;
  /** Brojanje u prozoru između dva diag snapshot-a (tačnije od razmaka između frameova). */
  windowCount: number;
  windowStart: number;
  hz: number;
}

/**
 * Zadnja poznata vrijednost svakog signala + statistika po CAN ID-ju.
 * CAN šalje isti podatak desetine puta u sekundi; ovdje se samo pamti zadnje,
 * a WebSocket šalje snapshot na fiksnom intervalu.
 */
export class StateStore {
  private readonly signals = new Map<string, SignalEntry>();
  private readonly frames = new Map<number, FrameStats>();
  private fpsCount = 0;
  private fpsWindowStart = Date.now();
  fps = 0;

  constructor(private readonly db: CompiledDatabase) {}

  ingest(frame: CanFrame): void {
    this.fpsCount++;
    this.trackFrame(frame);
    const decoded = decodeFrame(this.db, frame.id, frame.data);
    if (!decoded) return;
    const staleMs = this.db.get(frame.id)!.staleMs;
    for (const [name, value] of Object.entries(decoded)) this.signals.set(name, { value, ts: frame.ts, staleMs });
  }

  private trackFrame(frame: CanFrame) {
    let st = this.frames.get(frame.id);
    if (!st) {
      st = { data: frame.data, changed: 0, count: 0, lastTs: frame.ts, windowCount: 0, windowStart: frame.ts, hz: 0 };
      this.frames.set(frame.id, st);
    }
    st.lastTs = frame.ts;
    st.windowCount++;
    for (let i = 0; i < frame.data.length; i++) {
      if (st.data[i] !== frame.data[i]) st.changed |= 1 << i;
    }
    st.data = frame.data;
    st.count++;
  }

  /** Poziva se periodično (npr. 1 s) da izračuna ukupni fps. */
  tickFps(now = Date.now()): void {
    const dt = now - this.fpsWindowStart;
    if (dt <= 0) return;
    this.fps = Math.round((this.fpsCount * 1000) / dt);
    this.fpsCount = 0;
    this.fpsWindowStart = now;
  }

  values(now = Date.now()): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const msg of this.db.values()) {
      for (const s of msg.signals) {
        const e = this.signals.get(s.name);
        out[s.name] = e && now - e.ts <= e.staleMs ? e.value : null;
      }
    }
    return out;
  }

  value(name: string, now = Date.now()): number | null {
    const e = this.signals.get(name);
    return e && now - e.ts <= e.staleMs ? e.value : null;
  }

  /** Snapshot za dijagnostički tab; resetuje "changed" maske. */
  diag(now = Date.now()): DiagFrame[] {
    const out: DiagFrame[] = [];
    for (const [id, st] of this.frames) {
      const span = now - st.windowStart;
      if (span >= 250) {
        const hz = (st.windowCount * 1000) / span;
        st.hz = st.hz === 0 ? hz : st.hz * 0.6 + hz * 0.4;
        st.windowCount = 0;
        st.windowStart = now;
      }
      // ID koji je utihnuo (npr. modul se ugasio) ne smije ostati na staroj frekvenciji
      if (now - st.lastTs > 2000) st.hz = 0;
      out.push({
        id,
        data: Array.from(st.data, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
        changed: st.changed,
        count: st.count,
        hz: Math.round(st.hz * 10) / 10,
        age: now - st.lastTs,
        known: this.db.has(id),
      });
      st.changed = 0;
    }
    return out.sort((a, b) => a.id - b.id);
  }
}
