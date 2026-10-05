import { startApp } from './app.js';
import { loadConfig, loadSignals, loadWarnings } from './config.js';
import { ReplaySource } from './can/replay.js';
import { SimulatorSource } from './can/simulator.js';
import { SocketCanSource } from './can/socketcan.js';
import { pgConnector } from './logger/pgsync.js';
import type { CanSource } from './can/source.js';
import type { CompiledDatabase } from './decoder.js';

const config = loadConfig();
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

function makeSource(db: CompiledDatabase): CanSource {
  switch (config.canSource) {
    case 'socketcan':
      return new SocketCanSource(config.canIface);
    case 'replay':
      return new ReplaySource(config.replayFile!, config.replaySpeed);
    case 'sim':
      return new SimulatorSource(db);
  }
}

const app = await startApp({
  port: config.port,
  signals: await loadSignals(config.signalsFile),
  warnings: await loadWarnings(config.warningsFile),
  makeSource,
  stateHz: config.stateHz,
  diagHz: config.diagHz,
  logFile: config.logFile,
  logHz: config.logHz,
  logKeepDays: config.logKeepDays,
  pg: config.pgUrl ? { connect: pgConnector(config.pgUrl), device: config.deviceId, intervalMs: config.syncIntervalMs } : undefined,
  overridesFile: config.overridesFile,
  apkFile: config.apkFile,
  log,
});

log(`Giulietta server na portu ${app.port} (WS /ws, CAN izvor: ${config.canSource}, Postgres sync: ${config.pgUrl ? 'da' : 'ne'})`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    log(`${sig} — gasim`);
    await app.stop();
    process.exit(0);
  });
}
