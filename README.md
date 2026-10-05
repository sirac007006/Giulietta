# Giulietta Car Computer

Raspberry Pi 5 sluša CAN bus Alfe Romeo Giuliette 940 i šalje podatke preko WebSocketa
React Native aplikaciji na Android head unitu. Cijeli plan je u `Giulietta-Projekat-Kompletno.docx`
i u project skillu `.claude/skills/giulietta/`.

## Struktura

| Folder | Šta je |
|---|---|
| `server/` | Node backend (radi na Pi-ju): CAN izvor → parser → state → upozorenja → WebSocket |
| `dashboard/` | React Native CLI aplikacija za head unit (instrumenti + dijagnostika) |
| `packages/protocol/` | Zajednički tipovi (signali, upozorenja, WebSocket poruke) |
| `signals/giulietta.json` | Definicije CAN signala — **jedini fajl koji se mijenja u Fazi 3** |
| `config/warnings.json` | Pragovi upozorenja (histereza + debounce); izmjene iz aplikacije idu u `data/warning-overrides.json` |
| `deploy/` | systemd servis, `setup-pi.sh` (jednom, na Pi-ju), `deploy.sh` (sa laptopa) |
| `data/` | (van git-a) log vožnji `drive.db`, override-i pragova, `dashboard.apk` |

## Pokretanje na laptopu (Windows, bez hardvera)

```bash
npm install                 # u korijenu (server + protocol)
npm run server              # server sa simulatorom vožnje na :3000
npm test                    # testovi servera
```

Dashboard u emulatoru (`HeadUnit_1024x600` AVD, Android 13, 1024×600):

```bash
cd dashboard
npm install
npx react-native start                       # Metro, ostaviti da radi
# u drugom terminalu (PowerShell):
cd dashboard\android; .\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64
adb reverse tcp:8081 tcp:8081
adb shell am start -n com.giuliettadashboard/.MainActivity
```

U emulatoru aplikacija se kači na `10.0.2.2:3000` (laptop), a u autu na `10.42.0.1:3000` (Pi hotspot).
Dugi pritisak na gornju traku mijenja adresu.

## CAN izvori (env `CAN_SOURCE`)

| Vrijednost | Kada |
|---|---|
| `sim` | Default na Windowsu. Simulira vožnju 1.6 JTDm po definicijama iz `signals/` |
| `replay` | `REPLAY_FILE=putanja/candump.log` (+ `REPLAY_SPEED=2`) — pušta snimak iz auta |
| `socketcan` | Default na Linuxu. `CAN_IFACE=can0` (ili `vcan0`) |

Ostalo: `PORT` (3000), `SIGNALS_FILE`, `WARNINGS_FILE`, `STATE_HZ` (10), `DIAG_HZ` (4), `DATA_DIR` (`data/`).

## Log vožnji i Postgres

Svako paljenje = nova vožnja u `data/drive.db` (SQLite ugrađen u Node 22, uzorci 2×/s, upis na 10 s).
Ako je podešen `PG_URL`, log se šalje u Postgres kad god ima interneta (4G ili kućni WiFi);
bez interneta podaci čekaju lokalno. Tabele (`trips`, `samples` sa `jsonb`, `events`) se prave same.

| Env | Default |
|---|---|
| `LOG_FILE` | `data/drive.db` (`off` isključuje) |
| `LOG_HZ` / `LOG_KEEP_DAYS` | 2 / 30 (brišu se samo već poslati uzorci) |
| `PG_URL`, `SYNC_INTERVAL_S`, `DEVICE_ID` | —, 30, `giulietta` |

Test na pravom Postgresu: `PG_TEST_URL=postgres://... npm test`.

## Dashboard aplikacija

Tri taba: **Instrumenti**, **Dijagnostika** (svi CAN ID-jevi, Hz, promijenjeni bajtovi), **Podešavanja**
(pragovi upozorenja → čuvaju se na Pi-ju, zvuk, adresa Pi-ja, stanje loga). Zvuk je native modul
(`AlertSoundModule.kt`, Android ToneGenerator) koji se miješa preko muzike.

Release APK (za head unit, radi bez Metro-a):
```powershell
cd dashboard\android; .\gradlew.bat app:assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

## Pi (netestirano na hardveru — Pi još nije stigao)

```bash
# 1) sa laptopa: pošalji kod
PI=pi@<adresa> bash deploy/deploy.sh
# 2) jednom, na Pi-ju: paketi, config.txt (CAN HAT), hotspot, systemd
HOTSPOT_PASS='...' CAN_OSC=12000000 bash ~/giulietta/deploy/setup-pi.sh && sudo reboot
# kasnije: svaka nova verzija = korak 1 (WITH_APK=1 šalje i APK na :3000/apk)
```
Tajne (`PG_URL`) idu u `/etc/giulietta.env` na Pi-ju.
