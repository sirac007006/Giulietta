#!/usr/bin/env bash
# Šalje novu verziju servera (i opciono APK dashboarda) na Pi. Pokreće se sa laptopa (Git Bash).
#   PI=pi@10.42.0.1 bash deploy/deploy.sh          # u autu, laptop na GiuliettaPi hotspotu
#   PI=pi@giulietta bash deploy/deploy.sh          # preko Tailscale-a / kućne mreže
#   WITH_APK=1 ...                                  # i release APK, head unit ga skida sa :3000/apk
set -euo pipefail
cd "$(dirname "$0")/.."
PI="${PI:?Postavi PI=korisnik@adresa}"

npm run build -w server
mkdir -p .deploy-tmp/server && cp deploy/runtime-package.json .deploy-tmp/server/package.json
FILES=(server/dist signals config deploy)
if [[ "${WITH_APK:-}" == 1 ]]; then
  (cd dashboard/android && ./gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a)
  mkdir -p .deploy-tmp/data && cp dashboard/android/app/build/outputs/apk/release/app-release.apk .deploy-tmp/data/dashboard.apk
fi

# Bez rsync-a (nema ga u Git Bash-u): tar preko ssh-a. data/ na Pi-ju se ne dira (log, override-i).
tar czf - "${FILES[@]}" | ssh "$PI" 'mkdir -p ~/giulietta && tar xzf - -C ~/giulietta'
# runtime package.json (+ APK ako je traženo)
tar czf - -C .deploy-tmp . | ssh "$PI" 'tar xzf - -C ~/giulietta' && rm -rf .deploy-tmp
ssh "$PI" 'sudo systemctl restart giulietta 2>/dev/null && sleep 2 && curl -s localhost:3000/health; echo' || echo "Servis još nije instaliran — pokreni deploy/setup-pi.sh na Pi-ju."
