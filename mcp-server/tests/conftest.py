from uuid import uuid4

import pytest

from mcp_server.services import event_service as event_service_module
from mcp_server.services import storage_service as storage_service_module
from mcp_server.services.event_service import EventService
from mcp_server.services.project_service import ProjectService
from mcp_server import config as config_module


@pytest.fixture
def isolated_storage(tmp_path, monkeypatch):
    """Redirect project and event persistence into this test's temp directory."""
    projects_dir = tmp_path / "projects"
    events_dir = tmp_path / "events"
    projects_dir.mkdir()
    events_dir.mkdir()

    monkeypatch.setattr(storage_service_module, "PROJECTS_DIR", projects_dir)
    monkeypatch.setattr(event_service_module, "EVENTS_DIR", events_dir)

    return projects_dir, events_dir


@pytest.fixture
def project(isolated_storage):
    projects_dir, _ = isolated_storage
    project_id = str(uuid4())
    project_dir = projects_dir / project_id
    project_dir.mkdir()
    latex_file = project_dir / "resume.tex"
    latex_file.write_text(
        r"\documentclass{article}\begin{document}Initial resume\end{document}",
        encoding="utf-8",
    )
    return project_id, project_dir, latex_file


@pytest.fixture
def services(isolated_storage):
    # Construct after isolated_storage patches the module-level directories.
    return ProjectService(), EventService()
