import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.db.base import Base
from backend.services.document_service import DocumentService
from backend.services.project_service import ProjectService
from backend.services.project_storage import ProjectStorage


@pytest.fixture
def document_setup(tmp_path):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)

    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    storage = ProjectStorage(tmp_path / "projects")

    # Create a project and its corresponding files.
    project = ProjectService(db).create_project("Test Resume")
    storage.create_project_files(project.id)

    service = DocumentService(db, storage)

    yield service, db, storage, project

    db.close()
    engine.dispose()


def test_get_latex(document_setup):
    service, _, _, project = document_setup

    assert service.get_latex(project.id) == ""


def test_save_and_read_latex(document_setup):
    service, _, _, project = document_setup

    content = r"\documentclass{article}\begin{document}Hello\end{document}"

    service.save_latex(project.id, content)

    assert service.get_latex(project.id) == content


def test_save_latex_updates_timestamp(document_setup):
    service, db, _, project = document_setup

    old_timestamp = project.updated_at

    service.save_latex(project.id, r"\documentclass{article}")

    db.refresh(project)

    assert project.updated_at != old_timestamp


def test_saving_unchanged_latex_does_not_update_timestamp(document_setup):
    service, db, _, project = document_setup

    content = r"\documentclass{article}"

    service.save_latex(project.id, content)

    db.refresh(project)
    timestamp_after_first_save = project.updated_at

    service.save_latex(project.id, content)

    db.refresh(project)

    assert project.updated_at == timestamp_after_first_save


def test_get_latex_for_nonexistent_project(document_setup):
    service, _, _, _ = document_setup

    with pytest.raises(FileNotFoundError):
        service.get_latex("00000000-0000-0000-0000-000000000000")


def test_save_latex_for_nonexistent_project(document_setup):
    service, _, _, _ = document_setup

    with pytest.raises(FileNotFoundError):
        service.save_latex(
            "00000000-0000-0000-0000-000000000000",
            "Some LaTeX",
        )