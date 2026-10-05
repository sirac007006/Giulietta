import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import type { ServerMessage, SignalDatabase, WarningDef } from '@giulietta/protocol';
import { startApp, type App, type AppOptions } from '../src/app.js';
import { SimulatorSource } from '../src/can/simulator.js';
import { ReplaySource } from '../src/can/replay.js';
import { compileDatabase, encodeSignals } from '../src/decoder.js';
import { formatCandumpLine } from '../src/can/candump.js';
import { DriveLog } from '../src/logger/drivelog.js';

const root = path.join(__dirname, '../..');
const signals = JSON.parse(readFileSync(path.join(root, 'signals/giulietta.json'), 'utf8')) as SignalDatabase;
const warnings = JSON.parse(readFileSync(path.join(root, 'config/warnings.json'), 'utf8')) as WarningDef[];

let app: App | undefined;
afterEach(async () => {
  await app?.stop();
  app = undefined;
});

/** Skuplja poruke dok predikat ne vrati true. */
function collect(port: number, until: (msgs: ServerMessage[]) => boolean, onOpen?: (ws: WebSocket) => void) {
  return new Promise<ServerMessage[]>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msgs: ServerMessage[] = [];
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`timeout; primljeno: ${msgs.map((m) => m.t).join(',')}`));
    }, 4000);
    ws.on('open', () => onOpen?.(ws));
    ws.on('message', (raw) => {
      msgs.push(JSON.parse(String(raw)) as ServerMessage);
      if (until(msgs)) {
        clearTimeout(timeout);
        ws.close();
        resolve(msgs);
      }
    });
    ws.on('error', reject);
  });
}

