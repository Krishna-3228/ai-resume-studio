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