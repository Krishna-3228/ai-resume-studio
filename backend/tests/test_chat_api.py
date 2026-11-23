import asyncio
import os
import sqlite3
from unittest.mock import patch

from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

from backend.db.session import get_chat_database_path
from backend.services.agent_service import agent_service


def test_chat_status_unconfigured(client):
    with patch.dict(os.environ, {}, clear=True):
        response = client.get("/api/chat/status")
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is False
        assert "No LLM provider key detected" in data["message"]


def test_chat_status_configured(client):
    with patch.dict(os.environ, {"GEMINI_API_KEY": "dummy-key"}, clear=True):
        response = client.get("/api/chat/status")
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is True
        assert data["provider"] == "google"
        assert "gemini" in data["model"]


def test_chat_history_endpoints(client):
    created = client.post(
        "/api/projects",
        json={"title": "Chat History Test"},
    ).json()
    project_id = created["id"]

    # History should initially be empty
    response = client.get(f"/api/projects/{project_id}/chat/history")
    assert response.status_code == 200
    assert response.json() == {"messages": []}

    # Delete history
    del_response = client.delete(f"/api/projects/{project_id}/chat/history")
    assert del_response.status_code == 204


def test_chat_history_persistence_and_clear(client):
    created = client.post(
        "/api/projects",
        json={"title": "Persistent Chat Project"},
    ).json()
    project_id = created["id"]

    async def seed():
        saver = await agent_service.get_checkpointer()
        llm = FakeListChatModel(responses=["I can help edit your resume."])
        agent = create_react_agent(llm, tools=[], checkpointer=saver)
        config = {"configurable": {"thread_id": project_id}}
        await agent.ainvoke({"messages": [HumanMessage(content="Please review my skills section")]}, config=config)

    asyncio.run(seed())

    # Verify history returns persisted messages
    response = client.get(f"/api/projects/{project_id}/chat/history")
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 2
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][0]["content"] == "Please review my skills section"
    assert data["messages"][1]["role"] == "assistant"
    assert data["messages"][1]["content"] == "I can help edit your resume."

    # Clear chat history (clears the context window)
    del_response = client.delete(f"/api/projects/{project_id}/chat/history")
    assert del_response.status_code == 204

    # Verify history is now empty
    response_after = client.get(f"/api/projects/{project_id}/chat/history")
    assert response_after.status_code == 200
    assert response_after.json() == {"messages": []}


def test_chat_deleted_on_project_deletion(client):
    created = client.post(
        "/api/projects",
        json={"title": "Cascade Delete Project"},
    ).json()
    project_id = created["id"]

    async def seed():
        saver = await agent_service.get_checkpointer()
        llm = FakeListChatModel(responses=["Assistant reply before deletion"])
        agent = create_react_agent(llm, tools=[], checkpointer=saver)
        config = {"configurable": {"thread_id": project_id}}
        await agent.ainvoke({"messages": [HumanMessage(content="Hello before delete")]}, config=config)

    asyncio.run(seed())

    # Check that checkpoints exist in SQLite database
    chat_db = get_chat_database_path()
    assert chat_db.is_file()
    with sqlite3.connect(str(chat_db)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM checkpoints WHERE thread_id = ?", (project_id,))
        count = cursor.fetchone()[0]
        assert count > 0

    # Delete the project
    del_proj = client.delete(f"/api/projects/{project_id}")
    assert del_proj.status_code == 204

    # Check that checkpoints for project_id were deleted from SQLite database
    with sqlite3.connect(str(chat_db)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM checkpoints WHERE thread_id = ?", (project_id,))
        count_after = cursor.fetchone()[0]
        assert count_after == 0
        cursor.execute("SELECT count(*) FROM writes WHERE thread_id = ?", (project_id,))
        writes_after = cursor.fetchone()[0]
        assert writes_after == 0


def test_multi_project_chat_isolation(client):
    p1 = client.post("/api/projects", json={"title": "Project 1"}).json()["id"]
    p2 = client.post("/api/projects", json={"title": "Project 2"}).json()["id"]

    async def seed():
        saver = await agent_service.get_checkpointer()
        llm = FakeListChatModel(responses=["Reply for P1", "Reply for P2"])
        agent = create_react_agent(llm, tools=[], checkpointer=saver)
        await agent.ainvoke({"messages": [HumanMessage(content="Msg for P1")]}, config={"configurable": {"thread_id": p1}})
        await agent.ainvoke({"messages": [HumanMessage(content="Msg for P2")]}, config={"configurable": {"thread_id": p2}})

    asyncio.run(seed())

    # Clear P1
    del_p1 = client.delete(f"/api/projects/{p1}/chat/history")
    assert del_p1.status_code == 204

    # P1 is empty
    resp_p1 = client.get(f"/api/projects/{p1}/chat/history").json()
    assert resp_p1 == {"messages": []}

    # P2 still has messages
    resp_p2 = client.get(f"/api/projects/{p2}/chat/history").json()
    assert len(resp_p2["messages"]) == 2
    assert resp_p2["messages"][0]["content"] == "Msg for P2"
    assert resp_p2["messages"][1]["content"] == "Reply for P2"


def test_chat_nonexistent_project(client):
    response = client.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/chat",
        json={"message": "hello"},
    )
    assert response.status_code == 404


def test_duplicate_project_does_not_copy_chat_history(client):
    created = client.post(
        "/api/projects",
        json={"title": "Chat Seeded Project", "description": "Original desc"},
    ).json()
    project_id = created["id"]

    # Seed chat messages for the project
    async def seed():
        saver = await agent_service.get_checkpointer()
        llm = FakeListChatModel(responses=["Assistant response for original"])
        agent = create_react_agent(llm, tools=[], checkpointer=saver)
        config = {"configurable": {"thread_id": project_id}}
        await agent.ainvoke({"messages": [HumanMessage(content="User prompt for original")]}, config=config)

    asyncio.run(seed())

    # Verify original has chat history
    original_history = client.get(f"/api/projects/{project_id}/chat/history").json()
    assert len(original_history["messages"]) == 2
    assert original_history["messages"][0]["content"] == "User prompt for original"

    # Duplicate project
    dup_resp = client.post(f"/api/projects/{project_id}/duplicate")
    assert dup_resp.status_code == 201
    dup_id = dup_resp.json()["id"]

    # Check duplicated project's chat history is EMPTY
    dup_history = client.get(f"/api/projects/{dup_id}/chat/history").json()
    assert dup_history == {"messages": []}

    # Verify original project still has its chat history intact
    original_history_after = client.get(f"/api/projects/{project_id}/chat/history").json()
    assert len(original_history_after["messages"]) == 2

