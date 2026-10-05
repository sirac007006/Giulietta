# Hardver: delovi, šeme, pinout, nabavka

## Jezgro sistema

| Komponenta | Uloga | Na šta paziti |
|---|---|---|
| Raspberry Pi 5 **4GB** | OS, Node, CAN parser, hotspot | 4GB je dovoljno (headless, rendering radi head unit), 8GB je bacanje para. NE AliExpress (166–170 €). EU: buyzero (~119 €), Botland, Berrybase, Reichelt. rpilocator prati samo MSRP zalihe |
| Active Cooler (klon OK) | PWM ventilator | 4-pin PWM konektor. Ide u 2 namenske rupe, ugaone ostaju za standoffe. Uzeti 2 (ležaj pati na 60–70 °C). Zvanični je ~11 mm visok, klon verovatno viši |
| Waveshare 2-CH Isolated CAN HAT | 2× MCP2515, galvanski izolovan | Kanal 0 = CAN-C sa OBD-a, kanal 1 = Body CAN kasnije. **Oba 120 Ω jumpera OFF, VIO na 3V3.** CAN 2.0B (ne FD). ~20 € |
| UPS HAT (supercap poželjan) | 20–30 s posle gašenja kontakta za čist shutdown | Li-ion leti u tabli nabubri. Proveriti fizičko slaganje sa CAN HAT-om (CAN = SPI, UPS = I2C). Ako UPS ima sopstveni ulaz, buck ide u UPS |
| Industrial microSD (pSLC, A2) | Sistem | Swissbit, Kingston Industrial, SanDisk Industrial, iz EU (na Aliju su česti falsifikati). Kasnije, korisnikova odluka |
| 2×20 stacking header | HAT iznad coolera | **Raster 2.54 mm** (ne 1.27). Plastika 15–20 mm, bar 3 mm više od coolera. Kupuje se tek kad se izmeri cooler; ako ima sumnje, uzeti viši |
| M2.5 standoff kit | Drži HAT-ove | M2.5, ne M2. Miks visina |
| Pi 5 RTC baterija (J5) | Pi pamti vreme kad je ugašen | ~5 €. Zamenjuje DS3231 |

## Napajanje i zaštita

| Komponenta | Uloga | Na šta paziti |
|---|---|---|
| Buck 9–36V → 5V 5A (2 kom naručena) | 12V → 5V | Realno ~3A kontinuirano (Pi + HAT + kamera ≈ 2,5A max). Podesiti 5,10–5,15 V (jeftini daju 5,3 V+). Hladnjak na čip |
| TVS **SMCJ22A** | Load dump (40V+) | **NE 24A** (steže tek na ~39V, buck je do 36V). Posle osigurača, paralelno na ulaz bucka, traka (katoda) na + |
| Fuse tap (add-a-circuit) ×2 | Grananje iz kutije | #1 na ACC slot (Pi), #2 na stalni +12V (ESP32). Kutiju otvoriti pre kupovine, verovatno Mini/ATM |
| Osigurači | | 5A Pi grana, 1A PC817 ulaz, 2A ESP32 grana, poseban po relejnoj grani |
| PC817 4ch (naručen) | Ignition sense | Ulaz 3,6–30V, izlaz na 3,3V. Obrnuta logika. Proveriti žute jumpere/otpornike za 12V ulaz |

### Šema napajanja (FINALNO)
```
GRANA A - Pi (ACC)
Kutija osigurača, ACC slot (radio / upaljač)
  -> fuse tap #1, osigurač 5A
     -> TVS SMCJ22A paralelno na masu (katoda na +)
        -> buck ulaz (9-36V)
           -> buck izlaz 5,1V -> UPS HAT / Pi GPIO pin 4, GND pin 6
  -> (ista ACC tačka) osigurač 1A -> PC817 IN1  (ignition sense)
GRANA B - ESP32 (stalni +12V)
Kutija osigurača, slot uvek pod naponom (npr. unutrašnje svetlo)
  -> fuse tap #2, osigurač 2A -> mali buck 5V -> ESP32-S3
MASA: fabrička tačka na karoseriji, ring terminal M6, zajednička za sve
```
Multimetrom potvrditi koji slot je ACC, a koji stalni.

