from pathlib import Path
from uuid import UUID

from mcp_server.config import PROJECTS_DIR


class StorageService:

    def get_project_dir(self, project_id: str) -> Path:
        try:
            validated_id = str(UUID(project_id))
        except ValueError:
            raise ValueError("Invalid project UUID")

        project_dir = PROJECTS_DIR / validated_id

        if not project_dir.is_dir():
            raise FileNotFoundError(
                f"Project {validated_id} not found"
            )

        return project_dir

    def get_latex_file(self, project_id: str) -> Path:
        project_dir = self.get_project_dir(project_id)
        latex_file = project_dir / "resume.tex"

        if not latex_file.is_file():
            raise FileNotFoundError("LaTeX source not found")

        return latex_file

    def get_pdf_file(self, project_id: str) -> Path:
        project_dir = self.get_project_dir(project_id)
        return project_dir / "resume.pdf"