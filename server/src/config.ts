import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, type CanSourceKind, type SignalDatabase, type WarningDef } from '@giulietta/protocol';

// Sva podešavanja preko env varijabli, sa razumnim default-ima.
// Prelazak sa simulatora na auto = CAN_SOURCE=socketcan (CAN_IFACE=can0 je default).

const here = path.dirname(fileURLToPath(import.meta.url));
// src/ (dev, tsx) i dist/ (build) su oba jedan nivo ispod server/
const repoRoot = path.resolve(here, '..', '..');

export interface Config {
  port: number;
  canSource: CanSourceKind;
  canIface: string;
  replayFile: string | undefined;
  replaySpeed: number;
  signalsFile: string;
  warningsFile: string;
  stateHz: number;
  diagHz: number;
  /** undefined = logovanje isključeno (LOG_FILE=off). */
  logFile: string | undefined;
  logHz: number;
  logKeepDays: number;
  pgUrl: string | undefined;
  syncIntervalMs: number;
  deviceId: string;
  overridesFile: string;
  apkFile: string;
}

export function loadConfig(env = process.env): Config {
  const canSource = (env.CAN_SOURCE ?? (process.platform === 'linux' ? 'socketcan' : 'sim')) as CanSourceKind;
  if (!['socketcan', 'sim', 'replay'].includes(canSource)) throw new Error(`CAN_SOURCE mora biti socketcan|sim|replay, ne "${canSource}"`);
  if (canSource === 'replay' && !env.REPLAY_FILE) throw new Error('CAN_SOURCE=replay traži REPLAY_FILE=putanja/do/candump.log');
  return {
    port: Number(env.PORT ?? DEFAULT_PORT),
    canSource,
    canIface: env.CAN_IFACE ?? 'can0',
    replayFile: env.REPLAY_FILE,
    replaySpeed: Number(env.REPLAY_SPEED ?? 1),
    signalsFile: env.SIGNALS_FILE ?? path.join(repoRoot, 'signals', 'giulietta.json'),
    warningsFile: env.WARNINGS_FILE ?? path.join(repoRoot, 'config', 'warnings.json'),
    stateHz: Number(env.STATE_HZ ?? 10),
    diagHz: Number(env.DIAG_HZ ?? 4),
    logFile: env.LOG_FILE === 'off' ? undefined : (env.LOG_FILE ?? path.join(dataDir(env), 'drive.db')),
    logHz: Number(env.LOG_HZ ?? 2),
    logKeepDays: Number(env.LOG_KEEP_DAYS ?? 30),
    pgUrl: env.PG_URL || undefined,
    syncIntervalMs: Number(env.SYNC_INTERVAL_S ?? 30) * 1000,
    deviceId: env.DEVICE_ID ?? 'giulietta',
    overridesFile: path.join(dataDir(env), 'warning-overrides.json'),
    apkFile: path.join(dataDir(env), 'dashboard.apk'),
  };
}

/** Promjenljivi podaci (log, override-i, APK) — van git-a. */
const dataDir = (env: NodeJS.ProcessEnv) => env.DATA_DIR ?? path.join(repoRoot, 'data');

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

export const loadSignals = (file: string) => readJson<SignalDatabase>(file);
export const loadWarnings = (file: string) => readJson<WarningDef[]>(file);
