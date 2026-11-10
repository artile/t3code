#!/bin/sh
# Run this fork on the main T3 data (~/.t3) in place of the official desktop app, or switch back.
#   omp-fork-main.sh on      back up the database, quit the official app, start the fork on :3773
#   omp-fork-main.sh off     stop the fork, open the official app again
#   omp-fork-main.sh status
# The official app and the fork must never run on ~/.t3 at the same time.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DATA="$HOME/.t3"
LABEL=com.artile.t3code-fork-main
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
APP="T3 Code (Nightly)"
LOGS="$ROOT/.t3/service-main"
NODE=$(command -v node)
T3=/Users/admin/.t3/bin/t3

port_busy() { lsof -iTCP:3773 -sTCP:LISTEN -P >/dev/null 2>&1; }

case "${1:-status}" in
on)
  [ -f "$ROOT/apps/server/dist/bin.mjs" ] || { echo "Run pnpm fork:build first." >&2; exit 1; }
  TS=$(date +%Y%m%d-%H%M%S)
  BACKUP="$DATA/backup-before-fork-$TS"
  mkdir -p "$BACKUP"
  sqlite3 "$DATA/userdata/state.sqlite" ".backup '$BACKUP/state.sqlite'"
  for f in server-owner.sqlite settings.json client-settings.json keybindings.json environment-id; do
    [ -e "$DATA/userdata/$f" ] && cp -p "$DATA/userdata/$f" "$BACKUP/" || true
  done
  [ -d "$DATA/userdata/secrets" ] && cp -Rp "$DATA/userdata/secrets" "$BACKUP/" || true
  echo "Backup: $BACKUP"
  osascript -e "tell application \"$APP\" to quit" >/dev/null 2>&1 || true
  i=0
  while port_busy && [ $i -lt 60 ]; do sleep 1; i=$((i + 1)); done
  if port_busy; then
    PID=$(lsof -tiTCP:3773 -sTCP:LISTEN | head -1)
    echo "Official server still on :3773 (pid $PID); stopping it."
    kill "$PID"; sleep 3
  fi
  mkdir -p "$LOGS" "$(dirname "$PLIST")"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array>
<string>$NODE</string><string>$ROOT/apps/server/dist/bin.mjs</string><string>serve</string>
<string>--base-dir</string><string>$DATA</string>
<string>--port</string><string>3773</string>
<string>--host</string><string>0.0.0.0</string>
<string>--no-browser</string>
</array>
<key>WorkingDirectory</key><string>$ROOT</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH</string><key>HOME</key><string>$HOME</string></dict>
<key>RunAtLoad</key><false/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>$LOGS/stdout.log</string>
<key>StandardErrorPath</key><string>$LOGS/stderr.log</string>
</dict></plist>
EOF
  plutil -lint "$PLIST" >/dev/null
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST"
  launchctl kickstart "$DOMAIN/$LABEL"
  i=0
  until curl -sf -o /dev/null http://127.0.0.1:3773/ || [ $i -gt 120 ]; do sleep 1; i=$((i + 1)); done
  echo "Fork on :3773: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3773/)"
  URL=$("$T3" pair --base-dir "$DATA" --ttl 30m --label "Arc (fork)" 2>/dev/null | grep -Eo 'https?://[^ ]+pair[^ ]*' | head -1 || true)
  [ -n "$URL" ] && open -a Arc "$URL" || open -a Arc "https://macmax.airplane-searobin.ts.net/"
  ;;
off)
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  i=0
  while port_busy && [ $i -lt 30 ]; do sleep 1; i=$((i + 1)); done
  open -a "$APP"
  echo "Fork stopped; official app opened."
  ;;
status)
  launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E '^\s+(state|pid) =' || echo "fork-main: not loaded"
  lsof -iTCP:3773 -sTCP:LISTEN -P | tail -n +2 || true
  ;;
*) echo "Use on, off or status." >&2; exit 2 ;;
esac
