import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_HOST } from './config';

// Podešavanja head unita koja preživljavaju restart aplikacije.
// (Pragovi upozorenja se čuvaju na Pi-ju, ne ovdje — vidi setWarning.)

export interface Settings {
  host: string;
  soundOn: boolean;
}

const KEY = 'giulietta.settings.v1';
const DEFAULTS: Settings = { host: DEFAULT_HOST, soundOn: true };

interface Ctx extends Settings {
  loaded: boolean;
  update(patch: Partial<Settings>): void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setSettings({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...settings, loaded, update }), [settings, loaded, update]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('useSettings van SettingsProvider-a');
  return c;
}
