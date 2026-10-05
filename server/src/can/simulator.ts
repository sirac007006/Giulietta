import { encodeSignals, type CompiledDatabase } from '../decoder.js';
import type { CanSource, CanSourceEvents } from './source.js';

/**
 * Simulator vožnje 1.6 JTDm sa ručnim mjenjačem. Generiše fizički smislene vrijednosti
 * (obrtaji prate brzinu i stepen prenosa, motor se zagrijava, gorivo opada...)
 * i kodira ih u frameove PO DEFINICIJAMA iz signals/*.json — pa simulator automatski
 * prati svaku izmjenu definicija. Signali koje model ne poznaje dobijaju sporu sinusoidu
 * u svom min..max opsegu.
 *
 * Dodaje i nekoliko "nepoznatih" ID-jeva sa brojačima i šumom, kao na pravom busu,
 * da dijagnostički tab ima šta da prikaže.
 */

// km/h na 1000 o/min po stepenu (približno, 1.6 JTDm 6-brzinski)
const KMH_PER_1000 = [0, 8.2, 15.1, 23.6, 32.5, 41.0, 49.5];
const IDLE_RPM = 820;
const UPSHIFT_RPM = 2400;
const DOWNSHIFT_RPM = 1300;

type Phase = { kind: 'idle' | 'accelerate' | 'cruise' | 'brake'; until: number; target: number };

export interface DriveState {
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  boost: number;
  coolant_temp: number;
  intake_temp: number;
  egt: number;
  fuel_level: number;
  battery_voltage: number;
}

export class DriveModel {
  s: DriveState = {
    speed: 0,
    rpm: IDLE_RPM,
    gear: 0,
    throttle: 0,
    boost: 0,
    coolant_temp: 18,
    intake_temp: 22,
    egt: 180,
    fuel_level: 62,
    battery_voltage: 14.2,
  };
  private phase: Phase = { kind: 'idle', until: 0, target: 0 };
  private t = 0;

  constructor(private readonly rand: () => number = Math.random) {}

  /** dt u sekundama. */
  step(dt: number): DriveState {
    this.t += dt;
    const s = this.s;
    if (this.t >= this.phase.until) this.nextPhase();

    // brzina i gas
    let accel = 0; // km/h po sekundi
    switch (this.phase.kind) {
      case 'idle':
        s.throttle = 0;
        accel = -6;
        break;
      case 'accelerate':
        s.throttle = approach(s.throttle, 55 + 35 * Math.sin(this.t / 3) ** 2, 80 * dt);
        accel = s.speed < this.phase.target ? 2 + s.throttle / 12 : 0;
        if (s.speed >= this.phase.target) this.phase = { kind: 'cruise', until: this.t + 8 + this.rand() * 10, target: s.speed };
        break;
      case 'cruise':
        s.throttle = approach(s.throttle, 18 + 4 * Math.sin(this.t), 60 * dt);
        accel = (this.phase.target - s.speed) * 0.5;
        break;
      case 'brake':
        s.throttle = 0;
        accel = -7;
        break;
    }
    s.speed = Math.max(0, s.speed + accel * dt);

    // mjenjač
    if (s.speed < 3) s.gear = 0;
    else if (s.gear === 0) s.gear = 1;
    const rpmInGear = (g: number) => (s.speed / KMH_PER_1000[g]!) * 1000;
    if (s.gear > 0 && s.gear < 6 && rpmInGear(s.gear) > UPSHIFT_RPM) s.gear++;
    if (s.gear > 1 && rpmInGear(s.gear) < DOWNSHIFT_RPM) s.gear--;
    const targetRpm = s.gear === 0 ? IDLE_RPM + (s.throttle > 0 ? 400 : 0) : Math.max(IDLE_RPM, rpmInGear(s.gear));
    s.rpm = approach(s.rpm, targetRpm, 4000 * dt) + (this.rand() - 0.5) * 8;

    // turbo, temperature, gorivo
    const load = s.throttle / 100;
    const boostTarget = s.rpm > 1500 ? load * 1.2 * Math.min(1, (s.rpm - 1500) / 1000) : 0;
    s.boost = approach(s.boost, boostTarget, 1.5 * dt);
    s.egt = approach(s.egt, 180 + load * 480 + s.rpm / 30, 60 * dt);
    s.intake_temp = approach(s.intake_temp, 22 + s.boost * 18, 2 * dt);
    // ubrzano zagrijavanje (pravi motor ~10 min, ovdje ~2 min) da se vidi na dashboardu
    s.coolant_temp = approach(s.coolant_temp, 90, (0.5 + load) * dt * 1.2);
    s.fuel_level = Math.max(0, s.fuel_level - (0.0005 + load * 0.004) * dt);
    s.battery_voltage = 14.1 + (this.rand() - 0.5) * 0.1;
    return s;
  }

