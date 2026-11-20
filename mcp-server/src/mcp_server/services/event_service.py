import json
import logging
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from mcp_server.config import EVENTS_DIR

logger = logging.getLogger(__name__)


class EventService:
    """Record and broadcast project-specific events to the backend and event log."""

    def __init__(self, backend_url: str | None = None):
        self.backend_url = backend_url or os.getenv(
            "BACKEND_URL", "http://127.0.0.1:8000"
        )

    def _get_event_file(self, project_id: str) -> Path:
        try:
            validated_id = str(UUID(project_id))
        except ValueError:
            raise ValueError("Invalid project UUID") from None

        event_dir = (EVENTS_DIR / validated_id).resolve()

        if event_dir.parent != EVENTS_DIR.resolve():
            raise ValueError("Invalid project ID")

        return event_dir / "events.jsonl"

    def emit_event(
        self,
        project_id: str,
        event_type: str,
        payload: dict | None = None,
    ) -> dict:
        event = {
            "event_id": str(uuid4()),
            "project_id": str(UUID(project_id)),
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload or {},
        }

        # 1. Append to local events.jsonl
        try:
            event_file = self._get_event_file(project_id)
            event_file.parent.mkdir(parents=True, exist_ok=True)

            with event_file.open("a", encoding="utf-8") as file:
                file.write(json.dumps(event) + "\n")
                file.flush()
        except Exception as error:
            logger.warning("Could not persist event to disk: %s", error)

        # 2. Broadcast to FastAPI backend SSE stream
        try:
            endpoint = f"{self.backend_url}/api/projects/{project_id}/events"
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(event).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5.0):
                pass
        except Exception as err:
            logger.debug("Could not broadcast event to backend: %s", err)

        return event

    def append_event(
        self,
        project_id: str,
        event_type: str,
        payload: dict | None = None,
    ) -> dict:
        """Alias for emit_event."""
        return self.emit_event(project_id, event_type, payload)

    def read_events(self, project_id: str) -> list[dict]:
        event_file = self._get_event_file(project_id)

        if not event_file.exists():
            return []

        events = []
        with event_file.open("r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except Exception:
                        pass

        return events
