---
name: giulietta
description: Use when working on anything in the Giulietta car computer project — Alfa Romeo Giulietta 940 1.6 JTDm, Raspberry Pi 5 behind the dashboard, CAN bus / OBD / SocketCAN, Node backend, React dashboard on the Android head unit, drive logger (SQLite/Postgres), Vgate/AlfaOBD diagnostics, ignition sense / UPS, ESP32-S3 phone unlock or geofence alarm, relays, GPS/IMU/camera, wiring, ordering parts, choosing the car, chip tuning, or planning the next phase.
---

# Giulietta Car Computer

## Pregled

Autor je Marko Ivanović iz Podgorice. Pravi custom računar u Alfi Romeo Giulietti 940 (1.6 JTDm 77 kW, ručni menjač) koji čita CAN bus, prikazuje podatke na sopstvenom dashboardu i postepeno dobija nove funkcije: dijagnostiku, logovanje vožnji, GPS telemetriju, dashcam, zvučna upozorenja, comfort releje i otključavanje telefonom. Ideja je „programirati auto" stackom koji korisnik već zna: **React, Node.js, Postgres** (plus React Native za telefon).

Izvor istine je `Giulietta-Projekat-Kompletno.docx` u korenu projekta, sa svim zaključcima do 4.10.2026. Stariji `Giulietta-Car-Computer-Projekat-3.docx` je zastareo i ima pogrešne odluke (Pi na stalnom plusu, TVS 24/26A, DS3231, ESP32 koji skenira MAC).

## Arhitektura: četiri dela, namerno razdvojena

Kvar jednog dela ne sme oboriti ostale.

| Deo | Uloga | Kada radi |
|---|---|---|
| **Raspberry Pi 5 4GB** (iza table, headless) | CAN HAT čita bus, Node parsira, WebSocket server, WiFi hotspot `GiuliettaPi`, **USB 4G modem (SIM) deli internet kroz hotspot** | Samo dok je kontakt na **ACC** (UPS premošćava shutdown) |
| **Android head unit** | Samo ekran i audio. Na njemu radi **RN CLI aplikacija `dashboard/`** (APK) koja se kači na Pi WebSocket. Ne zna ništa o CAN-u, zamenljiv je (samo se instalira APK) | Kad je kontakt upaljen |
| **Vgate iCar2 BT 3.0 + AlfaOBD** | Dijagnostika i kodiranje („pitaj auto"). Radi paralelno sa CAN HAT-om („slušaj sve"), ne zamenjuje ga | Po potrebi |
| **ESP32-S3 SuperMini** | Otključavanje telefonom, kasnije možda geofence alarm. Ne zavisi od Pi-ja | Uvek, na stalnih +12V |

```
OBD pin 6/14 -> CAN HAT kanal 0 -> SocketCAN can0 -> CAN reader -> parser (data-driven JSON)
  -> state store -> WebSocket (fiksno 10 Hz + eventi) -> Pi hotspot -> RN CLI app na head unitu
                 -> logger: SQLite lokalno -> sync u Postgres kad ima interneta (4G ili kućni WiFi)
USB 4G modem (HiLink) -> Pi -> NAT kroz hotspot -> head unit/telefoni imaju internet
```

## Odluke (4.10.2026, posle dokumenta)

- **Sve React Native aplikacije su RN CLI (ne Expo).** Dashboard na head unitu je RN CLI app, a telefonska app za ključ je posebna RN CLI app (kasnije). Zajednički tipovi su u `packages/protocol`.
- **Offline-first:** sistem mora raditi identično bez signala i interneta. Internet je dodatak, nikad uslov. Sve je spakovano lokalno (fontovi, zvukovi, mape kao offline fajl), logovi čekaju u redu do sync-a.
- **Internet:** USB 4G modem na Pi-ju (Huawei E3372h-320 HiLink ili sličan, po mogućstvu sa TS9 priključkom za antenu). Pi ga NAT-uje kroz hotspot. Daje live sync logova, Tailscale SSH/deploy sa bilo kog mesta, internet head unitu. Zamenjuje raniju stavku „4G modem ne kupovati" i USB WiFi adapter za kućni sync. Alarm za krađu i dalje ide preko ESP32 + sopstveni SIM (Pi i modem su ugašeni kad auto stoji).
- ESP32 se radi kasnije.

