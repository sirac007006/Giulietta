import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import {
  PROTOCOL_VERSION,
  type CanStatus,
  type ClientMessage,
  type LogStatus,
  type ServerMessage,
  type SignalDatabase,
  type WarningDef,
} from '@giulietta/protocol';
import { compileDatabase, signalMeta } from './decoder.js';
import { StateStore } from './state.js';
import { WarningEngine } from './warnings.js';
import { Hub } from './ws.js';
import { DriveLog } from './logger/drivelog.js';
import { PgSync, type PgLike } from './logger/pgsync.js';
import type { CanSource } from './can/source.js';
import type { CompiledDatabase } from './decoder.js';

export interface AppOptions {
  port: number;
  signals: SignalDatabase;
  warnings: WarningDef[];
  makeSource: (db: CompiledDatabase) => CanSource;
  stateHz: number;
  diagHz: number;
  /** SQLite fajl za log vožnji; bez njega se ne loguje. */
  logFile?: string;
  logHz?: number;
  logKeepDays?: number;
  /** Postgres sync; bez njega log ostaje samo lokalno. */
  pg?: { connect: () => Promise<PgLike>; device: string; intervalMs: number };
  /** JSON sa pragovima koje je korisnik promijenio iz aplikacije. */
  overridesFile?: string;
  /** APK dashboard aplikacije koji head unit može da preuzme sa /apk. */
  apkFile?: string;
  log?: (msg: string) => void;
}

export interface App {
  port: number;
  stop(): Promise<void>;
}

type Overrides = Record<string, { on: number; off: number }>;

/** Spaja CAN izvor -> state store -> upozorenja -> WebSocket (+ logger i sync). */
export async function startApp(opts: AppOptions): Promise<App> {
  const log = opts.log ?? (() => {});
  const db = compileDatabase(opts.signals);
  const store = new StateStore(db);
  const warnings = new WarningEngine(opts.warnings);
  const source = opts.makeSource(db);
  const can: CanStatus = { source: source.kind, iface: source.iface, state: 'down', fps: 0 };

  const overrides = loadOverrides(opts.overridesFile, log);
  for (const [id, o] of Object.entries(overrides)) {
    try {
      warnings.update(id, o.on, o.off);
    } catch (err) {
      log(`Preskačem override za ${id}: ${String(err)}`);
    }
  }

  const driveLog = opts.logFile ? new DriveLog(opts.logFile) : undefined;
  if (driveLog) log(`Log vožnje: ${opts.logFile} (vožnja ${driveLog.tripId})`);
  const sync = driveLog && opts.pg ? new PgSync(driveLog, opts.pg.connect, opts.pg.device, opts.pg.intervalMs) : undefined;
  sync?.start();
  let pending = driveLog?.pendingCount() ?? 0;

  const logStatus = (): LogStatus | undefined =>
    driveLog && {
      tripId: driveLog.tripId,
      pending,
      sync: sync ? { lastSyncAt: sync.status.lastSyncAt, lastError: sync.status.lastError } : null,
    };

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, can, clients: hub.size, log: logStatus() }));
      return;
    }
    if (req.url === '/apk' && opts.apkFile && existsSync(opts.apkFile)) {
      res.writeHead(200, {
        'content-type': 'application/vnd.android.package-archive',
        'content-length': statSync(opts.apkFile).size,
        'content-disposition': 'attachment; filename="giulietta-dashboard.apk"',
      });
      createReadStream(opts.apkFile).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });

  const meta = signalMeta(db);
  const hello = (): ServerMessage => ({
    t: 'hello',
    version: PROTOCOL_VERSION,
    signals: meta,
    warnings: warnings.defs().map(({ id, label, level, signal, op, on, off }) => ({ id, label, level, signal, op, on, off })),
  });

  const onClientMessage = (msg: ClientMessage) => {
    if (msg.t !== 'setWarning') return;
    try {
      warnings.update(msg.id, msg.on, msg.off);
      overrides[msg.id] = { on: msg.on, off: msg.off };
      saveOverrides(opts.overridesFile, overrides);
      log(`Prag ${msg.id}: on=${msg.on} off=${msg.off}`);
      hub.broadcast(hello());
    } catch (err) {
      log(`Odbijen setWarning ${msg.id}: ${String(err)}`);
    }
  };

  const hub = new Hub(server, (send) => send(hello()), onClientMessage);

  await source.start({
    onFrame: (f) => store.ingest(f),
    onState: (state, error) => {
      if (state !== can.state || error !== can.error) {
        log(`CAN ${source.kind}${source.iface ? ` (${source.iface})` : ''}: ${state}${error ? ` — ${error}` : ''}`);
        driveLog?.addEvent(Date.now(), `can_${state}`, { error });
      }
      can.state = state;
      can.error = error;
    },
  });

  const timers = [
    setInterval(() => {
      store.tickFps();
      can.fps = store.fps;
    }, 1000),
    setInterval(() => {
      const now = Date.now();
      for (const ch of warnings.evaluate((name) => store.value(name, now), now)) {
        hub.broadcast({ t: 'warning', id: ch.def.id, label: ch.def.label, level: ch.def.level, active: ch.active, sound: ch.def.sound });
        driveLog?.addEvent(now, 'warning', { id: ch.def.id, active: ch.active, value: store.value(ch.def.signal, now) });
      }
      hub.broadcast({ t: 'state', ts: now, values: store.values(now), can: { ...can }, warnings: warnings.active(), log: logStatus() });
    }, 1000 / opts.stateHz),
    setInterval(() => {
      if (hub.hasDiagSubscribers()) hub.broadcastDiag({ t: 'diag', ts: Date.now(), frames: store.diag() });
    }, 1000 / opts.diagHz),
  ];
  if (driveLog) {
    timers.push(
      setInterval(() => driveLog.addSample(Date.now(), store.values()), 1000 / (opts.logHz ?? 2)),
      setInterval(() => {
        driveLog.flush();
        pending = driveLog.pendingCount();
      }, 10_000),
      setInterval(() => driveLog.prune(opts.logKeepDays ?? 30), 3_600_000),
    );
  }

  await new Promise<void>((resolve) => server.listen(opts.port, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;

  return {
    port,
    async stop() {
      timers.forEach(clearInterval);
      sync?.stop();
      await source.stop();
      driveLog?.close();
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function loadOverrides(file: string | undefined, log: (m: string) => void): Overrides {
  if (!file || !existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Overrides;
  } catch (err) {
    log(`Ne mogu pročitati ${file}: ${String(err)}`);
    return {};
  }
}

function saveOverrides(file: string | undefined, o: Overrides) {
  if (!file) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(o, null, 2));
}
