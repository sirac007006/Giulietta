import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SignalDatabase } from '@giulietta/protocol';
import { compileDatabase, encodeSignals } from '../src/decoder.js';
import { StateStore } from '../src/state.js';
import { DriveModel } from '../src/can/simulator.js';

const db = compileDatabase(JSON.parse(readFileSync(path.join(__dirname, '../../signals/giulietta.json'), 'utf8')) as SignalDatabase);

describe('signals/giulietta.json', () => {
  it('kompajlira se bez grešaka (nema duplih imena, signali u okviru frame-a)', () => {
    expect(db.size).toBeGreaterThan(0);
  });
});

describe('StateStore', () => {
  it('pamti zadnju vrijednost i označava stale signale kao null', () => {
    const store = new StateStore(db);
    const engine = db.get(0x0fa)!;
    store.ingest({ id: 0x0fa, data: encodeSignals(engine, { rpm: 2000, throttle: 40, boost: 0.8 }), ts: 1000 });
    expect(store.values(1100)).toMatchObject({ rpm: 2000, throttle: 40, boost: 0.8, speed: null });
    expect(store.value('rpm', 1000 + engine.staleMs + 1)).toBeNull();
  });

  it('diag: maska promijenjenih bajtova, broj frameova, nepoznati ID-jevi', () => {
    const store = new StateStore(db);
    store.ingest({ id: 0x123, data: Uint8Array.from([1, 2, 3]), ts: 0 });
    store.ingest({ id: 0x123, data: Uint8Array.from([1, 9, 3]), ts: 10 });
    const [f] = store.diag(20);
    expect(f).toMatchObject({ id: 0x123, data: '01 09 03', changed: 0b010, count: 2, known: false, age: 10 });
    // maska se resetuje posle snapshot-a
    expect(store.diag(30)[0]!.changed).toBe(0);
  });

  it('diag: Hz se broji u prozoru, i kad frameovi stižu u grupama', () => {
    const store = new StateStore(db);
    // 100 Hz isporučeno u grupama po 3 frame-a svakih 30 ms (kao tajmer na Windowsu)
    for (let t = 0; t < 1000; t += 30) for (let k = 0; k < 3; k++) store.ingest({ id: 0x1, data: Uint8Array.from([k]), ts: t });
    expect(store.diag(1000)[0]!.hz).toBeGreaterThan(95);
    expect(store.diag(1000)[0]!.hz).toBeLessThan(110);
    expect(store.diag(4000)[0]!.hz).toBe(0); // utihnuo
  });
});

describe('DriveModel (simulator)', () => {
  it('daje fizički smislene vrijednosti kroz 10 minuta vožnje', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const m = new DriveModel(rand);
    let maxSpeed = 0;
    for (let i = 0; i < 6000; i++) {
      const s = m.step(0.1);
      maxSpeed = Math.max(maxSpeed, s.speed);
      expect(s.rpm).toBeGreaterThan(600);
      expect(s.rpm).toBeLessThan(4500);
      expect(s.gear).toBeGreaterThanOrEqual(0);
      expect(s.gear).toBeLessThanOrEqual(6);
      expect(s.throttle).toBeGreaterThanOrEqual(0);
      expect(s.throttle).toBeLessThanOrEqual(100);
    }
    expect(maxSpeed).toBeGreaterThan(40);
    expect(m.s.coolant_temp).toBeGreaterThan(80); // motor se zagrijao
  });
});
