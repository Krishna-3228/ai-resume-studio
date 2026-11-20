import asyncio
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class EventManager:
    """In-memory pub/sub manager for project-specific real-time events."""

    def __init__(self):
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, project_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[project_id].add(queue)
        logger.info(
            "Client subscribed to project %s. Total listeners: %d",
            project_id,
            len(self._subscribers[project_id]),
        )
        return queue

    def unsubscribe(self, project_id: str, queue: asyncio.Queue) -> None:
        if project_id in self._subscribers:
            self._subscribers[project_id].discard(queue)
            if not self._subscribers[project_id]:
                del self._subscribers[project_id]
        logger.info("Client unsubscribed from project %s", project_id)

    def emit(self, project_id: str, event: dict[str, Any]) -> None:
        subscribers = list(self._subscribers.get(project_id, []))
        logger.info(
            "Broadcasting %s event to %d listeners for project %s",
            event.get("event_type"),
            len(subscribers),
            project_id,
        )
        for queue in subscribers:
            try:
                loop = getattr(queue, "_loop", None)
                if loop and loop.is_running():
                    try:
                        current_loop = asyncio.get_running_loop()
                    except RuntimeError:
                        current_loop = None

                    if current_loop is not loop:
                        loop.call_soon_threadsafe(queue.put_nowait, event)
                        continue

                queue.put_nowait(event)
            except Exception as exc:
                logger.warning("Failed to dispatch event to subscriber queue: %s", exc)


event_manager = EventManager()
