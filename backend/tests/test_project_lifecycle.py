from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from backend.db.base import Base
from backend.models import Project
from backend.services.project_lifecycle_service import ProjectLifecycleService
from backend.services.project_storage import ProjectStorage


@pytest.fixture
def lifecycle(tmp_path):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)

    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    storage = ProjectStorage(tmp_path / "projects")
    service = ProjectLifecycleService(db, storage)

    yield service, db, storage

    db.close()
    engine.dispose()


def test_create_project(lifecycle):
    service, db, storage = lifecycle

    project = service.create_project(
        "Software Engineer Resume",
        "Backend development roles",
    )

    assert project.id
    assert project.title == "Software Engineer Resume"

    project_dir = storage.projects_dir / project.id

    assert project_dir.exists()
    assert (project_dir / "resume.tex").exists()

    saved_project = db.get(Project, project.id)
    assert saved_project is not None


def test_create_project_without_description(lifecycle):
    service, _, storage = lifecycle

    project = service.create_project("My Resume")

    assert project.description is None
    assert storage.get_latex_path(project.id).exists()


def test_invalid_title_does_not_create_project(lifecycle):
    service, db, storage = lifecycle

    with pytest.raises(ValueError):
        service.create_project("   ")

    projects = db.scalars(select(Project)).all()

    assert len(projects) == 0
    assert list(storage.projects_dir.iterdir()) == []


def test_filesystem_failure_rolls_back_database(lifecycle, monkeypatch):
    service, db, storage = lifecycle

    def fail_creation(project_id):
        raise OSError("Simulated filesystem failure")

    monkeypatch.setattr(storage, "create_project_files", fail_creation)

    with pytest.raises(OSError):
        service.create_project("My Resume")

    projects = db.scalars(select(Project)).all()

    assert len(projects) == 0

def test_delete_project(lifecycle):
    service, db, storage = lifecycle

    project = service.create_project("My Resume")
    project_dir = storage.projects_dir / project.id

    assert project_dir.exists()

    result = service.delete_project(project.id)

    assert result is True
    assert db.get(Project, project.id) is None
    assert not project_dir.exists()


def test_delete_nonexistent_project(lifecycle):
    service, db, storage = lifecycle

    result = service.delete_project(str(uuid4()))

    assert result is False
    assert db.scalars(select(Project)).all() == []


def test_delete_project_restores_files_on_database_failure(
    lifecycle, monkeypatch
):
    service, db, storage = lifecycle

    project = service.create_project("My Resume")
    project_dir = storage.projects_dir / project.id

    def fail_commit():
        raise RuntimeError("Simulated database failure")

    monkeypatch.setattr(db, "commit", fail_commit)

    with pytest.raises(RuntimeError):
        service.delete_project(project.id)

    assert db.get(Project, project.id) is not None
    assert project_dir.exists()


def test_delete_project_cleans_up_chat_history(lifecycle, tmp_path):
    import sqlite3
    service, db, storage = lifecycle

    chat_db = tmp_path / "test_chat.db"
    service.chat_db_path = chat_db

    # Create dummy checkpoints and writes tables with rows for project
    with sqlite3.connect(str(chat_db)) as conn:
        conn.execute("CREATE TABLE checkpoints (thread_id TEXT, checkpoint_id TEXT)")
        conn.execute("CREATE TABLE writes (thread_id TEXT, task_id TEXT)")

    project = service.create_project("Chatting Project")

    with sqlite3.connect(str(chat_db)) as conn:
        conn.execute("INSERT INTO checkpoints VALUES (?, ?)", (project.id, "c1"))
        conn.execute("INSERT INTO writes VALUES (?, ?)", (project.id, "w1"))
        conn.execute("INSERT INTO checkpoints VALUES (?, ?)", ("other-project", "c2"))
        conn.commit()

    service.delete_project(project.id)

    # Verify project's rows were removed, other project intact
    with sqlite3.connect(str(chat_db)) as conn:
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM checkpoints WHERE thread_id = ?", (project.id,))
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT count(*) FROM writes WHERE thread_id = ?", (project.id,))
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT count(*) FROM checkpoints WHERE thread_id = ?", ("other-project",))
        assert cur.fetchone()[0] == 1


def test_duplicate_project(lifecycle):
    service, db, storage = lifecycle

    source = service.create_project(
        "Software Engineer Resume",
        "Backend development roles",
    )
    storage.write_latex(source.id, r"\documentclass{article}\begin{document}Original LaTeX\end{document}")
    (storage.get_pdf_path(source.id)).write_bytes(b"%PDF-1.4 compiled content")

    duplicate = service.duplicate_project(source.id)

    assert duplicate.id != source.id
    # Name and description copied as it is
    assert duplicate.title == source.title
    assert duplicate.description == source.description
    assert duplicate.status == source.status

    # LaTeX and resume PDF copied
    assert storage.read_latex(duplicate.id) == r"\documentclass{article}\begin{document}Original LaTeX\end{document}"
    assert storage.get_pdf_path(duplicate.id).read_bytes() == b"%PDF-1.4 compiled content"

    # Both projects exist in database
    assert db.get(Project, source.id) is not None
    assert db.get(Project, duplicate.id) is not None


def test_duplicate_project_without_description(lifecycle):
    service, db, storage = lifecycle

    source = service.create_project("Minimal Resume")
    duplicate = service.duplicate_project(source.id)

    assert duplicate.id != source.id
    assert duplicate.title == "Minimal Resume"
    assert duplicate.description is None
    assert storage.get_latex_path(duplicate.id).exists()


def test_duplicate_nonexistent_project(lifecycle):
    service, db, storage = lifecycle

    with pytest.raises(FileNotFoundError):
        service.duplicate_project(str(uuid4()))


def test_duplicate_filesystem_failure_rolls_back_database(lifecycle, monkeypatch):
    service, db, storage = lifecycle

    source = service.create_project("Failing Duplicate")

    def fail_copy(source_id, target_id):
        raise OSError("Simulated copy failure")

    monkeypatch.setattr(storage, "copy_project_files", fail_copy)

    with pytest.raises(OSError):
        service.duplicate_project(source.id)

    # Only original project exists in database
    projects = db.scalars(select(Project)).all()
    assert len(projects) == 1
    assert projects[0].id == source.id

