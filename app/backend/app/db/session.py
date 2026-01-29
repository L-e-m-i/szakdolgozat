# 1-sprint-L-e-m-i\app\backend\app\db\session.py
"""
SQLAlchemy engine & session utilities.

- Uses DATABASE_URL environment variable (falls back to a local sqlite file for development).
- Exposes `engine`, `SessionLocal` and a `get_db` generator suitable for FastAPI dependencies.
- Provides `create_db` helper to create tables from the SQLAlchemy Base metadata.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Generator, Optional, Union

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

# Import Base from local models so create_db can materialize the schema
try:
    # relative import within package
    from .models import Base  # type: ignore
except Exception:  # pragma: no cover - defensive import fallback
    # If package context differs, try the absolute import path
    from app.db.models import Base  # type: ignore

# Read DATABASE_URL from environment. Example:
#   postgres: postgresql+psycopg2://user:pass@localhost:5432/dbname
# For this deployment the backend requires a PostgreSQL DATABASE_URL.
# There is no sqlite fallback anymore; fail fast if the variable is not provided.
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is required and must point to a PostgreSQL database, "
        "for example: postgresql+psycopg2://user:pass@host:5432/dbname"
    )

# Create the SQLAlchemy Engine. `future=True` enables 2.0 style behaviors on 1.4+.
# Keep echo off by default; set env var SQLALCHEMY_ECHO=1 to enable SQL logging.
SQLALCHEMY_ECHO = os.getenv("SQLALCHEMY_ECHO", "0") in (
    "1",
    "true",
    "True",
    "yes",
    "YES",
)

engine: Engine = create_engine(DATABASE_URL, echo=SQLALCHEMY_ECHO, future=True)

# Configure a session factory bound to the engine.
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_engine(
    database_url: Optional[str] = None, echo: Optional[bool] = None
) -> Engine:
    """
    Return a SQLAlchemy engine. If `database_url` is provided it is used;
    otherwise the module-level DATABASE_URL is used.

    `echo` can override SQL logging behavior for this engine instance.
    """
    # Ensure we have a concrete string URL (raise early if not provided).
    url = database_url if database_url is not None else DATABASE_URL
    if url is None:
        raise RuntimeError(
            "A database URL must be provided either via the `database_url` argument "
            "or the DATABASE_URL environment variable."
        )

    # Ensure echo is a concrete bool for the create_engine call.
    echo_flag: bool = SQLALCHEMY_ECHO if echo is None else bool(echo)

    return create_engine(url, echo=echo_flag, future=True)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency generator that yields a SQLAlchemy Session
    and ensures it is closed after use.

    Usage in FastAPI route:
        from fastapi import Depends
        def route(db: Session = Depends(get_db)): ...
    """
    db: Session = SessionLocal()
    try:
        yield db
        # commit is intentionally left to callers; keep control in route/service logic.
    finally:
        db.close()


def create_db(
    engine_or_url: Optional[Union[Engine, str]] = None,
    create_if_not_exists: bool = True,
) -> None:
    """
    Create database tables for all models registered on Base.

    - If `engine_or_url` is an Engine instance, it will be used.
    - If `engine_or_url` is a string, a new Engine will be created from it.
    - If omitted, the module-level `engine` is used.

    Note: For PostgreSQL you must ensure the database itself exists (this helper
    only creates tables within the database). If you want to programmatically
    create a database, handle that separately (e.g., via `psycopg2` or `createdb`).
    """
    if engine_or_url is None:
        engine_to_use = engine
    elif isinstance(engine_or_url, Engine):
        engine_to_use = engine_or_url
    else:
        engine_to_use = get_engine(database_url=engine_or_url)

    # Create all tables from metadata
    Base.metadata.create_all(bind=engine_to_use)


def drop_db(engine_or_url: Optional[Union[Engine, str]] = None) -> None:
    """
    Drop all tables defined on Base. Use carefully (destructive).
    """
    if engine_or_url is None:
        engine_to_use = engine
    elif isinstance(engine_or_url, Engine):
        engine_to_use = engine_or_url
    else:
        engine_to_use = get_engine(database_url=engine_or_url)

    Base.metadata.drop_all(bind=engine_to_use)
