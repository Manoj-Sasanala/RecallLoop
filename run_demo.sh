#!/usr/bin/env bash
# Cold-start demo: backend (port 8000) + frontend dev server.
# Needs: .env with LLM_PROVIDER + key (see .env.example).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

"$ROOT/.venv/Scripts/python.exe" -m uvicorn app.main:app --port 8000 --app-dir "$ROOT/backend" &
BACK_PID=$!

VITE_API_TARGET="http://127.0.0.1:8000" npm run dev --prefix "$ROOT/frontend" -- --port 5173 &
FRONT_PID=$!

trap 'kill $BACK_PID $FRONT_PID 2>/dev/null' EXIT
echo "backend : http://127.0.0.1:8000  (docs: /docs)"
echo "frontend: http://localhost:5173"
echo "Zero-setup path: open the UI and pick a seeded demo course (no model calls)."
wait
