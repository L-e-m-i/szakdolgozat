# conftest.py
# Ensure the backend root is on sys.path during pytest collection so 'import app.*' works.
# This makes tests runnable whether pytest is invoked from the backend folder or from the repo root.

import sys
from pathlib import Path
from typing import Generator

# Session fixture to create and drop DB tables for tests ---------------------------------
import pytest

# Import create_db/drop_db will be performed after we ensure the backend root
# is on sys.path (below). Importing before adjusting sys.path can cause
# ModuleNotFoundError when pytest collects tests from the repo root.

# Location of this file: .../app/backend/tests/conftest.py
# We want to add the backend root (.../app/backend) to sys.path so 'import app' resolves to the backend package.
TESTS_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = TESTS_DIR.parent  # .../app/backend

BACKEND_ROOT_STR = str(BACKEND_ROOT)
if BACKEND_ROOT_STR not in sys.path:
    # Insert at front so it takes precedence over other entries
    sys.path.insert(0, BACKEND_ROOT_STR)

# Optional: also ensure backend's "app" package directory exists and is discoverable
APP_PACKAGE_DIR = BACKEND_ROOT / "app"
if APP_PACKAGE_DIR.exists() and str(APP_PACKAGE_DIR) not in sys.path:
    # Not strictly necessary when backend root is on sys.path, but safe to include.
    sys.path.insert(0, str(APP_PACKAGE_DIR))

# Helpful debug information when needed (commented out by default).
# Uncomment for troubleshooting pytest import problems.
# import logging
# logging.getLogger("pytest_conftest").info("sys.path (first 5): %s", sys.path[:5])

# Now that we've ensured the backend root and package dir are on sys.path,
# it is safe to import DB helper functions that rely on the backend package.
# Import create_db/drop_db which operate on the configured DATABASE_URL.
# In CI this is set to a disposable test database (the workflow uses a Postgres service).
from app.db.session import create_db, drop_db


@pytest.fixture(scope="session", autouse=True)
def prepare_database() -> Generator[None, None, None]:
    """
    Create database tables before the pytest session and drop them afterwards.

    Notes:
    - This fixture runs once per test session (autouse) so test code can rely on the
      schema being present.
    - The DATABASE_URL environment variable must be set in the environment where
      pytest is executed (CI workflow sets it to the test Postgres service).
    - create_db() will create tables for all models registered on SQLAlchemy Base.
    - drop_db() will drop all tables after the test session; do not point DATABASE_URL
      at a shared/production database.
    """
    # Create tables
    create_db()
    try:
        yield
    finally:
        # Teardown: drop all tables (destructive)
        drop_db()
