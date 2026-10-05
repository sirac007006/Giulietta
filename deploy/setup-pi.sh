#!/usr/bin/env bash
# Jednokratno podešavanje Raspberry Pi 5 (Raspberry Pi OS Lite 64-bit, Bookworm).
# Pokreće se NA PI-JU:  bash ~/giulietta/deploy/setup-pi.sh
# NETESTIRANO na pravom hardveru — Pi još nije stigao. Prolaziti korak po korak prvi put.
set -euo pipefail

USER_NAME="${SUDO_USER:-$USER}"
HOTSPOT_SSID="${HOTSPOT_SSID:-GiuliettaPi}"
HOTSPOT_PASS="${HOTSPOT_PASS:?Postavi HOTSPOT_PASS=... (min 8 znakova)}"
CAN_OSC="${CAN_OSC:-12000000}"   # pročitati sa kristala na CAN HAT-u (8/12/16 MHz)
CONFIG=/boot/firmware/config.txt

echo "== Paketi =="
sudo apt-get update
sudo apt-get install -y can-utils curl ca-certificates
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* && "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "== $CONFIG (CAN HAT, I2C, USB struja) =="
add_line() { grep -qxF "$1" "$CONFIG" || echo "$1" | sudo tee -a "$CONFIG" >/dev/null; }
add_line ""
add_line "# --- giulietta ---"
add_line "usb_max_current_enable=1"
add_line "dtparam=spi=on"
add_line "dtparam=i2c_arm=on"
# Interrupt pinove provjeriti na Waveshare wiki za tačnu reviziju HAT-a!
add_line "dtoverlay=mcp2515-can0,oscillator=${CAN_OSC},interrupt=25"
add_line "dtoverlay=mcp2515-can1,oscillator=${CAN_OSC},interrupt=24"

echo "== EEPROM: minimalna potrošnja poslije shutdowna =="
echo "Ručno: sudo rpi-eeprom-config --edit  ->  POWER_OFF_ON_HALT=1"

echo "== WiFi hotspot =="
# ipv4.method=shared radi NAT ka default ruti — kad je USB 4G modem (HiLink) spojen,
# head unit automatski dobija internet kroz hotspot.
if ! nmcli -t -f NAME connection show | grep -qx Hotspot; then
  sudo nmcli device wifi hotspot ifname wlan0 con-name Hotspot ssid "$HOTSPOT_SSID" password "$HOTSPOT_PASS"
fi
sudo nmcli connection modify Hotspot connection.autoconnect yes connection.autoconnect-priority 100 ipv4.method shared

echo "== Server zavisnosti (native socketcan) =="
cd "/home/$USER_NAME/giulietta/server"
npm install --omit=dev --no-package-lock

echo "== systemd =="
sed "s/__USER__/$USER_NAME/g" "/home/$USER_NAME/giulietta/deploy/giulietta.service" | sudo tee /etc/systemd/system/giulietta.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now giulietta
sleep 2
systemctl --no-pager status giulietta | head -15

echo
echo "Gotovo. Reboot da se učitaju overlay-i:  sudo reboot"
echo "Provjere poslije reboota:"
echo "  vcgencmd get_throttled          # mora biti throttled=0x0"
echo "  ip -details link show can0      # state UP, bitrate 500000"
echo "  curl localhost:3000/health"
