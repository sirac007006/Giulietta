import { useEffect, useRef } from 'react';
import NativeAlertSound from '../specs/NativeAlertSound';
import { useSettings } from './settings';
import { useTelemetry } from './telemetry';

export type SoundKind = 'critical' | 'warning' | 'info' | 'shift' | 'connect';

export function playSound(kind: SoundKind | string): void {
  // Modul ne postoji u Jest-u ili na platformi bez native dijela — tišina umjesto pada.
  NativeAlertSound?.play(kind);
}

/** Pušta zvuk kad se upozorenje upali i kad se CAN prvi put poveže. */
export function useAlertSounds(): void {
  const { lastWarningEvent, state, conn } = useTelemetry();
  const { soundOn } = useSettings();
  const lastAt = useRef(0);
  const canWasUp = useRef(false);

  useEffect(() => {
    const ev = lastWarningEvent;
    if (!ev || ev.at === lastAt.current) return;
    lastAt.current = ev.at;
    if (soundOn && ev.active) playSound(ev.sound ?? ev.level);
  }, [lastWarningEvent, soundOn]);

  const canUp = conn === 'open' && state?.can.state === 'up';
  useEffect(() => {
    if (canUp && !canWasUp.current && soundOn) playSound('connect');
    canWasUp.current = canUp;
  }, [canUp, soundOn]);
}
