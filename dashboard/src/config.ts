import { DEFAULT_PORT, WS_PATH } from '@giulietta/protocol';

/**
 * Adresa Pi-ja. U autu je Pi gateway sopstvenog hotspota (NetworkManager: 10.42.0.1).
 * U Android emulatoru 10.0.2.2 je laptop na kojem vrti `npm run server`.
 * Može se promijeniti u aplikaciji (dugi pritisak na status bar).
 */
export const DEFAULT_HOST = __DEV__ ? '10.0.2.2' : '10.42.0.1';

export const wsUrl = (host: string) => `ws://${host}:${DEFAULT_PORT}${WS_PATH}`;

/** Ručni mjenjač: km/h na 1000 o/min po stepenu (1.6 JTDm, približno; potvrditi u autu). */
export const KMH_PER_1000 = [8.2, 15.1, 23.6, 32.5, 41.0, 49.5];

/** Obrtaji od kojih počinje crvena zona na brojaču (dizel). */
export const REDLINE_RPM = 4250;
export const RPM_MAX = 5000;
