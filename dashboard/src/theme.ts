import { useWindowDimensions } from 'react-native';

// Tamna tema za vožnju noću: skoro crna pozadina, malo boja, boja nosi značenje
// (crvena = kritično, žuta = upozorenje). Kontrast teksta >= 4.5:1 na pozadini.
export const colors = {
  bg: '#05070A',
  surface: '#0D1117',
  surfaceHi: '#151B23',
  hairline: '#212A35',
  text: '#E9EEF3',
  muted: '#8A96A3', // ~6.3:1 na bg
  dim: '#4A5561', // samo za neaktivne/stale vrijednosti i dekoraciju
  accent: '#E4E9EE',
  alfa: '#D0102E', // Alfa crvena — redline i kritično
  warning: '#F5A524',
  info: '#4FA3FF',
  ok: '#3DD68C',
  track: '#1A2129',
} as const;

export const levelColor = { info: colors.info, warning: colors.warning, critical: colors.alfa } as const;

/** Dizajnirano za 1024×600 (najčešći head unit); sve se skalira proporcionalno. */
export const BASE_W = 1024;
export const BASE_H = 600;

export function useScale() {
  const { width, height } = useWindowDimensions();
  const s = Math.min(width / BASE_W, height / BASE_H);
  return { s, width, height, px: (v: number) => Math.round(v * s) };
}

export const mono = { fontVariant: ['tabular-nums' as const] };