  private nextPhase() {
    const r = this.rand();
    if (this.phase.kind === 'idle') {
      this.phase = { kind: 'accelerate', until: this.t + 60, target: 50 + Math.round(r * 80) };
    } else if (this.phase.kind === 'accelerate' || this.phase.kind === 'cruise') {
      this.phase = r < 0.6 ? { kind: 'brake', until: this.t + 6 + r * 6, target: 0 } : { kind: 'accelerate', until: this.t + 30, target: 60 + Math.round(r * 70) };
    } else {
      this.phase = this.s.speed < 1 ? { kind: 'idle', until: this.t + 4 + r * 6, target: 0 } : { kind: 'accelerate', until: this.t + 40, target: 40 + Math.round(r * 60) };
    }
  }
}

function approach(v: number, target: number, maxDelta: number) {
  return v + Math.max(-maxDelta, Math.min(maxDelta, target - v));
}

/** Koliko često se šalje koji ID, po imenu poruke (heuristika; nepoznato = 10 Hz). */
function periodFor(name: string): number {
  if (/temp/i.test(name)) return 100; // 10 Hz
  if (/engine|speed|vehicle/i.test(name)) return 20; // 50 Hz
  return 100;
}

const NOISE_IDS: { id: number; period: number; kind: 'counter' | 'static' | 'random' }[] = [
  { id: 0x0a0, period: 10, kind: 'counter' },
  { id: 0x101, period: 20, kind: 'random' },
  { id: 0x2f8, period: 100, kind: 'static' },
  { id: 0x4b2, period: 500, kind: 'counter' },
  { id: 0x5a0, period: 1000, kind: 'static' },
];

export class SimulatorSource implements CanSource {
  readonly kind = 'sim' as const;
  readonly iface = 'sim';
  private timer: NodeJS.Timeout | undefined;
  private readonly model = new DriveModel();

  constructor(
    private readonly db: CompiledDatabase,
    private readonly tickMs = 10,
  ) {}

  async start(events: CanSourceEvents): Promise<void> {
    let counter = 0;
    const sources = [
      ...[...this.db.values()].map((msg) => ({ id: msg.id, period: periodFor(msg.name), next: 0, emit: () => this.encode(msg.id) })),
      ...NOISE_IDS.map((n) => ({ id: n.id, period: n.period, next: 0, emit: () => noiseFrame(n.kind, counter++) })),
    ];
    let last = Date.now();
    events.onState('up');
    this.timer = setInterval(() => {
      const now = Date.now();
      this.model.step((now - last) / 1000);
      last = now;
      for (const src of sources) {
        // Tajmer (naročito na Windowsu, ~15 ms) kasni — nadoknadi propuštene frameove
        // da frekvencija po ID-ju bude tačna. Posle dugog zastoja ne pucaj rafal.
        if (now - src.next > 200) src.next = now;
        while (now >= src.next) {
          events.onFrame({ id: src.id, data: src.emit(), ts: now });
          src.next += src.period;
        }
      }
    }, this.tickMs);
  }

  private encode(id: number): Uint8Array {
    const msg = this.db.get(id)!;
    const s = this.model.s as unknown as Record<string, number>;
    const values: Record<string, number> = {};
    for (const sig of msg.signals) {
      if (sig.name in s) values[sig.name] = s[sig.name]!;
      else {
        const min = sig.def.min ?? 0;
        const max = sig.def.max ?? 100;
        values[sig.name] = min + ((Math.sin(Date.now() / 4000 + sig.startBit) + 1) / 2) * (max - min);
      }
    }
    return encodeSignals(msg, values);
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
  }
}

function noiseFrame(kind: 'counter' | 'static' | 'random', counter: number): Uint8Array {
  const d = new Uint8Array(8);
  if (kind === 'counter') {
    d[0] = counter & 0xff;
    d[7] = (counter * 7) & 0x0f;
  } else if (kind === 'random') {
    for (let i = 0; i < 8; i++) d[i] = (Math.random() * 256) | 0;
  } else {
    d.set([0x12, 0x00, 0x40, 0x00, 0x00, 0x00, 0x01, 0x80]);
  }
  return d;
}
