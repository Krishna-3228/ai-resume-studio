from uuid import uuid4

import pytest

from backend.services.project_storage import ProjectStorage


@pytest.fixture
def storage(tmp_path):
    return ProjectStorage(tmp_path / "projects")


def test_create_project_files(storage):
    project_id = str(uuid4())

    project_dir = storage.create_project_files(project_id)

    assert project_dir.exists()
    assert (project_dir / "resume.tex").exists()
    assert not (project_dir / "resume.pdf").exists()


def test_read_and_write_latex(storage):
    project_id = str(uuid4())
    storage.create_project_files(project_id)

    content = r"\documentclass{article}\begin{document}Hello\end{document}"

    storage.write_latex(project_id, content)

    assert storage.read_latex(project_id) == content


def test_read_missing_latex(storage):
    project_id = str(uuid4())
    storage.create_project_files(project_id)

    (storage.get_latex_path(project_id)).unlink()

    with pytest.raises(FileNotFoundError):
        storage.read_latex(project_id)


def test_write_to_missing_project(storage):
    with pytest.raises(FileNotFoundError):
        storage.write_latex(str(uuid4()), "Some LaTeX")


def test_delete_project_files(storage):
    project_id = str(uuid4())
    project_dir = storage.create_project_files(project_id)

    storage.delete_project_files(project_id)

    assert not project_dir.exists()


def test_invalid_project_id(storage):
    with pytest.raises(ValueError):
        storage.create_project_files("../../somewhere")