**Zašto ne USB-C:** Pi 5 traži USB-PD za 5A profil. Bez toga ograniči USB na 600 mA i javlja undervoltage. GPIO zaobilazi PD i zaštitu, pa je osigurač obavezan, uz `usb_max_current_enable=1`.

## Povezivanje na auto

| Komponenta | Na šta paziti |
|---|---|
| OBD2 pigtail 16-pin muški | Pinovi 6, 14, 4/5 |
| OBD2 Y-splitter | Svih 16 pinova spojeno na oba izlaza (K-line 7/15 treba AlfaOBD-u). Pljosnati kabl |
| Toggle prekidač | U seriji na **pin 16 samo na grani ka Vgate-u**. 6/14 se ne diraju |
| FLRY-B 1,0–1,5 mm² | Crna masa, crvena plus. Lokalno (Ali dostava 60 €/10 m) |
| Ferule + krimp klešta, ring terminali M6, fabric tape + bužir, termo bužiri, Micro-Fit/Deutsch | Rastavljivo, otporno na vibracije |
| Ventilirana plastična kutija | Tek kad se sklopi stack. 158×90×60 mm je verovatno pretesno |

### OBD pinout
| Pin | Signal | Ide na |
|---|---|---|
| 6 | CAN High (CAN-C, 500 kbps) | CAN_H, HAT kanal 0 |
| 14 | CAN Low | CAN_L, HAT kanal 0 |
| 4 | Masa šasije | GND |
| 5 | Signalna masa | GND izolovane strane kanala 0 |
| 16 | +12V stalni | NE na Pi u Fazi 2 |
| 7 / 15 | K-line | Samo AlfaOBD preko splittera |

## Ignition sense: PC817 → Pi
| PC817 | Spaja se na | Napomena |
|---|---|---|
| IN1 | +15/ACC preko 1A | |
| G (ulaz) | Masa auta | |
| V/U1 (izlaz) | Pi 3,3V (pin 1) | NE 5V |
| G (izlaz) | Pi GND | |
| Izlaz kanala 1 | GPIO17 (pin 11) | Interni pull-up. **ON → LOW, OFF → HIGH** |

## Senzori (Faza 5)

| Komponenta | Pinovi / napomena |
|---|---|
| **HamGeek u-blox NEO-M8N (SMA)** ~14,50 € | VCC pin 1 (3,3V) ili pin 2 (5V, proveriti regulator), GND pin 9, TX → pin 10 (RXD), RX → pin 8 (TXD). Isključiti serijsku konzolu. **gpsd**, Node čita preko gpsd socketa. NE modul od ~9 € sa patch antenom. Pitati za DC bias na SMA (ako ga nema: bias-tee ~47 nH + kondenzator) |
| Aktivna GPS antena (naručena) | SMA muški (ne RP-SMA), 3–5V, GPS+GLONASS+BD, kabl 3–5 m. Lepi se u ugao šoferšajbne ili na vrh table, kabl kroz A-stub. Hladan fix ≤ 60 s |
| MPU6050 | VCC pin 1, GND pin 6, SDA pin 3, SCL pin 5. Čvrsto i poravnato sa osama auta. G-metar, G-G dijagram, detekcija sudara, wake-on-motion. ICM-20948 ako zatreba fuzija |
| Pi Camera 3 + CSI **22-pin 200 mm** + akrilni holder | rpicam-apps/libcamera. Loop snimanje od 5 min. Drugi CSI port kasnije za zadnju kameru |
| DS18B20 (opciono) | GPIO4 (pin 7), 4,7 kΩ pull-up, `dtoverlay=w1-gpio`. Jedna u kabini, jedna pored Pi-ja |
| INA219/INA226 (kasnije) | Napon/struja akumulatora |
| BME280 (kasnije) | Temp/vlaga/pritisak, barometarska visina |
| ~~DS3231~~ | Izbačen: Pi RTC + baterija i GPS vreme. Ako se ikad doda: LIR2032, ili ukloniti diodu za CR2032 |

**Pin konflikt:** GPIO4, 17, 24 i 25 proveriti protiv pinova koje koriste CAN HAT i UPS HAT. Pre lemljenja napraviti tabelu zauzetih pinova.

## Releji (Faza 6): ULN2803A