describe('server end-to-end', () => {
  it('simulator -> hello + state sa živim vrijednostima', async () => {
    app = await startApp({ port: 0, signals, warnings, makeSource: (db) => new SimulatorSource(db), stateHz: 20, diagHz: 10 });
    const msgs = await collect(app.port, (m) => m.filter((x) => x.t === 'state').length >= 3);
    const hello = msgs[0]!;
    expect(hello.t).toBe('hello');
    if (hello.t !== 'hello') return;
    expect(hello.signals.map((s) => s.name)).toContain('rpm');
    const state = msgs.filter((m) => m.t === 'state').at(-1)!;
    if (state.t !== 'state') return;
    expect(state.can).toMatchObject({ source: 'sim', state: 'up' });
    expect(state.values.rpm).toBeGreaterThan(500);
    expect(state.values.coolant_temp).not.toBeNull();
  });

  it('diag se šalje samo pretplaćenim klijentima', async () => {
    app = await startApp({ port: 0, signals, warnings, makeSource: (db) => new SimulatorSource(db), stateHz: 20, diagHz: 20 });
    const msgs = await collect(
      app.port,
      (m) => m.some((x) => x.t === 'diag'),
      (ws) => ws.send(JSON.stringify({ t: 'sub', diag: true })),
    );
    const diag = msgs.find((m) => m.t === 'diag')!;
    if (diag.t !== 'diag') return;
    expect(diag.frames.some((f) => f.id === 0x0fa && f.known)).toBe(true);
    expect(diag.frames.some((f) => !f.known)).toBe(true); // šum ID-jevi
  });

  it('replay candump loga + upozorenje se okida i šalje event', async () => {
    const db = compileDatabase(signals);
    const temps = db.get(0x2e0)!;
    const t0 = 1_700_000_000_000;
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      lines.push(formatCandumpLine({ id: 0x2e0, data: encodeSignals(temps, { coolant_temp: 115, intake_temp: 30, egt: 300 }), ts: t0 + i * 50 }));
    }
    const dir = mkdtempSync(path.join(os.tmpdir(), 'giulietta-'));
    const file = path.join(dir, 'candump.log');
    writeFileSync(file, lines.join('\n'));
    const fast: WarningDef[] = [{ id: 'coolant_hot', label: 'Vruće', level: 'critical', signal: 'coolant_temp', op: '>', on: 108, off: 103, delayMs: 100, sound: 'critical' }];

    app = await startApp({ port: 0, signals, warnings: fast, makeSource: () => new ReplaySource(file), stateHz: 20, diagHz: 1 });
    const msgs = await collect(app.port, (m) => m.some((x) => x.t === 'warning'));
    const w = msgs.find((m) => m.t === 'warning')!;
    expect(w).toMatchObject({ t: 'warning', id: 'coolant_hot', active: true, sound: 'critical' });
    const lastState = msgs.filter((m) => m.t === 'state').at(-1);
    if (lastState?.t === 'state') expect(lastState.values.coolant_temp).toBe(115);
  });

  it('setWarning mijenja prag, šalje novi hello i pamti se poslije restarta', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'giulietta-ovr-'));
    const overridesFile = path.join(dir, 'overrides.json');
    const base: AppOptions = { port: 0, signals, warnings, makeSource: (db) => new SimulatorSource(db), stateHz: 10, diagHz: 1, overridesFile };
    app = await startApp(base);
    const msgs = await collect(
      app.port,
      (m) => m.filter((x) => x.t === 'hello').length >= 2,
      (ws) => ws.send(JSON.stringify({ t: 'setWarning', id: 'speed_limit', on: 90, off: 85 })),
    );
    const hello2 = msgs.filter((m) => m.t === 'hello')[1]!;
    if (hello2.t !== 'hello') return;
    expect(hello2.warnings.find((w) => w.id === 'speed_limit')).toMatchObject({ on: 90, off: 85 });
    await app.stop();

    app = await startApp(base);
    const again = await collect(app.port, (m) => m.some((x) => x.t === 'hello'));
    const h = again[0]!;
    if (h.t !== 'hello') return;
    expect(h.warnings.find((w) => w.id === 'speed_limit')).toMatchObject({ on: 90, off: 85 });
  });

  it('neispravan setWarning se odbija bez rušenja servera', async () => {
    app = await startApp({ port: 0, signals, warnings, makeSource: (db) => new SimulatorSource(db), stateHz: 10, diagHz: 1 });
    const msgs = await collect(
      app.port,
      (m) => m.filter((x) => x.t === 'state').length >= 2,
      (ws) => ws.send(JSON.stringify({ t: 'setWarning', id: 'speed_limit', on: 50, off: 80 })),
    );
    expect(msgs.filter((m) => m.t === 'hello')).toHaveLength(1);
  });

  it('logger bilježi vožnju dok server radi', async () => {
    const logFile = path.join(mkdtempSync(path.join(os.tmpdir(), 'giulietta-drv-')), 'drive.db');
    app = await startApp({ port: 0, signals, warnings, makeSource: (db) => new SimulatorSource(db), stateHz: 10, diagHz: 1, logFile, logHz: 20 });
    const msgs = await collect(app.port, (m) => m.filter((x) => x.t === 'state').length >= 6);
    const st = msgs.filter((m) => m.t === 'state').at(-1)!;
    if (st.t === 'state') expect(st.log).toMatchObject({ sync: null });
    await app.stop(); // close() radi flush
    app = undefined;
    const check = new DriveLog(logFile);
    const trips = check.trips();
    expect(trips[0]!.ended_at).not.toBeNull();
    const rows = check.unsyncedSamples(1000).filter((r) => r.trip_id === trips[0]!.id);
    expect(rows.length).toBeGreaterThan(3);
    expect(JSON.parse(rows.at(-1)!.data)).toHaveProperty('rpm');
    check.close();
  });

  it('/health endpoint', async () => {
    app = await startApp({ port: 0, signals, warnings, makeSource: (db) => new SimulatorSource(db), stateHz: 10, diagHz: 1 });
    const res = await fetch(`http://127.0.0.1:${app.port}/health`);
    expect(await res.json()).toMatchObject({ ok: true, can: { source: 'sim', state: 'up' } });
  });
});
