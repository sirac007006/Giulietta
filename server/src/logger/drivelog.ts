import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

/**
 * Lokalni log vožnji (SQLite, ugrađen u Node 22). Radi bez interneta; PgSync ga
 * kasnije šalje u Postgres. Jedna "vožnja" = jedno paljenje Pi-ja (Pi je na ACC-u).
 *
 * Uzorci se drže u memoriji i upisuju u jednoj transakciji svakih flushMs —
 * manje pisanja po SD kartici. Na shutdown se poziva close() koji radi flush.
 */

export interface SampleRow {
  trip_id: string;
  ts: number;
  data: string;
}

export interface EventRow {
  trip_id: string;
  ts: number;
  kind: string;
  data: string;
}

export interface TripRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  synced_ts: number;
}

export class DriveLog {
  private readonly db: DatabaseSync;
  private samples: { ts: number; data: string }[] = [];
  private events: { ts: number; kind: string; data: string }[] = [];
  readonly tripId: string;

  constructor(file: string, now = Date.now()) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        synced_ts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS samples (
        trip_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (trip_id, ts)
      );
      CREATE TABLE IF NOT EXISTS events (
        trip_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        data TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (trip_id, ts, kind)
      );
    `);
    // Vožnje koje nisu uredno zatvorene (nestalo struje prije UPS-a) zatvori zadnjim uzorkom.
    this.db.exec(`
      UPDATE trips SET ended_at = COALESCE((SELECT MAX(ts) FROM samples WHERE trip_id = trips.id), started_at)
      WHERE ended_at IS NULL;
    `);
    this.tripId = randomUUID();
    this.db.prepare('INSERT INTO trips (id, started_at) VALUES (?, ?)').run(this.tripId, now);
  }

  /** Bilježi samo signale koji imaju vrijednost (stale/null se preskače). */
  addSample(ts: number, values: Record<string, number | null>): void {
    const clean: Record<string, number> = {};
    let any = false;
    for (const [k, v] of Object.entries(values)) {
      if (v === null) continue;
      clean[k] = v;
      any = true;
    }
    if (any) this.samples.push({ ts, data: JSON.stringify(clean) });
  }

  addEvent(ts: number, kind: string, data: unknown): void {
    this.events.push({ ts, kind, data: JSON.stringify(data ?? null) });
  }

  flush(): void {
    if (this.samples.length === 0 && this.events.length === 0) return;
    const s = this.db.prepare('INSERT OR IGNORE INTO samples (trip_id, ts, data) VALUES (?, ?, ?)');
    const e = this.db.prepare('INSERT OR IGNORE INTO events (trip_id, ts, kind, data) VALUES (?, ?, ?, ?)');
    this.db.exec('BEGIN');
    try {
      for (const r of this.samples) s.run(this.tripId, r.ts, r.data);
      for (const r of this.events) e.run(this.tripId, r.ts, r.kind, r.data);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.samples = [];
    this.events = [];
  }

  close(now = Date.now()): void {
    this.flush();
    this.db.prepare('UPDATE trips SET ended_at = ? WHERE id = ?').run(now, this.tripId);
    this.db.close();
  }

  // --- za sync ---------------------------------------------------------------

  trips(): TripRow[] {
    return this.db.prepare('SELECT id, started_at, ended_at, synced_ts FROM trips ORDER BY started_at').all() as unknown as TripRow[];
  }

  /** Uzorci koji još nisu poslati, najstariji prvo. */
  unsyncedSamples(limit: number): SampleRow[] {
    return this.db
      .prepare(
        `SELECT s.trip_id, s.ts, s.data FROM samples s JOIN trips t ON t.id = s.trip_id
         WHERE s.ts > t.synced_ts ORDER BY s.trip_id, s.ts LIMIT ?`,
      )
      .all(limit) as unknown as SampleRow[];
  }

  unsyncedEvents(limit: number): EventRow[] {
    return this.db.prepare('SELECT trip_id, ts, kind, data FROM events WHERE synced = 0 ORDER BY ts LIMIT ?').all(limit) as unknown as EventRow[];
  }

  markSamplesSynced(tripId: string, upToTs: number): void {
    this.db.prepare('UPDATE trips SET synced_ts = MAX(synced_ts, ?) WHERE id = ?').run(upToTs, tripId);
  }

  markEventsSynced(rows: EventRow[]): void {
    const st = this.db.prepare('UPDATE events SET synced = 1 WHERE trip_id = ? AND ts = ? AND kind = ?');
    for (const r of rows) st.run(r.trip_id, r.ts, r.kind);
  }

  pendingCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM samples s JOIN trips t ON t.id = s.trip_id WHERE s.ts > t.synced_ts')
      .get() as { n: number };
    return row.n + this.samples.length;
  }

  /** Briše već sinhronizovane uzorke starije od keepDays (SD kartica nije beskonačna). */
  prune(keepDays: number, now = Date.now()): number {
    const cutoff = now - keepDays * 86_400_000;
    const r = this.db
      .prepare('DELETE FROM samples WHERE ts < ? AND ts <= (SELECT synced_ts FROM trips WHERE trips.id = samples.trip_id)')
      .run(cutoff);
    return Number(r.changes);
  }
}
