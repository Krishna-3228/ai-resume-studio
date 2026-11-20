import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

REPO_ROOT = Path(__file__).resolve().parents[4]

data_dir = Path(
    os.getenv("RESUME_DATA_DIR", REPO_ROOT / "data")
)

if not data_dir.is_absolute():
    data_dir = REPO_ROOT / data_dir

data_dir.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = data_dir / "resume_studio.db"

DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)

@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()