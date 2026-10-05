import type { CanLinkState, CanSourceKind } from '@giulietta/protocol';

export interface CanFrame {
  id: number;
  data: Uint8Array;
  /** ms (Date.now() domen). */
  ts: number;
}

export interface CanSourceEvents {
  onFrame(frame: CanFrame): void;
  onState(state: CanLinkState, error?: string): void;
}

/**
 * Apstrakcija izvora CAN podataka. Ostatak servera ne zna da li frameovi
 * dolaze iz auta (socketcan), iz simulatora ili iz snimljenog loga.
 */
export interface CanSource {
  readonly kind: CanSourceKind;
  readonly iface?: string;
  start(events: CanSourceEvents): Promise<void>;
  stop(): Promise<void>;
}
