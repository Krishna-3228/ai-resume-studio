import subprocess
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.db.base import Base
from backend.services.compilation_service import (
    CompilationError,
    CompilationService,
)
from backend.services.project_service import ProjectService
from backend.services.project_storage import ProjectStorage


@pytest.fixture
def compilation_setup(tmp_path):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)

    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    storage = ProjectStorage(tmp_path / "projects")

    project = ProjectService(db).create_project("Test Resume")
    storage.create_project_files(project.id)

    service = CompilationService(db, storage)

    yield service, db, storage, project

    db.close()
    engine.dispose()


def test_successful_compilation(compilation_setup, monkeypatch):
    service, db, storage, project = compilation_setup

    storage.write_latex(project.id, r"\documentclass{article}")

    old_timestamp = project.updated_at

    def mock_run(*args, **kwargs):
        build_dir = Path(kwargs["cwd"])
        (build_dir / "resume.pdf").write_bytes(b"new pdf content")

        return subprocess.CompletedProcess(
            args=args[0],
            returncode=0,
            stdout="Compilation successful",
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", mock_run)

    result = service.compile_project(project.id)

    assert result["success"] is True
    assert storage.get_pdf_path(project.id).read_bytes() == b"new pdf content"

    db.refresh(project)
    assert project.updated_at != old_timestamp


def test_failed_compilation_preserves_previous_pdf(
    compilation_setup, monkeypatch
):
    service, _, storage, project = compilation_setup

    storage.write_latex(project.id, r"\invalidlatex")
    pdf_path = storage.get_pdf_path(project.id)

    pdf_path.write_bytes(b"previous successful pdf")

    def mock_run(*args, **kwargs):
        return subprocess.CompletedProcess(
            args=args[0],
            returncode=1,
            stdout="LaTeX Error",
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", mock_run)

    with pytest.raises(CompilationError):
        service.compile_project(project.id)

    assert pdf_path.read_bytes() == b"previous successful pdf"


def test_compilation_timeout(compilation_setup, monkeypatch):
    service, _, storage, project = compilation_setup

    storage.write_latex(project.id, r"\documentclass{article}")

    pdf_path = storage.get_pdf_path(project.id)
    pdf_path.write_bytes(b"previous pdf")

    def mock_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(
            cmd=args[0],
            timeout=30,
            output="Compilation timed out",
        )

    monkeypatch.setattr(subprocess, "run", mock_run)

    with pytest.raises(CompilationError, match="timed out"):
        service.compile_project(project.id)

    assert pdf_path.read_bytes() == b"previous pdf"


def test_compile_nonexistent_project(compilation_setup):
    service, _, _, _ = compilation_setup

    with pytest.raises(FileNotFoundError, match="Project not found"):
        service.compile_project(
            "00000000-0000-0000-0000-000000000000"
        )


def test_compile_without_latex_source(compilation_setup):
    service, _, storage, project = compilation_setup

    storage.get_latex_path(project.id).unlink()

    with pytest.raises(FileNotFoundError, match="LaTeX source"):
        service.compile_project(project.id)