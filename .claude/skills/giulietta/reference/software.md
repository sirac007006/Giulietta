# Softver: arhitektura, pravila, roadmap

Stack: **Node.js** (backend na Pi-ju), **React Native CLI** (dashboard app na head unitu, APK), **SQLite** (lokalni log) i **Postgres** (kućni server), **React Native** (telefon za ESP32), **ESP32 firmware** (Arduino/ESP-IDF + NimBLE).

## Struktura repoa
| Putanja | Sadržaj |
|---|---|
| `server/src/can/` | `source.ts` (interfejs), `simulator.ts` (DriveModel + šum ID-jevi), `replay.ts`, `socketcan.ts`, `candump.ts` (parse/format `candump -l`) |
| `server/src/decoder.ts` | extract/insert bitova, decode/encode po definicijama |
| `server/src/state.ts`, `warnings.ts`, `ws.ts`, `app.ts`, `config.ts`, `index.ts` | state store, upozorenja, WS hub, povezivanje, env config |
| `packages/protocol/src/index.ts` | tipovi signala, upozorenja i WS poruka (`hello`, `state`, `diag`, `warning`; klijent: `sub`). Konvencija bitova je dokumentovana ovde |
| `signals/giulietta.json` | definicije (trenutno IZMIŠLJENE) |
| `config/warnings.json` | pragovi |
| `dashboard/src/` | `telemetry.tsx` (WS context, reconnect, watchdog 3 s), `screens/`, `components/`, `gear.ts`, `theme.ts` (skaliranje sa 1024×600) |

**Konvencija bitova:** `big`: bit 0 = MSB bajta 0, broji se sleva nadesno (startBit 0 / length 16 = `b0<<8|b1`). `little`: Intel (bit 0 = LSB bajta 0). Motorola startBit iz DBC/opendbc se mora preračunati.

**Komande:** `npm run server` (sim), `npm test`, `npm run build -w server`. Dashboard: Metro `npx react-native start`, build `android\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64` (CLI `run-android` ne nalazi gradlew iz Git Bash-a), `adb reverse tcp:8081 tcp:8081`.

## Backend (Pi)

| Sloj | Uloga |
|---|---|
| CAN source | Interfejs sa 3 implementacije: `socketcan` (npm, Linux `vcan0`/`can0`), **simulator** (JS, radi na Windowsu, generiše realistične frameove po definicijama), **replay** (`candump -l` log, za Fazu 3 i testove) |
| Parser | ID + bajtovi → imenovane vrednosti, iz JSON definicija. Jedini fajl koji se menja u Fazi 3 |
| State store | Poslednja vrednost i timestamp po signalu |
| WebSocket server | State na fiksnih 10 Hz plus eventi (`warning`, CAN status, startup/shutdown) |
| HTTP | `/health`, kasnije `/apk` za update dashboarda. Port 3000, WS na `/ws` |
| Logger | SQLite lokalno, sync u Postgres kad ima interneta (4G ili kućni WiFi) |
| Ignition watchdog | GPIO17, LOW = ON. Ako je HIGH duže od 5 s: flush, pa shutdown |
| (kasnije) GPS | gpsd socket |

Definicija signala (vrednosti su izmišljene dok ih Faza 3 ne otkrije):
```json
{
  "0x3E8": {
    "name": "engine_data",
    "signals": [
      { "name": "rpm",  "startBit": 0,  "length": 16, "factor": 0.25, "offset": 0 },
      { "name": "temp", "startBit": 16, "length": 8,  "factor": 1,    "offset": -40 }
    ]
  }
}
```
Dodati `endianness` (Fiat je najčešće big-endian/Motorola) i opciono `unit`, `min`, `max`.

## Frontend (RN CLI app `dashboard/`, head unit)
- Landscape, fullscreen (immersive), pokreće se sa head unitom. WS adresa: `ws://10.42.0.1:3000/ws` (u emulatoru `10.0.2.2`).
- Zvuk preko native biblioteke (nema autoplay problema).
- Glavni ekran je **gauge cluster**, drugi tab je **dijagnostika** (raw frameovi, ID-jevi sa frekvencijom, highlight promenjenih bajtova kao cansniffer, CAN status).
- Tamna tema. **Veliki touch targeti, minimum teksta** (gleda se u vožnji). skaliranje po `useWindowDimensions`, test na **1024×600** (emulator).
- Lažni podaci dok nema hardvera (sinusoida za RPM).
- **Zvuk:** na `warning` event app pusti lokalni zvuk. Android miksuje preko muzike.
- Upozorenja: prekoračenje brzine (prag korisnika), previsoki obrtaji / shift indicator, temperatura rashladne tečnosti, nizak nivo goriva, potvrda CAN konekcije, startup/shutdown zvuk, potvrda zaključavanja. **Debounce/histereza na svakom pragu.**
- Pi se nikad ne kači direktno na fabričke zvučnike (dva pojačavača na istoj zavojnici).

## Roadmap funkcija (dogovoreni redosled)
| # | Funkcija | Napomena | Treba |
|---|---|---|---|
| 1 | Live gauge cluster | RPM, brzina, temperature, boost, EGT, gas, gorivo (šta se nađe na busu) | F1–3 |
| 2 | Dijagnostički tab | Greške, DPF, EGR, rail pressure. Deo preko Vgate/AlfaOBD, deo iz dekodiranih signala | Vgate, F3 |
| 3 | Performance meter | 0–100, GPS lap timer, track mode sa sektorima, G-G dijagram | GPS, IMU |
| 4 | Drive logger | SQLite → Postgres sync | F4 |
| 5 | Dashcam | Loop, overlay CAN podataka, IMU detekcija sudara čuva klip | Kamera, IMU |
| 6 | Računarski vid | Lane detection (Canny + Hough), znakovi (TFLite CNN), rastojanje | Kamera |
| 7 | Digitalni ključ | ESP32-S3 + RN app | F7 |
| 8 | Glasovna kontrola | Whisper/Vosk lokalno | Mikrofon |

Dodatne ideje: prediktivno održavanje (trendovi temperature, napona, DPF regeneracija), zaštita hladnog starta (upozorenje na visoke obrtaje dok motor nije zagrejan), trip kompjuter iz duty cycle-a injektora, eco/driving score, geofence alarm, foto okoline pri gašenju, black box izvoz logova za servis, shift indicator, monitor akumulatora (INA219), **tune tab** (EGT < ~750 °C, boost, temperatura usisa).

Stepen prenosa na manuelcu verovatno nije na busu, pa se računa iz odnosa RPM/brzina.

## Razvoj na Windowsu
`socketcan` se ne builduje na Windowsu, pa se učitava uslovno (dynamic import samo kad je izvor `socketcan`). Lokalno se koristi simulator ili replay. Deploy ide na Pi (SSH, systemd `dashboard.service`).
