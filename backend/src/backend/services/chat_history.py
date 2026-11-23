import logging
import sqlite3
from pathlib import Path

from backend.db.session import get_chat_database_path

logger = logging.getLogger(__name__)


def delete_chat_history_sync(project_id: str, db_path: Path | str | None = None) -> None:
    """
    Synchronously delete all checkpoints and writes for a project thread
    from the SQLite chat database. Safe to call during project deletion.
    """
    target = Path(db_path) if db_path else get_chat_database_path()
    if not target.is_file():
        return

    try:
        with sqlite3.connect(str(target), timeout=10.0) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('checkpoints', 'writes')"
            )
            tables = {row[0] for row in cursor.fetchall()}
            if "checkpoints" in tables:
                cursor.execute("DELETE FROM checkpoints WHERE thread_id = ?", (str(project_id),))
            if "writes" in tables:
                cursor.execute("DELETE FROM writes WHERE thread_id = ?", (str(project_id),))
            conn.commit()
    except Exception as exc:
        logger.warning(
            "Failed to delete chat history for project %s from %s: %s",
            project_id,
            target,
            exc,
        )
