# Auto, dijagnostika, tuning, zakon

## Izbor auta (još nije kupljen)
Odluka: **Giulietta 940 (2010–2015), 1.6 JTDm 77 kW, ručni menjač.**

| Kriterijum | Zašto |
|---|---|
| Tip 940 | Nema Security Gateway (FCA ga uvodi ~2018), pa je pristup busu pun. AlfaOBD dobro pokriva platformu |
| Godište nebitno | Ista elektronika u celoj seriji |
| **Automatska dual-zone klima** | OBAVEZNO. Samo ona ima HVAC modul na busu |
| Tempomat | Dolazi uz Distinctive i više, zajedno sa auto klimom |
| < ~220.000 km | Zbog tune-a i dugog projekta |
| Ručni menjač | Stepen prenosa verovatno nije na busu, nema remote starta |

Oglasi imaju nepouzdane liste opreme. Prodavca treba pitati telefonom: automatska ili manuelna klima, VIN i stara italijanska tablica, a kod placa da li je cena sa carinom.

**Provera:** ilportaledellautomobilista.it (besplatno, stara IT tablica, km sa revizija), auto-km.com (~15,90 €), AlfaOBD poređenje km po modulima (razlika znači vrćen sat), Vgate na licu mesta (pending greške, readiness monitori).

Pregledani oglasi (avg 2026): Podgorica 2014, 265k km, 5.999 € (km previše) · **Nikšić 2011, 198k km, 6.000 €, uvoz iz Italije 01/2026** (najtransparentniji, proveriti kratak period od uvoza) · Podgorica 2010 plac, 180k, 5.450 € neocarinjen. Traži se i u Sloveniji (avto.net) i Srbiji.

## Vgate iCar2 BT 3.0 + AlfaOBD
- ~14 € umesto OBDLink LX (~80 €). „OBDLink" na Temuu je ELM klon.
- Hardver je univerzalan, aplikacija zavisi od marke: AlfaOBD za Alfu, Car Scanner/Torque za ostalo.
- AlfaOBD: greške iz svih modula, servisne rutine (reset servisa, forsirana DPF regeneracija, testovi aktuatora), kodiranje skrivenih opcija (preklapanje retrovizora, stranice na tabli, zvuci, svetla), km po modulima.
- **Pre kodiranja:** backup originalne konfiguracije i pun akumulator ili punjač.
- Licenca se kupuje kad Alfa bude korisnikova (veže se za uređaj/nalog).
- Fizički: Y-splitter, prekidač na pin 16 grane ka Vgate-u.

## Chip tuning
Plan: **+20 KS (77 → ~92 kW)**, najkonzervativnije.
| Element | Granica |
|---|---|
| Realni Stage 1 | ~125–135 KS, ~300–320 Nm |
| Kvačilo + DMF | prvo puca, preko ~320 Nm |
| VGT turbina | ostaje bez daha ~135–140 KS |
| **EGT** | najveći rizik, držati < ~750 °C pred turbinom |
| DPF | ostaje, češće regeneracije |

Custom mapa na dinamometru. Pre toga servis, injektori, EGR, intercooler cevi. Dashboard tab sa EGT, boostom i temperaturom usisa pokazuje da li mapa radi bezbedno.

## Zakon
- Promena snage formalno traži homologaciju. Stage 1 sa DPF/EGR se ne vidi na tehničkom, ali osiguranje može praviti problem kod većeg udesa. DPF/EGR delete pada na tehničkom.
- **Granica od 80 kW:** auto se bira ispod 80 kW. Ako je razlog propis za mlade vozače, +20 KS (~92 kW) prelazi granicu. Proveriti pre tune-a.
- Zvuci u kabini su slobodni. Sirena koja imitira policiju ili hitnu je prekršaj. Glasnija fabrička sirena pada na homologaciji. Comfort releji su OK ako ne diraju obaveznu opremu.
