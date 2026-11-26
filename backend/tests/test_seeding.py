import sys
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.db.seed import (
    DEFAULT_PROFILE_DATA,
    DEFAULT_STARTER_RESUME_LATEX,
    init_database,
    init_directories,
    main,
    seed_all,
    seed_profile_files,
    seed_starter_project,
    seed_templates,
)
from backend.models.project import Project
from backend.services.profile_service import ProfileService
from backend.services.project_storage import ProjectStorage


@pytest.fixture
def test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield engine
    engine.dispose()


@pytest.fixture
def test_db(test_engine):
    init_database(test_engine)
    with Session(test_engine) as session:
        yield session


def test_init_directories(tmp_path):
    data_dir = tmp_path / "custom_data"
    repo_root = tmp_path / "custom_repo"

    dirs = init_directories(data_dir, repo_root)

    assert data_dir.is_dir()
    assert (data_dir / "profile").is_dir()
    assert (data_dir / "projects").is_dir()
    assert (data_dir / "events").is_dir()
    assert (data_dir / "locks").is_dir()
    assert (repo_root / "templates").is_dir()
    assert (repo_root / "resources" / "templates").is_dir()
    assert (repo_root / "resources" / "profile").is_dir()
    assert len(dirs) == 9


def test_init_database(test_engine):
    init_database(test_engine)

    with test_engine.connect() as conn:
        tables = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()
        table_names = {row[0] for row in tables}

        assert "projects" in table_names
        assert "alembic_version" in table_names

        version = conn.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar()
        assert version == "12d8272cc9c8"


def test_seed_profile_files_from_examples(tmp_path):
    profile_dir = tmp_path / "profile"
    profile_dir.mkdir()

    # Create an example file for education
    (profile_dir / "education.yaml.example").write_text(
        "education:\n  - degree: Test Degree\n", encoding="utf-8"
    )

    seeded = seed_profile_files(profile_dir)

    assert "education" in seeded
    assert (profile_dir / "education.yaml").read_text(
        encoding="utf-8"
    ) == "education:\n  - degree: Test Degree\n"

    # All allowed sections should now exist
    for section in ProfileService.ALLOWED_SECTIONS:
        assert (profile_dir / f"{section}.yaml").is_file()


def test_seed_profile_files_from_fallback(tmp_path):
    profile_dir = tmp_path / "empty_profile"
    profile_dir.mkdir()

    seeded = seed_profile_files(profile_dir)

    assert set(seeded) == ProfileService.ALLOWED_SECTIONS
    personal_info = (profile_dir / "personal-info.yaml").read_text(encoding="utf-8")
    assert "John Doe" in personal_info


def test_seed_profile_files_idempotent(tmp_path):
    profile_dir = tmp_path / "profile"
    profile_dir.mkdir()

    custom_content = "custom: content\n"
    (profile_dir / "skills.yaml").write_text(custom_content, encoding="utf-8")

    # Initial seed should not overwrite skills.yaml
    seeded = seed_profile_files(profile_dir, force=False)
    assert "skills" not in seeded
    assert (profile_dir / "skills.yaml").read_text(encoding="utf-8") == custom_content

    # Force seed should overwrite
    seeded_force = seed_profile_files(profile_dir, force=True)
    assert "skills" in seeded_force
    assert (profile_dir / "skills.yaml").read_text(encoding="utf-8") != custom_content


def test_seed_templates(tmp_path):
    templates_dir = tmp_path / "templates"
    resources_dir = tmp_path / "resources"
    resources_templates = resources_dir / "templates"
    resources_templates.mkdir(parents=True)

    custom_template = "% Custom Starter Template"
    (resources_templates / "starter_resume.tex").write_text(
        custom_template, encoding="utf-8"
    )

    seeded = seed_templates(templates_dir, resources_dir=resources_dir)

    assert "starter_resume.tex" in seeded
    assert "minimal_resume.tex" in seeded
    assert (templates_dir / "starter_resume.tex").read_text(
        encoding="utf-8"
    ) == custom_template
    assert (templates_dir / "minimal_resume.tex").is_file()


def test_seed_starter_project_empty_db(test_db, tmp_path):
    storage = ProjectStorage(tmp_path / "projects")

    project = seed_starter_project(test_db, storage)

    assert project is not None
    assert project.title == "Software Engineer Resume"
    assert storage.read_latex(project.id).startswith(r"\documentclass")

    saved = test_db.get(Project, project.id)
    assert saved is not None


def test_seed_starter_project_skips_when_exists(test_db, tmp_path):
    storage = ProjectStorage(tmp_path / "projects")

    first = seed_starter_project(test_db, storage)
    assert first is not None

    # Second call should skip without force
    second = seed_starter_project(test_db, storage, force=False)
    assert second is None

    # With force=True, creates another project
    forced = seed_starter_project(test_db, storage, force=True)
    assert forced is not None
    assert forced.id != first.id


def test_seed_all_end_to_end(tmp_path, test_engine):
    data_dir = tmp_path / "fresh_data"
    repo_root = tmp_path / "fresh_repo"

    storage = ProjectStorage(data_dir / "projects")

    with Session(test_engine) as session:
        result = seed_all(
            data_dir=data_dir,
            repo_root=repo_root,
            engine=test_engine,
            db=session,
            storage=storage,
            seed_project=True,
            force=False,
        )

    assert result["database"] == "initialized"
    assert len(result["profile_files"]) == len(ProfileService.ALLOWED_SECTIONS)
    assert "starter_resume.tex" in result["templates"]
    assert result["starter_project"] is not None

    # Verify project exists in storage
    project_id = result["starter_project"]
    assert storage.get_latex_path(project_id).is_file()

    # Re-running seed_all should be idempotent
    with Session(test_engine) as session:
        repeat_result = seed_all(
            data_dir=data_dir,
            repo_root=repo_root,
            engine=test_engine,
            db=session,
            storage=storage,
            seed_project=True,
            force=False,
        )

    assert repeat_result["profile_files"] == []
    assert repeat_result["templates"] == []
    assert repeat_result["starter_project"] is None


def test_cli_main(tmp_path):
    data_dir = tmp_path / "cli_data"

    test_args = [
        "seed",
        "--data-dir",
        str(data_dir),
        "--no-project",
    ]

    with patch.object(sys, "argv", test_args):
        main()

    assert data_dir.is_dir()
    assert (data_dir / "profile").is_dir()
    for section in ProfileService.ALLOWED_SECTIONS:
        assert (data_dir / "profile" / f"{section}.yaml").is_file()
