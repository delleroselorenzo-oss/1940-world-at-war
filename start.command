#!/usr/bin/env bash
# Avvia "1940 World at War" in locale.
#
# Si può lanciare con un doppio clic dal Finder, oppure da terminale con
# `./start.command` o `npm start`. Opzioni:
#   --check   esegue anche test e controllo dei tipi
#   --map     rigenera la mappa anche se esiste già
#
# Cosa fa, in ordine:
#   1. controlla che ci sia Node.js 24 o superiore;
#   2. installa le dipendenze se mancano o se package.json è cambiato;
#   3. genera la mappa se manca;
#   4. avvia client e server se hanno uno script "dev" (dalle milestone 1 e 5);
#      finché non esistono, apre l'anteprima della mappa nel browser.

set -euo pipefail
cd "$(dirname "$0")"

RUN_CHECKS=false
FORCE_MAP=false
for arg in "$@"; do
  case "$arg" in
    --check) RUN_CHECKS=true ;;
    --map) FORCE_MAP=true ;;
    *) echo "Opzione sconosciuta: $arg" >&2; exit 1 ;;
  esac
done

step() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

# 1. Node.js. Con il doppio clic il PATH può essere ridotto: proviamo anche il percorso locale.
step "Controllo Node.js"
if ! command -v node >/dev/null 2>&1 && [ -x "$HOME/.local/node/bin/node" ]; then
  export PATH="$HOME/.local/node/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installalo da https://nodejs.org (versione 24 o superiore) e riprova." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Serve Node.js 24 o superiore, trovato $(node -v)." >&2
  exit 1
fi
echo "Node $(node -v)"

# 2. Dipendenze: reinstalla se manca node_modules o se un package.json è più recente.
step "Dipendenze"
if [ ! -d node_modules ] || [ -n "$(find package.json */package.json -newer node_modules -print -quit)" ]; then
  npm install
  touch node_modules
else
  echo "Già installate"
fi

# 3. Mappa.
step "Mappa Europa 1933"
MAP_DIR="data/maps/europe-1933"
if $FORCE_MAP || [ ! -f "$MAP_DIR/map.json" ]; then
  npm run map:build
else
  echo "Già generata (usa --map per rigenerarla)"
fi

# Controlli facoltativi.
if $RUN_CHECKS; then
  step "Test e controllo dei tipi"
  npm test
  npm run typecheck
fi

# 4. Client e server: partono solo quando avranno uno script "dev".
has_dev() { node -e "process.exit(require('./$1/package.json').scripts?.dev ? 0 : 1)"; }
DEV_WORKSPACES=()
for ws in server client; do
  if has_dev "$ws"; then DEV_WORKSPACES+=("$ws"); fi
done

if [ ${#DEV_WORKSPACES[@]} -eq 0 ]; then
  step "Avvio"
  echo "Client e server non sono ancora pronti: apro l'anteprima della mappa."
  open "$MAP_DIR/preview.html"
  exit 0
fi

step "Avvio di: ${DEV_WORKSPACES[*]} (Ctrl+C per fermare tutto)"
PIDS=()
cleanup() { kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
for ws in "${DEV_WORKSPACES[@]}"; do
  npm run dev --workspace "$ws" &
  PIDS+=($!)
done
wait
