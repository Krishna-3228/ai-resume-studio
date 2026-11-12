import pytest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.models import Project
from backend.services.project_service import ProjectService


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as session:
        yield session

    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def service(db_session):
    return ProjectService(db_session)


def test_create_project(service):
    project = service.create_project(
        title="Software Engineer Resume",
        description="Resume for software engineering roles",
    )

    assert project.id is not None
    assert project.title == "Software Engineer Resume"
    assert project.description == "Resume for software engineering roles"
    assert project.status == "draft"


def test_create_project_without_description(service):
    project = service.create_project("Security Analyst Resume")

    assert project.description is None


def test_create_project_with_empty_title(service):
    with pytest.raises(ValueError):
        service.create_project("   ")


def test_list_projects(service):
    service.create_project("Project A")
    service.create_project("Project B")

    projects = service.list_projects()

    assert len(projects) == 2


def test_get_project(service):
    created = service.create_project("My Resume")

    project = service.get_project(created.id)

    assert project is not None
    assert project.title == "My Resume"


def test_get_nonexistent_project(service):
    assert service.get_project("nonexistent-id") is None


def test_update_project(service):
    project = service.create_project("Old Title")

    updated = service.update_project(
        project.id,
        title="New Title",
    )

    assert updated is not None
    assert updated.title == "New Title"


def test_delete_project(service):
    project = service.create_project("Temporary Resume")

    result = service.delete_project(project.id)

    assert result is True
    assert service.get_project(project.id) is None


def test_delete_nonexistent_project(service):
    assert service.delete_project("nonexistent-id") is False

def test_metadata_update_does_not_change_updated_at(service):
    project = service.create_project("Original Title")

    original_updated_at = project.updated_at

    updated = service.update_project(
        project.id,
        title="New Title",
        description="Updated description",
    )

    assert updated is not None
    assert updated.title == "New Title"
    assert updated.updated_at == original_updated_at