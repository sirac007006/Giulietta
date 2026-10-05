# Faza 7: otključavanje telefonom (ESP32-S3) + geofence alarm

Nezavisan podsistem bez Pi-ja. ESP32-S3 SuperMini je naručen 02.10.2026.

| | Pi 5 | ESP32-S3 |
|---|---|---|
| Budan | samo na kontakt | uvek |
| Kad auto stoji | ~250 mA, akumulator prazan za par dana | deep sleep 10–20 µA bez BLE-a. Uz BLE spreman za konekciju **realno nekoliko mA** |
| Buđenje | 30–60 s | ms |

S3 i C3 rade isti posao i koriste isti kod.

## Protokol (ISPRAVLJENA verzija)
Pasivno skeniranje MAC-a **ne radi**, jer iOS i Android rotiraju BLE MAC (~15 min). Zato se **telefon povezuje na ESP32**:
```
Telefon (React Native, react-native-ble-plx)
  1. konekcija na ESP32 (ESP32 oglašava GATT servis)
ESP32 -> slučajan nonce
  2. telefon vrati HMAC-SHA256(nonce, tajni ključ) + komandu
ESP32 proveri potpis + RSSI prag (~-60 dBm) + rate limit
  3. OK -> GPIO impuls ~0,5 s -> dugme LOCK ili UNLOCK
```
- Svaki put je drugi nonce, pa nema replaya. Nikad otvorena karakteristika koju svako može okinuti iz nRF Connect-a.
- BLE pairing/bonding samo sa korisnikovim telefonom.
- Web Bluetooth radi na Androidu, ali ne na iOS-u, pa je klijent RN app.
- **Dugme u aplikaciji** je preporučeni način. Auto-unlock pri približavanju je moguć, ali je najranjiviji na relay attack.

## Veza sa autom
**Preporučeno: rezervni ključ.** ESP32 izlazi (PC817 kanali ili mali NPN tranzistori) idu paralelno kontaktima dugmadi LOCK i UNLOCK. Ne dira se nijedna žica auta i sve je reverzibilno.
- **Transponder:** iz ključa koji ostaje u autu izvaditi transponder imobilajzera (ili koristiti samo pločicu daljinskog) i dobro ga sakriti.
- Baterija daljinskog: napajanje sa ESP32 3,3V ili redovna zamena.
- Alternativa: relej (ULN2803 + auto relej) na žicu centralne brave. Prvo izmeriti da li brava reaguje na impuls mase ili plusa. Rizičnije.

## Hardver i napajanje
ESP32-S3 SuperMini (USB-C, lemni pinovi), 2 izlaza (lock/unlock), mali buck 12V → 5V na **granu B** (stalni +12V, fuse tap #2, 2A).
Na ~5 mA potrošnja je ~0,12 Ah dnevno. Odlemiti power LED, izmeriti prosek multimetrom tokom nekoliko sati, a za duže parkiranje postoji skriveni prekidač za celu granu.

## Bezbednost
| Upotreba | Ocena |
|---|---|
| Dodatak ključu, dugme u app-u | Prihvatljivo |
| Auto-unlock | Udobno, najranjivije (relay attack) |
| Zamena za ključ | Ne |
| Paljenje motora | **NE**. Ako ikad: drugi faktor (PIN na dashboardu ili skriveni prekidač) |

Ključ ostaje primarni način ulaska.

## Redosled
1. Sto: ESP32 kao BLE periferija, telefon šalje komandu, **LED** umesto izlaza.
2. Challenge-response + RSSI, test iz ruke i iz druge sobe.
3. Merenje potrošnje tokom nekoliko sati.
4. Spajanje na rastavljeni rezervni ključ, test na stolu.
5. Tek onda auto, grana B.

## Geofence alarm (opciono)
Ako se auto pomeri van radijusa, a telefon nije blizu, stiže poruka sa lokacijom. Pi ne može (3–4 W u mirovanju, akumulator prazan za ~2 dana), pa je to zaseban sistem: **ESP32 + SIM modul + MPU6050** (~25 €, ~2 mA). MPU6050 budi ESP32 (wake-on-motion), ESP32 proveri da li je telefon blizu, pa šalje SMS ili Telegram. Isti ESP32-S3 može raditi i bravu.
| Kanal | + | − |
|---|---|---|
| SMS (AT) | radi na slabom signalu, bez data paketa | samo tekst/koordinate |
| Telegram bot | besplatno, Maps link | treba mobilni internet |

Moduli: SIM7600E-H 4G (~50–60 €, ima i GPS) ili SIM800L 2G (~5 €, proveriti da li m:tel i One gase 2G).
