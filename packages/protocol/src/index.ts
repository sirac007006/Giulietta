// Zajednički tipovi za server (Pi) i dashboard (head unit).
// Nema runtime zavisnosti — samo tipovi i par konstanti, da ga Metro i Node koriste direktno.

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 3000;
export const WS_PATH = '/ws';

// ---------------------------------------------------------------------------
// Definicije signala (signals/*.json)
// ---------------------------------------------------------------------------

/**
 * Konvencija numeracije bitova (bitno za Fazu 3):
 * - "big"    (Motorola, Fiat najčešće): payload se čita kao jedan niz bitova sleva nadesno;
 *            bit 0 = MSB bajta 0, bit 7 = LSB bajta 0, bit 8 = MSB bajta 1...
 *            Primer: startBit 0, length 16  =>  (b0 << 8) | b1
 * - "little" (Intel): bit 0 = LSB bajta 0, bit 8 = LSB bajta 1... (isto kao Intel u DBC-u)
 *            Primer: startBit 0, length 16  =>  (b1 << 8) | b0
 * Pažnja: Motorola startBit u DBC fajlovima (opendbc) koristi drugačiju numeraciju —
 * pri uvozu iz DBC-a mora se preračunati.
 */
export type Endianness = 'big' | 'little';

export interface SignalDef {
  /** Jedinstveno ime u cijelom sistemu, snake_case (npr. "rpm", "coolant_temp"). */
  name: string;
  startBit: number;
  length: number;
  endianness?: Endianness; // default "big"
  signed?: boolean; // default false (two's complement ako je true)
  factor?: number; // default 1
  offset?: number; // default 0
  unit?: string;
  min?: number;
  max?: number;
  label?: string;
}

export interface MessageDef {
  name: string;
  /** Očekivani DLC; ako frame stigne kraći, signali van opsega se preskaču. */
  length?: number;
  /** Nakon koliko ms bez frame-a signali ovog ID-ja postaju "stale". Default 1000. */
  staleMs?: number;
  signals: SignalDef[];
}

export interface SignalDatabase {
  _note?: string;
  /** Ključ je CAN ID u hex formatu, npr. "0x3E8". */
  messages: Record<string, MessageDef>;
}

/** Metapodaci o signalu koje server šalje klijentu (za labele, opsege, jedinice). */
export interface SignalMeta {
  name: string;
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  canId: number;
}

// ---------------------------------------------------------------------------
// Upozorenja (config/warnings.json)
// ---------------------------------------------------------------------------

export type CompareOp = '>' | '<';
export type WarningLevel = 'info' | 'warning' | 'critical';

export interface WarningCondition {
  signal: string;
  op: CompareOp;
  value: number;
}

export interface WarningDef {
  id: string;
  label: string;
  level: WarningLevel;
  signal: string;
  op: CompareOp;
  /** Prag za aktivaciju. */
  on: number;
  /** Prag za deaktivaciju (histereza). Za ">" mora biti <= on, za "<" >= on. */
  off: number;
  /** Uslov mora trajati ovoliko ms prije aktivacije/deaktivacije (debounce). */
  delayMs?: number;
  /** Dodatni uslov koji mora važiti istovremeno (npr. motor hladan). */
  and?: WarningCondition;
  /** Ime zvuka u dashboard aplikaciji. */
  sound?: string;
}

// ---------------------------------------------------------------------------
// WebSocket poruke
// ---------------------------------------------------------------------------

export type CanSourceKind = 'socketcan' | 'sim' | 'replay';
export type CanLinkState = 'up' | 'down' | 'error';

export interface CanStatus {
  source: CanSourceKind;
  iface?: string;
  state: CanLinkState;
  /** Ukupno frameova u sekundi. */
  fps: number;
  error?: string;
}

/** Stanje loggera vožnji i sinhronizacije sa Postgresom. */
export interface LogStatus {
  tripId: string;
  /** Uzorci koji još nisu poslati u Postgres. */
  pending: number;
  /** null = sync nije podešen (nema PG_URL). */
  sync: { lastSyncAt: number | null; lastError: string | null } | null;
}

/** Ono što klijent smije da vidi i mijenja na upozorenju. */
export type WarningInfo = Pick<WarningDef, 'id' | 'label' | 'level' | 'signal' | 'op' | 'on' | 'off'>;

export interface ActiveWarning {
  id: string;
  label: string;
  level: WarningLevel;
  since: number;
}

export interface DiagFrame {
  id: number;
  /** Hex bajtovi, npr. "0F A0 00 12". */
  data: string;
  /** Bitmaska bajtova koji su se promijenili od zadnjeg diag paketa (bit i = bajt i). */
  changed: number;
  count: number;
  hz: number;
  /** ms od zadnjeg frame-a. */
  age: number;
  known: boolean;
}

export type ServerMessage =
  | {
      t: 'hello';
      version: number;
      signals: SignalMeta[];
      warnings: WarningInfo[];
    }
  | {
      t: 'state';
      ts: number;
      /** null = signal je stale ili još nije primljen. */
      values: Record<string, number | null>;
      can: CanStatus;
      warnings: ActiveWarning[];
      log?: LogStatus;
    }
  | { t: 'diag'; ts: number; frames: DiagFrame[] }
  | { t: 'warning'; id: string; label: string; level: WarningLevel; active: boolean; sound?: string };

export type ClientMessage =
  | { t: 'sub'; diag: boolean }
  /** Promjena praga upozorenja (npr. ograničenje brzine). Server je trajno pamti. */
  | { t: 'setWarning'; id: string; on: number; off: number };
