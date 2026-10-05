import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { WS_PATH, type ClientMessage, type ServerMessage } from '@giulietta/protocol';

interface Client {
  ws: WebSocket;
  diag: boolean;
  alive: boolean;
}

/** WebSocket hub: drži klijente (head unit, telefon za debug) i šalje im poruke. */
export class Hub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(
    server: Server,
    onConnect: (send: (m: ServerMessage) => void) => void,
    onMessage: (msg: ClientMessage) => void = () => {},
  ) {
    this.wss = new WebSocketServer({ server, path: WS_PATH });
    this.wss.on('connection', (ws) => {
      const client: Client = { ws, diag: false, alive: true };
      this.clients.add(client);
      ws.on('pong', () => (client.alive = true));
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as ClientMessage;
          if (msg.t === 'sub') client.diag = Boolean(msg.diag);
          else onMessage(msg);
        } catch {
          // ignoriši neispravne poruke
        }
      });
      ws.on('close', () => this.clients.delete(client));
      ws.on('error', () => this.clients.delete(client));
      onConnect((m) => send(ws, m));
    });
    // WiFi u autu zna da "zamrzne" konekciju bez close-a; ping čisti mrtve klijente.
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.ws.terminate();
          this.clients.delete(c);
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 5000);
  }

  get size() {
    return this.clients.size;
  }

  broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const c of this.clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }

  broadcastDiag(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const c of this.clients) if (c.diag && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }

  hasDiagSubscribers(): boolean {
    for (const c of this.clients) if (c.diag) return true;
    return false;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.ws.terminate();
    this.wss.close();
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
