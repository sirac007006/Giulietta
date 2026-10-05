import { KMH_PER_1000 } from './config';

/**
 * Stepen prenosa na manuelcu najvjerovatnije nije na busu — računa se iz odnosa brzine i obrtaja.
 * Vraća 'N' kad auto stoji, null kad odnos ne odgovara nijednom stepenu (kvačilo pritisnuto, promjena).
 */
export function estimateGear(speed: number | null, rpm: number | null, tolerance = 0.12): number | 'N' | null {
  if (speed === null || rpm === null) return null;
  if (speed < 3) return 'N';
  if (rpm < 500) return null;
  const ratio = (speed / rpm) * 1000;
  let best: number | null = null;
  let bestErr = Infinity;
  KMH_PER_1000.forEach((r, i) => {
    const err = Math.abs(ratio - r) / r;
    if (err < bestErr) {
      bestErr = err;
      best = i + 1;
    }
  });
  return bestErr <= tolerance ? best : null;
}
