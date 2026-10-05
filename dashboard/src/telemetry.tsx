import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientMessage, DiagFrame, ServerMessage, SignalMeta, WarningInfo, WarningLevel } from '@giulietta/protocol';
import { wsUrl } from './config';
import { useSettings } from './settings';

export type ConnState = 'connecting' | 'open' | 'closed';

type StateMsg = Extract<ServerMessage, { t: 'state' }>;

export interface WarningEvent {
  id: string;
  label: string;
  level: WarningLevel;
  active: boolean;
  sound?: string;
  at: number;
}

interface Telemetry {
  host: string;
  conn: ConnState;
  signals: Record<string, SignalMeta>;
  /** Pragovi upozorenja kako ih Pi trenutno koristi. */
  warningDefs: WarningInfo[];
  state: StateMsg | null;
  diag: DiagFrame[];
  lastWarningEvent: WarningEvent | null;
  setDiagSubscribed(on: boolean): void;
  setWarning(id: string, on: number, off: number): void;
}

const Ctx = createContext<Telemetry | null>(null);

/**
 * Jedna WebSocket konekcija ka Pi-ju za cijelu aplikaciju. Sama se ponovo kači
 * (Pi se diže 30-60 s nakon kontakta, WiFi u autu zna da pukne).
 */
export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const { host, loaded } = useSettings();
  const [conn, setConn] = useState<ConnState>('connecting');
  const [signals, setSignals] = useState<Record<string, SignalMeta>>({});
  const [warningDefs, setWarningDefs] = useState<WarningInfo[]>([]);
  const [state, setState] = useState<StateMsg | null>(null);
  const [diag, setDiag] = useState<DiagFrame[]>([]);
  const [lastWarningEvent, setLastWarningEvent] = useState<WarningEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const diagWanted = useRef(false);

  const send = useCallback((m: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  useEffect(() => {
    if (!loaded) return; // čekaj sačuvanu adresu, da se ne kači prvo na pogrešnu
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    // Ako server ništa ne pošalje ovoliko dugo, konekcija je mrtva (state stiže 10x u sekundi).
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setConn('connecting');
      const ws = new WebSocket(wsUrl(host));
      wsRef.current = ws;
      const kick = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => ws.close(), 3000);
      };
      ws.onopen = () => {
        attempt = 0;
        setConn('open');
        kick();
        if (diagWanted.current) ws.send(JSON.stringify({ t: 'sub', diag: true } satisfies ClientMessage));
      };
      ws.onmessage = (ev) => {
        kick();
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        switch (msg.t) {
          case 'hello':
            setSignals(Object.fromEntries(msg.signals.map((s) => [s.name, s])));
            setWarningDefs(msg.warnings);
            break;
          case 'state':
            setState(msg);
            break;
          case 'diag':
            setDiag(msg.frames);
            break;
          case 'warning':
            setLastWarningEvent({ id: msg.id, label: msg.label, level: msg.level, active: msg.active, sound: msg.sound, at: Date.now() });
            break;
        }
      };
      ws.onclose = () => {
        clearTimeout(watchdog);
        if (wsRef.current === ws) wsRef.current = null;
        setConn('closed');
        if (closedByUs) return;
        const delay = Math.min(5000, 500 * 2 ** attempt++);
        retry = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        // onclose slijedi i radi reconnect
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      clearTimeout(watchdog);
      wsRef.current?.close();
    };
  }, [host, loaded]);

  const setDiagSubscribed = useCallback(
    (on: boolean) => {
      diagWanted.current = on;
      send({ t: 'sub', diag: on });
      if (!on) setDiag([]);
    },
    [send],
  );

  const setWarning = useCallback((id: string, on: number, off: number) => send({ t: 'setWarning', id, on, off }), [send]);

  const value = useMemo<Telemetry>(
    () => ({ host, conn, signals, warningDefs, state, diag, lastWarningEvent, setDiagSubscribed, setWarning }),
    [host, conn, signals, warningDefs, state, diag, lastWarningEvent, setDiagSubscribed, setWarning],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTelemetry(): Telemetry {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTelemetry van TelemetryProvider-a');
  return t;
}

/** Vrijednost signala ili null (nema veze, stale ili nepoznat signal). */
export function useSignal(name: string): number | null {
  const { state, conn } = useTelemetry();
  if (conn !== 'open' || !state) return null;
  return state.values[name] ?? null;
}
