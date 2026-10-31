"""Uvicorn entrypoint. From backend/: uvicorn app.main:app --reload"""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.api import create_app  # noqa: E402  (after load_dotenv)

app = create_app()
