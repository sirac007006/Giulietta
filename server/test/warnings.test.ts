import { describe, expect, it } from 'vitest';
import type { WarningDef } from '@giulietta/protocol';
import { WarningEngine } from '../src/warnings.js';

const hot: WarningDef = { id: 'hot', label: 'Vruće', level: 'critical', signal: 't', op: '>', on: 108, off: 103, delayMs: 1000 };

function run(engine: WarningEngine, values: Record<string, number | null>, now: number) {
  return engine.evaluate((n) => values[n] ?? null, now).map((c) => `${c.def.id}:${c.active ? 'on' : 'off'}`);
}

describe('WarningEngine', () => {
  it('aktivira tek nakon delayMs (debounce)', () => {
    const e = new WarningEngine([hot]);
    expect(run(e, { t: 110 }, 0)).toEqual([]);
    expect(run(e, { t: 110 }, 999)).toEqual([]);
    expect(run(e, { t: 110 }, 1000)).toEqual(['hot:on']);
    expect(e.active().map((w) => w.id)).toEqual(['hot']);
  });

  it('kratak špic ne okida upozorenje', () => {
    const e = new WarningEngine([hot]);
    run(e, { t: 110 }, 0);
    run(e, { t: 100 }, 500);
    expect(run(e, { t: 110 }, 1200)).toEqual([]);
  });

  it('histereza: ne gasi se dok ne padne ispod "off" praga', () => {
    const e = new WarningEngine([{ ...hot, delayMs: 0 }]);
    expect(run(e, { t: 109 }, 0)).toEqual(['hot:on']);
    expect(run(e, { t: 105 }, 1)).toEqual([]); // između off i on — ostaje upaljeno
    expect(run(e, { t: 107 }, 2)).toEqual([]);
    expect(run(e, { t: 102 }, 3)).toEqual(['hot:off']);
  });

  it('"<" operator (malo goriva)', () => {
    const e = new WarningEngine([{ id: 'fuel', label: 'Gorivo', level: 'warning', signal: 'f', op: '<', on: 7, off: 9 }]);
    expect(run(e, { f: 6 }, 0)).toEqual(['fuel:on']);
    expect(run(e, { f: 8 }, 1)).toEqual([]);
    expect(run(e, { f: 10 }, 2)).toEqual(['fuel:off']);
  });

  it('dodatni "and" uslov (obrtaji samo dok je motor hladan)', () => {
    const e = new WarningEngine([
      { id: 'cold', label: 'Hladan', level: 'warning', signal: 'rpm', op: '>', on: 3000, off: 2700, and: { signal: 'ct', op: '<', value: 60 } },
    ]);
    expect(run(e, { rpm: 3500, ct: 80 }, 0)).toEqual([]);
    expect(run(e, { rpm: 3500, ct: 40 }, 1)).toEqual(['cold:on']);
    expect(run(e, { rpm: 3500, ct: 65 }, 2)).toEqual(['cold:off']);
  });

  it('gasi se odmah kad signal postane stale (null)', () => {
    const e = new WarningEngine([{ ...hot, delayMs: 0 }]);
    run(e, { t: 110 }, 0);
    expect(run(e, { t: null }, 1)).toEqual(['hot:off']);
  });

  it('update mijenja pragove i validira ih', () => {
    const e = new WarningEngine([{ ...hot, delayMs: 0 }]);
    e.update('hot', 120, 115);
    expect(run(e, { t: 110 }, 0)).toEqual([]);
    expect(run(e, { t: 121 }, 1)).toEqual(['hot:on']);
    expect(() => e.update('hot', 100, 110)).toThrow();
    expect(() => e.update('nema', 1, 1)).toThrow(/nema/);
  });

  it('odbija neispravnu histerezu', () => {
    expect(() => new WarningEngine([{ ...hot, off: 120 }])).toThrow(/hot/);
  });
});