## Trenutni status (ažurirati kad se nešto promeni)

**Auto još nije kupljen.** Korisnik pregleda oglase (CG, Slovenija, Srbija). Kriterijumi i provera su u [reference/car-diagnostics-tuning.md](reference/car-diagnostics-tuning.md).

**Naručeno:**
| Stavka | Datum | Isporuka |
|---|---|---|
| Vgate iCar2 BT 3.0 | 24.08.2026 | bio na carini 01.09. Testirati čim stigne |
| GPS antena, aktivna (2 kom) | 02.10.2026 | 12.–31.10. Proveriti da je SMA muški, ne 16-pin |
| Buck 9–36V → 5V 5A (2 kom) | 02.10.2026 | 12.–31.10. Prednarudžba, stiže poslednji |
| ESP32-S3 SuperMini | 02.10.2026 | 12.–31.10. |
| PC817 optokapler 4ch | 02.10.2026 | 12.–31.10. |

**Nije naručeno (visok prioritet):** Raspberry Pi 5 4GB (EU prodavac: buyzero, Botland, Berrybase, Reichelt), Waveshare 2-CH Isolated CAN HAT, UPS HAT (supercap), Active Cooler. Ostalo je u [reference/hardware.md](reference/hardware.md).

**Faza 0 (softver), urađeno 4.10.2026:**
- `server/`: CAN izvori (sim, replay, socketcan), data-driven dekoder, state store, upozorenja (histereza, debounce, izmena iz app-a uz trajno čuvanje), WebSocket (10 Hz state + 4 Hz diag), **logger** (node:sqlite, vožnja po paljenju) i **PgSync** (idempotentan upload kad ima interneta), `/health`, `/apk`. 46 vitest testova (+1 na pravom PG, preko `PG_TEST_URL`).
- `dashboard/`: RN CLI 0.87 sa tabovima Instrumenti, Dijagnostika i Podešavanja. Zvuk je TurboModule `NativeAlertSound` (ToneGenerator, STREAM_MUSIC). Podešavanja se čuvaju u AsyncStorage-u (adresa, zvuk). Release APK je proveren bez Metroa na AVD `HeadUnit_1024x600`.
- `deploy/`: `giulietta.service`, `setup-pi.sh`, `deploy.sh`, `runtime-package.json`. **Netestirano na Pi-ju.**
- **Sledeće:** ignition watchdog (GPIO17, Faza 4), GPS (gpsd), tune tab, replay alat za Fazu 3 (markeri u logu).

**Trenutni fokus:** Faza 0 je završena. Čeka se hardver (Pi, CAN HAT); u međuvremenu Faza 3 alati i watchdog.

## Faze (radne)

| Faza | Sadržaj | Preduslov |
|---|---|---|
| 0 | Softver: simulirani/virtualni CAN, Node backend, React dashboard. Test Vgate-a | ništa |
| 1 | Stack na stolu: napajanje, OS, CAN loopback, hotspot, systemd, zaštita SD | Pi + HAT-ovi |
| 2 | Pasivno snimanje CAN prometa (Pi na powerbanku) | kupljen auto |
| 3 | Reverse engineering signala | Faza 2 |
| 4 | Trajna instalacija: ACC napajanje, ignition sense, montaža | Faza 3 stabilna |
| 5 | GPS, IMU, kamera, senzori, zvučna upozorenja | Faza 4 |
| 6 | Releji (ULN2803A) za comfort funkcije | sve pre |
| 7 | ESP32-S3 otključavanje telefonom + RN app | nezavisno, može ranije |

Dogovoreni redosled funkcija: **gauge cluster + dijagnostički tab** (koriste se svaki dan), pa **logger**, a kamera i računarski vid kasnije.

Detalji: [phases.md](reference/phases.md) · [software.md](reference/software.md) (backend, frontend, roadmap) · [can-reverse-engineering.md](reference/can-reverse-engineering.md) · [esp32-unlock-alarm.md](reference/esp32-unlock-alarm.md) · [hardware.md](reference/hardware.md) · [car-diagnostics-tuning.md](reference/car-diagnostics-tuning.md)

## Pravila za kod (sažetak, detalji u software.md)

