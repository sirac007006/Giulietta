# Faza 3: reverse engineering CAN poruka

Ne postoji zvanična dokumentacija za Fiat/Alfa CAN. Radi se metodom eliminacije: menja se jedna stvar u autu i traži se bajt koji se promenio. Giulietta deli Fiat CAN-C arhitekturu sa Fiat Bravom i Lancijom Deltom.

## Alati
| Alat | Uloga |
|---|---|
| `candump -l` | Snimanje u fajl |
| `cansniffer -c can0` | Uživo, boji bajtove koji se menjaju |
| SavvyCAN | GUI analiza logova, korelacija bajta sa poznatom vrednošću |
| opendbc (comma.ai, GitHub) | Baza dekodiranih poruka, proveriti Fiat platformu |
| AlfaOBD live data | Referentne vrednosti (boost, EGT, rail pressure) za poređenje sa dekodiranim bajtovima |
| python-can / npm socketcan | Biblioteke |

## Metodologija
1. **Baseline**: 60 s u leru, bez diranja ičega.
2. **Jedna promena**: 60 s menjanja tačno jedne stvari (RPM: 800 → 3000 → nazad).
3. **Poređenje**: `cansniffer -c can0`, `grep "0x3E8" candump-....log`. Traži se bajt koji se menja monotono i proporcionalno. RPM je skoro uvek 16-bitna vrednost sa faktorom.
4. **Formula**: ako je pri 800 rpm sirova vrednost 3200, a pri 3000 rpm 12000, faktor je 0.25. `rpm = ((b0 << 8) | b1) * 0.25`. **Fiat je najčešće big-endian (Motorola).** Ako vrednost skače nelogično, treba obrnuti redosled bajtova.
5. **Verifikacija**: poređenje sa fabričkim klasterom i AlfaOBD-om, dozvoljeno odstupanje je par procenata.

## Tabela evidencije (voditi od prvog dana)
| CAN ID | Bajtovi | Signal | Formula | Status |
|---|---|---|---|---|
| 0x3E8 | 0–1 | RPM | (b0*256 + b1) * 0.25 | primer |
| 0x3E8 | 2 | Temp rashladne | b2 - 40 [°C] | primer |
| 0x? | ? | Brzina | ? | u radu |
| 0x? | ? | Nivo goriva | ? | nije počelo |

(Redovi iznad su ilustrativni primeri iz plana, ne stvarni Giulietta ID-jevi.)

## Prioritet
1. RPM (najlakši)
2. Brzina (korelacija sa GPS brzinom)
3. Temperatura rashladne tečnosti (snimati od hladnog starta)
4. Položaj papučice gasa (0–100 %)
5. Boost, temperatura usisa, EGT (bitni za tune)
6. Nivo goriva (traži nekoliko punjenja)
7. Stepen prenosa (na manuelcu često ga nema na busu, računa se iz odnosa RPM/brzina)

Prvi signal može uzeti celo popodne, peti oko pola sata.

## Podrška u softveru
Dashboard treba da ima dijagnostički tab koji olakšava RE: listu ID-jeva sa frekvencijom, highlight promenjenih bajtova (kao cansniffer), snimanje markera ("sad dižem gas") u log i replay snimljenih logova kroz parser.

## Resursi
The Car Hacker's Handbook (Craig Smith, besplatan PDF, pročitati pre Faze 3), opengarages.org, r/CarHacking, AlfaOBD forum, alfaowner.com, Raspberry Pi forum (Automotive).
Pretrage: "Fiat CAN bus database", "opendbc fiat", "SavvyCAN tutorial reverse engineering", "Giulietta 940 BCM pinout".
