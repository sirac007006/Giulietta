# Faze: procedure i kontrolne liste

## Faza 0: softver bez hardvera (vikend–dva)

Oko 80 % softvera. Arhitektura i pravila su u [software.md](software.md).

### Virtualni CAN (Linux / WSL2 / Pi)
```bash
sudo apt install can-utils
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
cangen vcan0 -I 0x3E8 -L 8 -g 20   # lažni promet
candump vcan0
```
Alati: candump, cansend, cangen, cansniffer. Na Windowsu se koristi JS simulator ili replay.

### Test Vgate-a kad stigne
Upariti Android telefon (BT 3.0 ne radi sa iOS-om). Uređaj „OBDII", PIN 1234 ili 0000. Car Scanner ili Torque Pro na bilo kom autu (Passat, RCZ). Mora da čita greške i live podatke, inače je loš klon i reklamira se odmah. **Na tuđim autima samo read-only**, kodiranje tek na Alfi.

## Faza 1: sto (2–3 dana)

### Napajanje
1. Buck na 12V izvor, izlaz prazan, izmeriti.
2. Trimerom 5,10–5,15 V.
3. Opteretiti, mora ostati ≥ 4,9 V.
4. Spojiti Pi: +5V na GPIO pin 4 (ili 2), GND na pin 6. Ako UPS ima svoj ulaz, buck ide u UPS.

### OS: Raspberry Pi OS Lite 64-bit
U Imageru se podese hostname, SSH ključ i kućni WiFi. `/boot/firmware/config.txt`:
```
usb_max_current_enable=1
dtparam=spi=on
dtparam=i2c_arm=on
dtoverlay=mcp2515-can0,oscillator=12000000,interrupt=25
dtoverlay=mcp2515-can1,oscillator=12000000,interrupt=24
```
Oscilator se čita sa kristala (verovatno 12 MHz, neke revizije 16 MHz). Interrupt pinove proveriti na Waveshare wiki za tačnu reviziju. `vcgencmd get_throttled` mora vratiti `0x0`.

### Mehanika stacka
Termalni padovi, cooler u 2 namenske rupe, izmeriti visinu, header bar 3 mm viši, M2.5 standoffi u ugaone rupe, pa CAN HAT, pa UPS HAT. Ništa ne naleže i ništa se ne savija.

### CAN HAT
Oba termination jumpera OFF, VIO na 3V3.
```bash
sudo ip link set can0 up type can bitrate 500000
sudo ip link set can1 up type can bitrate 500000
ip -details -statistics link show can0
```
**Loopback test:** H0↔H1, L0↔L1, 120 Ω između H i L, **GND izolovanih strana oba kanala spojen**.
```bash
candump can1                 # terminal 1
cansend can0 123#DEADBEEF    # terminal 2
```

### Hotspot
```bash
sudo nmcli device wifi hotspot ifname wlan0 ssid GiuliettaPi password "jakaLozinka"
sudo nmcli connection modify Hotspot connection.autoconnect yes connection.autoconnect-priority 100
```
Test: telefon na `GiuliettaPi`, otvoriti `http://10.42.0.1:3000` (proveriti sa `ip a`).

### systemd: `/etc/systemd/system/dashboard.service`
```ini
[Unit]
Description=Giulietta Dashboard
After=network.target
[Service]
ExecStartPre=/sbin/ip link set can0 up type can bitrate 500000
ExecStart=/usr/bin/node /home/pi/dashboard/server.js
WorkingDirectory=/home/pi/dashboard
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
```

### Zaštita SD kartice
- UPS + ignition sense + watchdog (Faza 4).
- Read-only root (overlay fs kroz raspi-config) kad sistem postane stabilan. Logovi idu na posebnu particiju ili se periodično flushuju.
- `sudo rpi-eeprom-config --edit` → `POWER_OFF_ON_HALT=1`.

### Kontrolna lista Faze 1
- [ ] Buck daje 5,1 V pod opterećenjem
- [ ] `get_throttled` = 0x0
- [ ] Oba CAN kanala rade, loopback prolazi
- [ ] Hotspot se diže posle reboota
- [ ] Servis se diže sam i preživljava `kill -9`
- [ ] Dashboard se otvara sa telefona preko Pi mreže

Ovde se staje dok se ne kupi auto.

## Faza 2: prvi kontakt (nekoliko sati)
Pi na **powerbanku**, samo pasivno slušanje.
```bash
sudo ip link set can0 up type can bitrate 500000
candump -l can0
```
Voziti 10–15 min (stajanje, ubrzanje, kočenje, skretanje, svetla, migavci) i beležiti vreme svake radnje (može diktiranjem u telefon).
Očekivano: nekoliko stotina frameova/s, 20–40 ID-jeva, motorni podaci na 50–100 Hz. Vrata, prozori i svetla nisu na CAN-C.

### Body CAN (kasnije)
Comfort bus (vrata, prozori, svetla, retrovizori, klima) ide preko BCM-a iza table, na drugi kanal HAT-a. **Brzina nije potvrđena:** pominje se 125 kbps, ali na nekim Fiat platformama je to 50 kbps fault-tolerant CAN koji traži drugi transiver. Pre zaključka treba naći BCM pinout za 940, izmeriti osciloskopom ili probati listen-only na više brzina.

## Faza 3: vidi [can-reverse-engineering.md](can-reverse-engineering.md)

## Faza 4: trajna instalacija (jedan dan)
Ulazi se tek kad sistem stabilno radi sa powerbanka. Šema napajanja (Pi na ACC, ESP32 na stalni plus) je u [hardware.md](hardware.md).

Watchdog: GPIO17 sa pull-upom, LOW = ON. Ako je HIGH duže od 5 s: flush, pa `shutdown -h now` (5 s pokriva cold crank).

Montaža: ventilirana plastična kutija sa protokom vazduha, bužir + fabric tape, servisna petlja, rastavljivi konektori. Ništa ne dodiruje pedale, volan ni ručnu. Ako nije jasno gde je +15 ili BCM, platiti auto električaru pola sata.

### Kontrolna lista Faze 4
- [ ] Diže se sam na kontakt
- [ ] Gasi se ~5 s posle gašenja kontakta
- [ ] SD kartica OK posle 10 ciklusa
- [ ] ≥ 4,9 V tokom paljenja motora
- [ ] CAN error counteri na 0
- [ ] Auto pali posle 3 dana stajanja

## Faza 5: senzori
Pinout je u [hardware.md](hardware.md). Upozorenja i softverske funkcije su u [software.md](software.md).

## Faza 6: releji
Paralelno fabričkim prekidačima, ne CAN injection. Svaka grana ima osigurač, default je isključeno, ništa ne utiče na vožnju i obaveznu opremu. Test sa ugašenim motorom, šema na papiru.

## Faza 7: vidi [esp32-unlock-alarm.md](esp32-unlock-alarm.md)

## Vremenski okvir
F0 vikend–dva · F1 2–3 dana · F2 nekoliko sati · F3 mesecima · F4 dan · F5 dan po komponenti · F6 zavisi · F7 dan–dva + app