| Opcija | Ocena |
|---|---|
| TXS0108E | Ne (slab drive, zaglavljuje se) |
| BSS138 | Ne za releje (~1 mA). OK za I2C/UART |
| Plavi 5V relej modul | Ne (ne okida sa 3,3V, ~300 mA sa 5V rejla) |
| **ULN2803A driver modul** (DIP, screw terminali, ~3 €) | **Da**. Ne mešati sa „ULN2803 LED" demo modulom |

| Pin | Spaja se na |
|---|---|
| I1–I8 | Pi GPIO (3,3V) |
| O1–O8 | Jedan kraj zavojnice, drugi kraj na +12V (open-collector) |
| COM | **+12V (flyback diode, KRITIČNO)** |
| GND | Zajednička masa Pi + auto |
| VCC | 5V, samo LED |

Releji su automobilski Bosch 12V/30A sa podnožjem i žicama.

## Head unit (kasnije, korisnikova odluka)
Pretraga: „Android head unit Alfa Romeo Giulietta 2010-2015 9 inch CarPlay" (ili 10"). Minimum 4GB/64GB, sa fascijom, snopom i **CANbus decoder boxom**. Prodavac mora pismeno potvrditi da je za 940. Najčešće je 1024×600. Head unit je ujedno i audio sistem.

## Redosled nabavke
| # | Stavka | Kada |
|---|---|---|
| 1 | Pi 5 4GB (EU) | Bez žurbe dok nema auta ako cene padaju |
| 2 | Active Cooler | Pre headera |
| 3 | CAN HAT, UPS HAT, standoffi, OBD pigtail + Y-splitter | Jezgro Faze 1 |
| 4 | Stacking header | Kad se izmeri cooler |
| 5 | Lokalno: SMCJ22A, 2× fuse tap, osigurači, žica, ferule, terminali, traka, prekidač | Pre ugradnje |
| 6 | Kutija | Kad se sklopi stack |
| 7 | microSD industrial, head unit | Kasnije |
| 8 | NEO-M8N, Camera 3 + kabl + holder, MPU6050, RTC baterija | Faza 5 |
| 9 | ULN2803A, releji + podnožja | Faza 6 |
| 10 | AlfaOBD licenca | Kad se kupi Giulietta |
| 11 | USB 4G modem (E3372h-320 HiLink, TS9) + SIM sa data paketom | Uz Fazu 1, nije hitno |
| 12 | SIM modul za ESP32 alarm | Opciono |

**Lokalno (Podgorica):** Quantum Elektronika (komponente, buck, TVS, osigurači), Elektro Đurović (žica, ferule, terminali, traka), Autoelektronika Bugi i auto električar Rasović (pomoć oko +15 i BCM-a).

**Okvirno:** ~450–570 € povrh auta (od toga head unit 150–250 €).

## Izbačeno / ne kupovati
Pi sa AliExpressa, Pi 8GB, 3.5" SPI displej (tuče se sa CAN HAT-om oko SPI0), touch ekran za Pi, ULN2803 LED demo modul, Geekworm H505 cooler (previsok), ABS case B ili aluminijumsko kućište, TXS0108E/BSS138 za releje, plavi 5V relej modul, NEO-M8N od 9 € sa patch antenom, DS3231, USB zvučna kartica ili pojačavač, CAN sniffer dongle, OBDLink LX (i „OBDLink" kopije sa Temua), žica sa Alija, Li-ion UPS ako postoji izbor.

## Česte greške
| Greška | Prevencija |
|---|---|
| Termination jumper ostao | Oba OFF |
| Pogrešan oscilator u overlayu (interfejs gore, samo error frameovi) | Pročitati kristal, proveriti wiki |
| Buck nepodešen | Multimetar bez opterećenja i pod opterećenjem |
| Nema TVS ili je pogrešna (24A) | SMCJ22A posle osigurača |
| Nema ignition sense/UPS | PC817 + UPS + watchdog + read-only FS |
| Pi na USB bez PD | GPIO 4/6 + `usb_max_current_enable=1` |
| Metalno kućište, loša masa | Plastika, fabrička tačka |
| ULN2803 COM nespojen | COM na +12V |
| Header prenizak ili 1.27 mm, standoffi M2 | Izmeriti, 2.54 mm, M2.5 |
| GPS antena RP-SMA ili 16P | SMA muški |
| Vgate stalno ukopčan | Prekidač na pin 16 |
| Pi budan na parkiranom autu | Pi na ACC |
| Ključ sa transponderom u autu | Ukloniti transponder |
