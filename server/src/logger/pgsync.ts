import type { DriveLog } from './drivelog.js';

/** Minimalni interfejs Postgres klijenta (pg.Client ga zadovoljava; u testovima mock). */
export interface PgLike {
  query(sql: string, params?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
}

export interface SyncStatus {
  lastSyncAt: number | null;
  lastError: string | null;
  uploaded: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY,
  device text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS samples (
  trip_id uuid NOT NULL REFERENCES trips(id),
  ts timestamptz NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (trip_id, ts)
);
CREATE TABLE IF NOT EXISTS events (
  trip_id uuid NOT NULL REFERENCES trips(id),
  ts timestamptz NOT NULL,
  kind text NOT NULL,
  data jsonb,
  PRIMARY KEY (trip_id, ts, kind)
);
`;

const BATCH = 500;

/**
 * Šalje lokalni log u Postgres kad god ima interneta (4G modem ili kućni WiFi).
 * Offline-first: neuspjeh je normalno stanje (tunel, planina) — samo se pokuša ponovo.
 * Upload je idempotentan (ON CONFLICT DO NOTHING), pa prekid usred slanja ne pravi duplikate.
 */
export class PgSync {
  readonly status: SyncStatus = { lastSyncAt: null, lastError: null, uploaded: 0 };
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private schemaReady = false;

  constructor(
    private readonly log: DriveLog,
    private readonly connect: () => Promise<PgLike>,
    private readonly device: string,
    private readonly intervalMs = 30_000,
  ) {}

  start(): void {
    const tick = async () => {
      await this.syncOnce();
      this.timer = setTimeout(tick, this.intervalMs);
    };
    this.timer = setTimeout(tick, 2000);
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  async syncOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    let client: PgLike | undefined;
    try {
      this.log.flush();
      client = await this.connect();
      if (!this.schemaReady) {
        await client.query(SCHEMA);
        this.schemaReady = true;
      }
      for (const t of this.log.trips()) {
        await client.query(
          `INSERT INTO trips (id, device, started_at, ended_at) VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0))
           ON CONFLICT (id) DO UPDATE SET ended_at = EXCLUDED.ended_at`,
          [t.id, this.device, t.started_at, t.ended_at],
        );
      }
      for (;;) {
        const rows = this.log.unsyncedSamples(BATCH);
        if (rows.length === 0) break;
        const params: unknown[] = [];
        const values = rows.map((r, i) => {
          params.push(r.trip_id, r.ts, r.data);
          return `($${i * 3 + 1}, to_timestamp($${i * 3 + 2} / 1000.0), $${i * 3 + 3}::jsonb)`;
        });
        await client.query(`INSERT INTO samples (trip_id, ts, data) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`, params);
        // Redovi su sortirani po (trip, ts) — zadnji ts po vožnji je nova granica.
        const upTo = new Map<string, number>();
        for (const r of rows) upTo.set(r.trip_id, r.ts);
        for (const [trip, ts] of upTo) this.log.markSamplesSynced(trip, ts);
        this.status.uploaded += rows.length;
      }
      for (;;) {
        const rows = this.log.unsyncedEvents(BATCH);
        if (rows.length === 0) break;
        const params: unknown[] = [];
        const values = rows.map((r, i) => {
          params.push(r.trip_id, r.ts, r.kind, r.data);
          return `($${i * 4 + 1}, to_timestamp($${i * 4 + 2} / 1000.0), $${i * 4 + 3}, $${i * 4 + 4}::jsonb)`;
        });
        await client.query(`INSERT INTO events (trip_id, ts, kind, data) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`, params);
        this.log.markEventsSynced(rows);
      }
      this.status.lastSyncAt = Date.now();
      this.status.lastError = null;
      return true;
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.running = false;
      await client?.end().catch(() => {});
    }
  }
}

/** Pravi konektor za pravi Postgres (pg se učitava samo ako je PG_URL podešen). */
export function pgConnector(url: string, timeoutMs = 5000): () => Promise<PgLike> {
  return async () => {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: timeoutMs, statement_timeout: 30_000 });
    await client.connect();
    return client;
  };
}
