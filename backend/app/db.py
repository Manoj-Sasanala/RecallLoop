"""SQLite engine with the PRAGMAs the PRD requires (WAL, foreign keys, busy timeout)."""

from __future__ import annotations

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine


def make_engine(url: str = "sqlite:///./recallloop.db"):
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_connection, _record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        if url != "sqlite://" and ":memory:" not in url:
            cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine


def init_db(engine) -> None:
    SQLModel.metadata.create_all(engine)


def session_scope(engine) -> Session:
    return Session(engine)
