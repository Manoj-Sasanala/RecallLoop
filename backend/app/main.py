"""Uvicorn entrypoint. From backend/: uvicorn app.main:app --reload"""

import threading
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app import service  # noqa: E402  (after load_dotenv)
from app.api import create_app  # noqa: E402  (after load_dotenv)

app = create_app()

# Warm the speech model in the background so the first utterance is fast.
threading.Thread(target=service.warmup_transcriber, daemon=True).start()
