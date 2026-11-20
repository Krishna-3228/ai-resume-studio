import os
from unittest.mock import patch


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


def test_chat_nonexistent_project(client):
    response = client.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/chat",
        json={"message": "hello"},
    )
    assert response.status_code == 404
