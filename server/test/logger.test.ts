import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DriveLog } from '../src/logger/drivelog.js';
import { PgSync, pgConnector, type PgLike } from '../src/logger/pgsync.js';

const tmpDb = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'giulietta-log-')), 'drive.db');

/** Mock Postgres: pamti upite, može da "pukne" na N-tom upitu (nestanak signala). */
class FakePg implements PgLike {
  queries: { sql: string; params?: unknown[] }[] = [];
  constructor(private failAt = -1) {}
  async query(sql: string, params?: unknown[]) {
    if (this.queries.length === this.failAt) throw new Error('network down');
    this.queries.push({ sql, params });
    return {};
  }
  async end() {}
  sampleRows() {
    return this.queries.filter((q) => q.sql.includes('INSERT INTO samples')).reduce((n, q) => n + q.params!.length / 3, 0);
  }
}

describe('DriveLog', () => {
  it('bilježi samo ne-null vrijednosti i upisuje tek na flush', () => {
    const log = new DriveLog(':memory:', 1000);
    log.addSample(1000, { rpm: 800, speed: null });
    log.addSample(1500, { rpm: null }); // sve null -> preskače se
    expect(log.unsyncedSamples(10)).toHaveLength(0);
    log.flush();
    const rows = log.unsyncedSamples(10);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.data)).toEqual({ rpm: 800 });
  });

  it('nova vožnja na svako pokretanje; nedovršena se zatvara zadnjim uzorkom', () => {
    const file = tmpDb();
    const a = new DriveLog(file, 1000);
    a.addSample(5000, { rpm: 1 });
    a.flush(); // simulira nestanak struje: nema close()
    const b = new DriveLog(file, 9000);
    const trips = b.trips();
    expect(trips).toHaveLength(2);
    expect(trips[0]).toMatchObject({ id: a.tripId, ended_at: 5000 });
    expect(trips[1]).toMatchObject({ id: b.tripId, ended_at: null });
    b.close(10_000);
  });

  it('prune briše samo stare I sinhronizovane uzorke', () => {
    const log = new DriveLog(':memory:', 0);
    const day = 86_400_000;
    log.addSample(1, { a: 1 });
    log.addSample(2, { a: 2 });
    log.addSample(10 * day, { a: 3 });
    log.flush();
    log.markSamplesSynced(log.tripId, 1); // samo prvi poslat
    expect(log.prune(7, 10 * day)).toBe(1);
    expect(log.unsyncedSamples(10).map((r) => r.ts)).toEqual([2, 10 * day]);
  });
});

describe('PgSync', () => {
  it('šalje vožnje, uzorke i događaje, pa ih označi kao poslate', async () => {
    const log = new DriveLog(':memory:', 0);
    for (let i = 1; i <= 1200; i++) log.addSample(i, { rpm: i });
    log.addEvent(5, 'warning', { id: 'x', active: true });
    const pg = new FakePg();
    const sync = new PgSync(log, async () => pg, 'test');
    expect(await sync.syncOnce()).toBe(true);
    expect(pg.queries[0]!.sql).toContain('CREATE TABLE IF NOT EXISTS trips');
    expect(pg.sampleRows()).toBe(1200); // u batch-evima po 500
    expect(pg.queries.filter((q) => q.sql.includes('INSERT INTO samples'))).toHaveLength(3);
    expect(pg.queries.some((q) => q.sql.includes('INSERT INTO events'))).toBe(true);
    expect(log.pendingCount()).toBe(0);
    expect(log.unsyncedEvents(10)).toHaveLength(0);
    expect(sync.status).toMatchObject({ lastError: null, uploaded: 1200 });

    // drugi prolaz: ništa novo za slanje osim upserta vožnje
    const pg2 = new FakePg();
    const sync2 = new PgSync(log, async () => pg2, 'test');
    await sync2.syncOnce();
    expect(pg2.sampleRows()).toBe(0);
  });

  it('prekid usred slanja: ništa se ne gubi, sljedeći pokušaj nastavlja', async () => {
    const log = new DriveLog(':memory:', 0);
    for (let i = 1; i <= 1200; i++) log.addSample(i, { rpm: i });
    // upiti: 0 schema, 1 trip, 2 batch1, 3 batch2 -> puca
    const sync = new PgSync(log, async () => failing, 'test');
    const failing = new FakePg(3);
    expect(await sync.syncOnce()).toBe(false);
    expect(sync.status.lastError).toBe('network down');
    expect(log.pendingCount()).toBe(700); // prvi batch od 500 je prošao

    const ok = new FakePg();
    const sync2 = new PgSync(log, async () => ok, 'test');
    expect(await sync2.syncOnce()).toBe(true);
    expect(ok.sampleRows()).toBe(700);
    expect(log.pendingCount()).toBe(0);
  });

  it('nema konekcije (offline) -> greška u statusu, podaci ostaju lokalno', async () => {
    const log = new DriveLog(':memory:', 0);
    log.addSample(1, { rpm: 1 });
    const sync = new PgSync(log, async () => Promise.reject(new Error('ENOTFOUND')), 'test');
    expect(await sync.syncOnce()).toBe(false);
    expect(sync.status.lastError).toBe('ENOTFOUND');
    expect(log.pendingCount()).toBe(1);
  });
});

// Pravi Postgres: PG_TEST_URL=postgres://user:pass@localhost:5432/giulietta_test npm test
describe.skipIf(!process.env.PG_TEST_URL)('PgSync na pravom Postgresu', () => {
  it('upload i idempotentnost', async () => {
    const log = new DriveLog(':memory:', Date.now());
    const t = Date.now();
    for (let i = 0; i < 50; i++) log.addSample(t + i * 500, { rpm: 800 + i, speed: i });
    log.addEvent(t, 'warning', { id: 'coolant_hot', active: true });
    const connect = pgConnector(process.env.PG_TEST_URL!);
    const sync = new PgSync(log, connect, 'test');
    expect(await sync.syncOnce()).toBe(true);
    expect(sync.status.lastError).toBeNull();
    log.markSamplesSynced(log.tripId, 0); // forsiraj ponovno slanje istih redova
    expect(await sync.syncOnce()).toBe(true);
    const c = await connect();
    const r = (await c.query('SELECT count(*)::int AS n FROM samples WHERE trip_id = $1', [log.tripId])) as { rows: { n: number }[] };
    await c.end();
    expect(r.rows[0]!.n).toBe(50);
  });
});
