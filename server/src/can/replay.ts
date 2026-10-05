import { readFile } from 'node:fs/promises';
import { parseCandump, type CandumpLine } from './candump.js';
import type { CanSource, CanSourceEvents } from './source.js';

/**
 * Pušta snimljeni `candump -l` log sa originalnim tajmingom (ili ubrzano),
 * u petlji. Služi za Fazu 3 (RE kod kuće) i za razvoj bez auta.
 */
export class ReplaySource implements CanSource {
  readonly kind = 'replay' as const;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly file: string,
    private readonly speed = 1,
    private readonly loop = true,
  ) {}

  get iface() {
    return this.file;
  }

  async start(events: CanSourceEvents): Promise<void> {
    const frames = parseCandump(await readFile(this.file, 'utf8'));
    if (frames.length === 0) {
      events.onState('error', `Nema validnih linija u ${this.file}`);
      return;
    }
    this.stopped = false;
    events.onState('up');
    this.play(frames, events);
  }

  private play(frames: CandumpLine[], events: CanSourceEvents) {
    const t0Log = frames[0]!.ts;
    const t0Wall = Date.now();
    let i = 0;
    const tick = () => {
      if (this.stopped) return;
      const elapsedLog = (Date.now() - t0Wall) * this.speed;
      while (i < frames.length && frames[i]!.ts - t0Log <= elapsedLog) {
        const f = frames[i++]!;
        events.onFrame({ id: f.id, data: f.data, ts: Date.now() });
      }
      if (i >= frames.length) {
        if (!this.loop) {
          events.onState('down');
          return;
        }
        this.play(frames, events);
        return;
      }
      const wait = (frames[i]!.ts - t0Log - elapsedLog) / this.speed;
      this.timer = setTimeout(tick, Math.max(1, Math.min(wait, 50)));
    };
    tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
