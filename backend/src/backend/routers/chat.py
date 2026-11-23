import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.dependencies import get_db
from backend.services.agent_service import agent_service
from backend.services.llm_factory import get_llm_status
from backend.services.project_service import ProjectService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Chatbot"])


class ChatMessageRequest(BaseModel):
    message: str


@router.get("/api/chat/status")
def chat_status():
    """Check LLM provider configuration and model details."""
    return get_llm_status()


@router.post("/api/projects/{project_id}/chat")
async def chat_stream(
    project_id: str,
    body: ChatMessageRequest,
    db: Session = Depends(get_db),
):
    """Stream AI assistant response with tool execution status via Server-Sent Events."""
    project = ProjectService(db).get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    async def event_generator():
        try:
            async for event in agent_service.stream_chat(project_id, body.message):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as error:
            logger.exception("Error in chat streaming generator")
            yield f"data: {json.dumps({'type': 'error', 'message': str(error)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/projects/{project_id}/chat/history")
async def get_chat_history(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Fetch stored conversation history for a project."""
    project = ProjectService(db).get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    messages = await agent_service.get_history(project_id)
    return {"messages": messages}


@router.delete("/api/projects/{project_id}/chat/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_chat_history(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Clear conversation history for a project."""
    project = ProjectService(db).get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    await agent_service.clear_history(project_id)
