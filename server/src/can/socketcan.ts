import type { CanSource, CanSourceEvents } from './source.js';

// Minimalni tipovi za npm paket "socketcan" (nema svoje).
interface RawChannel {
  addListener(event: 'onMessage', cb: (msg: { id: number; data: Buffer; ext?: boolean; rtr?: boolean }) => void): void;
  addListener(event: 'onStopped', cb: () => void): void;
  start(): void;
  stop(): void;
}
interface SocketCanModule {
  createRawChannel(iface: string, timestamps?: boolean): RawChannel;
}

/**
 * Pravi CAN preko Linux SocketCAN-a (vcan0 na laptopu/WSL-u, can0 na Pi-ju).
 * Interfejs mora već biti podignut (`ip link set can0 up type can bitrate 500000`),
 * što na Pi-ju radi ExecStartPre u dashboard.service.
 *
 * Samo sluša — ovaj sistem NIKAD ne šalje ništa na bus auta.
 */
export class SocketCanSource implements CanSource {
  readonly kind = 'socketcan' as const;
  private channel: RawChannel | undefined;

  constructor(readonly iface: string) {}

  async start(events: CanSourceEvents): Promise<void> {
    let mod: SocketCanModule;
    try {
      // Dinamički import: paket je native i postoji samo na Linuxu (optionalDependency).
      const imported = (await import('socketcan')) as unknown as SocketCanModule & { default?: SocketCanModule };
      mod = imported.default ?? imported;
    } catch (err) {
      events.onState('error', `Paket "socketcan" nije dostupan (radi samo na Linuxu): ${String(err)}`);
      return;
    }
    try {
      this.channel = mod.createRawChannel(this.iface, true);
    } catch (err) {
      events.onState('error', `Ne mogu otvoriti ${this.iface}: ${String(err)} — je li interfejs podignut?`);
      return;
    }
    this.channel.addListener('onMessage', (msg) => {
      if (msg.rtr) return;
      events.onFrame({ id: msg.id, data: new Uint8Array(msg.data), ts: Date.now() });
    });
    this.channel.addListener('onStopped', () => events.onState('down'));
    this.channel.start();
    events.onState('up');
  }

  async stop(): Promise<void> {
    this.channel?.stop();
    this.channel = undefined;
  }
}
