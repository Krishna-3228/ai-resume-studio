import pytest
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.db.base import Base
from backend.db.dependencies import get_db
from backend.dependencies import get_project_storage
from backend.services.project_storage import ProjectStorage
from backend.services.compilation_service import CompilationError





def test_create_project(client, storage):
    response = client.post(
        "/api/projects",
        json={
            "title": "Software Engineer Resume",
            "description": "Backend development roles",
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["title"] == "Software Engineer Resume"
    assert data["description"] == "Backend development roles"
    assert data["status"] == "draft"
    assert data["id"]

    project_dir = storage.projects_dir / data["id"]

    assert project_dir.exists()
    assert (project_dir / "resume.tex").exists()


def test_list_projects(client):
    client.post("/api/projects", json={"title": "Project A"})
    client.post("/api/projects", json={"title": "Project B"})

    response = client.get("/api/projects")

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_project(client):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    response = client.get(f"/api/projects/{created['id']}")

    assert response.status_code == 200
    assert response.json()["title"] == "My Resume"


def test_get_nonexistent_project(client):
    response = client.get("/api/projects/nonexistent")

    assert response.status_code == 404


def test_duplicate_project(client, storage):
    created = client.post(
        "/api/projects",
        json={
            "title": "Staff Engineer Resume",
            "description": "Tech lead roles",
        },
    ).json()

    source_id = created["id"]
    latex_content = r"\documentclass{article}\begin{document}Staff Engineer\end{document}"
    client.put(f"/api/projects/{source_id}/latex", json={"content": latex_content})
    (storage.get_pdf_path(source_id)).write_bytes(b"%PDF-1.4 test resume pdf")

    response = client.post(f"/api/projects/{source_id}/duplicate")

    assert response.status_code == 201

    data = response.json()
    assert data["id"] != source_id
    assert data["title"] == "Staff Engineer Resume (copy)"
    assert data["description"] == "Tech lead roles"
    assert data["status"] == "draft"

    # Verify latex was copied
    latex_resp = client.get(f"/api/projects/{data['id']}/latex")
    assert latex_resp.status_code == 200
    assert latex_resp.json()["content"] == latex_content

    # Verify resume PDF was copied
    pdf_resp = client.get(f"/api/projects/{data['id']}/pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.content == b"%PDF-1.4 test resume pdf"


def test_duplicate_nonexistent_project(client):
    response = client.post("/api/projects/00000000-0000-0000-0000-000000000000/duplicate")
    assert response.status_code == 404

    response_invalid = client.post("/api/projects/invalid-id/duplicate")
    assert response_invalid.status_code == 404



def test_update_project(client):
    created = client.post(
        "/api/projects",
        json={"title": "Old Title"},
    ).json()

    response = client.patch(
        f"/api/projects/{created['id']}",
        json={"title": "New Title"},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "New Title"
    assert response.json()["created_at"] == created["created_at"]
    assert response.json()["updated_at"] == created["updated_at"]


def test_clear_project_description(client):
    created = client.post(
        "/api/projects",
        json={
            "title": "My Resume",
            "description": "Some description",
        },
    ).json()

    response = client.patch(
        f"/api/projects/{created['id']}",
        json={"description": None},
    )

    assert response.status_code == 200
    assert response.json()["description"] is None


def test_invalid_project_title(client):
    response = client.post(
        "/api/projects",
        json={"title": "   "},
    )

    assert response.status_code == 400

def test_delete_project(client, storage):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    project_id = created["id"]
    project_dir = storage.projects_dir / project_id

    assert project_dir.exists()

    response = client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 204
    assert not project_dir.exists()

    # Verify the database record is gone.
    get_response = client.get(f"/api/projects/{project_id}")
    assert get_response.status_code == 404


def test_delete_nonexistent_project(client):
    response = client.delete(
        "/api/projects/00000000-0000-0000-0000-000000000000"
    )

    assert response.status_code == 404

def test_get_project_latex(client):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    project_id = created["id"]

    response = client.get(
        f"/api/projects/{project_id}/latex"
    )

    assert response.status_code == 200
    assert response.json()["project_id"] == project_id
    assert response.json()["content"] == ""


def test_save_project_latex(client):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    project_id = created["id"]
    content = r"\documentclass{article}\begin{document}Hello\end{document}"

    response = client.put(
        f"/api/projects/{project_id}/latex",
        json={"content": content},
    )

    assert response.status_code == 200

    saved = client.get(
        f"/api/projects/{project_id}/latex"
    )

    assert saved.status_code == 200
    assert saved.json()["content"] == content


def test_get_latex_for_nonexistent_project(client):
    response = client.get(
        "/api/projects/00000000-0000-0000-0000-000000000000/latex"
    )

    assert response.status_code == 404


def test_save_latex_for_nonexistent_project(client):
    response = client.put(
        "/api/projects/00000000-0000-0000-0000-000000000000/latex",
        json={"content": "Some LaTeX"},
    )

    assert response.status_code == 404

def test_compile_project(client, storage, monkeypatch):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    project_id = created["id"]

    client.put(
        f"/api/projects/{project_id}/latex",
        json={"content": r"\documentclass{article}"},
    )

    def mock_run(*args, **kwargs):
        build_dir = Path(kwargs["cwd"])
        (build_dir / "resume.pdf").write_bytes(b"generated pdf")

        return subprocess.CompletedProcess(
            args=args[0],
            returncode=0,
            stdout="Compilation successful",
            stderr="",
        )

    monkeypatch.setattr(
        "backend.services.compilation_service.subprocess.run",
        mock_run,
    )

    response = client.post(
        f"/api/projects/{project_id}/compile"
    )

    assert response.status_code == 200
    assert response.json()["success"] is True

    assert storage.get_pdf_path(project_id).read_bytes() == b"generated pdf"


def test_compile_project_failure(client, storage, monkeypatch):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    project_id = created["id"]

    client.put(
        f"/api/projects/{project_id}/latex",
        json={"content": r"\invalidlatex"},
    )

    pdf_path = storage.get_pdf_path(project_id)
    pdf_path.write_bytes(b"previous pdf")

    def mock_run(*args, **kwargs):
        return subprocess.CompletedProcess(
            args=args[0],
            returncode=1,
            stdout="LaTeX Error",
            stderr="",
        )

    monkeypatch.setattr(
        "backend.services.compilation_service.subprocess.run",
        mock_run,
    )

    response = client.post(
        f"/api/projects/{project_id}/compile"
    )

    assert response.status_code == 422
    assert response.json()["detail"]["output"] == "LaTeX Error"

    assert pdf_path.read_bytes() == b"previous pdf"


def test_compile_nonexistent_project(client):
    response = client.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/compile"
    )

    assert response.status_code == 404

def test_get_project_pdf(client, storage):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    project_id = created["id"]
    pdf_path = storage.get_pdf_path(project_id)

    pdf_path.write_bytes(b"%PDF-1.4 test content")

    response = client.get(
        f"/api/projects/{project_id}/pdf"
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content == b"%PDF-1.4 test content"


def test_get_pdf_before_compilation(client):
    created = client.post(
        "/api/projects",
        json={"title": "My Resume"},
    ).json()

    response = client.get(
        f"/api/projects/{created['id']}/pdf"
    )

    assert response.status_code == 404


def test_get_pdf_for_nonexistent_project(client):
    response = client.get(
        "/api/projects/00000000-0000-0000-0000-000000000000/pdf"
    )

    assert response.status_code == 404


def test_post_project_event(client):
    created = client.post(
        "/api/projects",
        json={"title": "Event Test Resume"},
    ).json()

    response = client.post(
        f"/api/projects/{created['id']}/events",
        json={
            "event_type": "latex_update_started",
            "payload": {"status": "started"},
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "event_type": "latex_update_started",
    }


def test_post_event_nonexistent_project(client):
    response = client.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/events",
        json={"event_type": "test"},
    )
    assert response.status_code == 404


def test_stream_project_events(client):
    import json
    from backend.services.event_manager import event_manager

    created = client.post(
        "/api/projects",
        json={"title": "SSE Stream Test"},
    ).json()

    project_id = created["id"]

    with client.stream("GET", f"/api/projects/{project_id}/events") as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        lines = response.iter_lines()
        # Initial connected message
        connected_line = next(lines)
        assert connected_line.startswith("data: ")
        data = json.loads(connected_line[6:])
        assert data["event_type"] == "connected"

        # Emit an event
        event_manager.emit(
            project_id,
            {"event_type": "ai_writing_started", "payload": {"status": "started"}},
        )

        # Skip separator
        next(lines)
        event_line = next(lines)
        assert event_line.startswith("data: ")
        event_data = json.loads(event_line[6:])
        assert event_data["event_type"] == "ai_writing_started"

