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


def test_copy_project_files(storage):
    source_id = str(uuid4())
    target_id = str(uuid4())

    storage.create_project_files(source_id)
    storage.write_latex(source_id, r"\documentclass{article}\begin{document}Original\end{document}")
    (storage.get_pdf_path(source_id)).write_bytes(b"%PDF-1.4 sample pdf content")
    # Add a lock file in source dir which should NOT be copied
    (storage._get_project_dir(source_id) / ".resume.lock").touch()

    target_dir = storage.copy_project_files(source_id, target_id)

    assert target_dir.exists()
    assert storage.read_latex(target_id) == r"\documentclass{article}\begin{document}Original\end{document}"
    assert storage.get_pdf_path(target_id).read_bytes() == b"%PDF-1.4 sample pdf content"
    assert not (target_dir / ".resume.lock").exists()


def test_copy_project_files_missing_source(storage):
    with pytest.raises(FileNotFoundError):
        storage.copy_project_files(str(uuid4()), str(uuid4()))
