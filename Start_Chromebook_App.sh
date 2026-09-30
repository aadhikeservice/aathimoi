#!/bin/bash
# ஆதி மொய் (Aathi Moi) - Chromebook Launcher Script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if command -v node >/dev/null 2>&1; then
  echo "Starting Aathi Moi Local Server on http://localhost:3000 ..."
  node server.js &
  sleep 1
  if command -v garcon-url-handler >/dev/null 2>&1; then
    garcon-url-handler "http://localhost:3000"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"
  fi
  wait
elif command -v python3 >/dev/null 2>&1; then
  echo "Starting Aathi Moi Offline Web Server on http://localhost:3000 ..."
  python3 -m http.server 3000 &
  sleep 1
  if command -v garcon-url-handler >/dev/null 2>&1; then
    garcon-url-handler "http://localhost:3000"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"
  fi
  wait
else
  echo "Please open AathiMoi_Chromebook_Standalone.html or index.html directly in Chrome."
fi
