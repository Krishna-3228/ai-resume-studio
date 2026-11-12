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


@pytest.fixture
def storage(tmp_path):
    return ProjectStorage(tmp_path / "projects")


@pytest.fixture
def client(storage):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_project_storage] = lambda: storage

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


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