- **CAN source je apstrakcija** sa implementacijama: socketcan (`vcan0`/`can0`), JS simulator i replay `candump -l` loga. Prelaz `vcan0` → `can0` je jedna config vrednost.
- **Parser je data-driven** (JSON u stilu DBC-a: ID → signali sa startBit, length, factor, offset i endianness; Fiat je najčešće big-endian). Dekodiranje se nikad ne hardkoduje.
- **State store** sa poslednjom vrednošću i timestampom. **WebSocket** šalje state na fiksnih 10 Hz, nikad svaki frame, a odvojeno evente (`warning`, CAN status).
- **Logger:** SQLite na Pi-ju, sync u Postgres na kućnom WiFi-ju.
- **Dashboard (RN CLI):** landscape fullscreen, tamna tema, veliki touch targeti, minimum teksta, skaliranje po `useWindowDimensions`, test na 1024×600. Gauge cluster i dijagnostika.
- **Zvuk pušta dashboard app na head unitu** (lokalni fajl) na WebSocket event. Svaki prag ima debounce/histerezu.
- **Ignition watchdog:** GPIO17 sa pull-upom, **LOW = kontakt uključen**. HIGH duže od 5 s znači flush logova, pa `shutdown -h now`.
- **ESP32:** telefon se **povezuje na ESP32** (GATT periferija), a ESP32 šalje nonce. Telefon vraća HMAC-SHA256, ESP32 proverava i RSSI prag i rate limit, pa daje impuls od oko 0,5 s na dugme rezervnog ključa. **Nema skeniranja MAC adresa** (telefoni ih rotiraju). Klijent je React Native (`react-native-ble-plx`). Otključava se dugmetom u aplikaciji, a auto-unlock se ne preporučuje.

## Razvojno okruženje

Windows 10 + VS Code. `vcan`/`socketcan` rade samo na Linuxu, pa na Windowsu backend radi sa simulatorom ili replayem. Za pravi vcan može WSL2 (proveriti `modprobe vcan`). Ciljna platforma je Raspberry Pi OS Lite 64-bit (Bookworm), dashboard je na `http://10.42.0.1:3000` preko hotspota.

## Nepregovaračka pravila

- **Ništa ne ide u auto dok ne radi na stolu.**
- **Ne dira se upravljanje, kočenje, gas ni menjač**, ni preko CAN-a ni preko releja. **Nema CAN injectiona.** Comfort funkcije idu samo relejima paralelno fabričkim prekidačima.
- Remote start i daljinska klima nisu izvodljivi (manuelac, nema pre-conditioninga).
- Paljenje motora telefonom: **NE**.
- Pi je na **ACC**. Sve što mora biti uvek budno ide na ESP32 (budan Pi isprazni akumulator za ~2 dana).
- CAN HAT: **oba termination jumpera OFF**, VIO na 3V3, oscilator pročitan sa kristala.
- Buck se podešava na **5,10–5,15 V pre spajanja**. Pi se napaja preko GPIO 4/6 (ili kroz UPS), uz obavezan osigurač.
- TVS je **SMCJ22A** (ne 24A). Masa ide na fabričku tačku karoserije.
- GPIO samo **3,3V**. ULN2803 **COM na +12V**.
- Plastična kutija, nikako metal.
- Tabela CAN signala se vodi od prvog dana.
- **Pre lemljenja proveriti tabelu zauzetih GPIO pinova** (CAN HAT, UPS, PC817, 1-Wire, I2C, UART).

## Repo

GitHub: https://github.com/sirac007006/Giulietta (javan, grana `main`). Korisnik je svesno izabrao da i `.docx` dokumenti budu javni.

## Saradnja

- Korisnik piše srpski (latinica, ekavica). Dokumenti su ijekavski. Odgovara se na srpskom.
- Kad stigne deo, kupi se auto ili se završi faza, ažurira se „Trenutni status" ovde.
- Najveći rizik je motivacioni (Faza 3 je spora). Prioritet je dashboard koji svakodnevno radi sa RPM-om i brzinom.
- Stvarno nove stvari za korisnika: auto elektrika (masa, +15, BCM), lemljenje i CAN RE. Na tim delovima treba biti detaljniji i oprezniji.
