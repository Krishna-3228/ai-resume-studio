import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4


class ProjectService:
    def __init__(self, projects_dir: Path):
        self.projects_dir = Path(projects_dir).resolve()
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def create_project(self, title: str) -> dict:
        title = title.strip()

        if not title:
            raise ValueError("Project title cannot be empty")

        project_id = str(uuid4())
        project_dir = self.projects_dir / project_id

        project_dir.mkdir(parents=True)

        project = {
            "id": project_id,
            "title": title,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            metadata_path = project_dir / "project.json"

            with metadata_path.open("w", encoding="utf-8") as file:
                json.dump(project, file, indent=4)

            (project_dir / "resume.tex").write_text(
                "",
                encoding="utf-8",
            )

            (project_dir / "output").mkdir()

        except Exception:
            import shutil
            shutil.rmtree(project_dir, ignore_errors=True)
            raise

        return project

    def list_projects(self) -> list[dict]:
        projects = []

        for project_dir in self.projects_dir.iterdir():
            metadata_path = project_dir / "project.json"

            if not project_dir.is_dir() or not metadata_path.exists():
                continue

            with metadata_path.open(encoding="utf-8") as file:
                projects.append(json.load(file))

        return sorted(
            projects,
            key=lambda project: project["updated_at"],
            reverse=True,
        )