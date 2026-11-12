import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import UUID


class ProjectStorage:
    def __init__(self, projects_dir: Path):
        self.projects_dir = Path(projects_dir).resolve()
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def _get_project_dir(self, project_id: str) -> Path:
        try:
            project_id = str(UUID(project_id))
        except ValueError as error:
            raise ValueError("Invalid project ID") from error

        return self.projects_dir / project_id

    def create_project_files(self, project_id: str) -> Path:
        project_dir = self._get_project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=False)

        try:
            (project_dir / "resume.tex").touch()
        except Exception:
            shutil.rmtree(project_dir)
            raise

        return project_dir

    def get_latex_path(self, project_id: str) -> Path:
        return self._get_project_dir(project_id) / "resume.tex"

    def get_pdf_path(self, project_id: str) -> Path:
        return self._get_project_dir(project_id) / "resume.pdf"

    def read_latex(self, project_id: str) -> str:
        latex_path = self.get_latex_path(project_id)

        if not latex_path.is_file():
            raise FileNotFoundError("LaTeX file not found")

        return latex_path.read_text(encoding="utf-8")

    def write_latex(self, project_id: str, content: str) -> None:
        project_dir = self._get_project_dir(project_id)

        if not project_dir.is_dir():
            raise FileNotFoundError("Project directory not found")

        latex_path = project_dir / "resume.tex"
        temp_path = None

        try:
            with NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=project_dir,
                delete=False,
            ) as temp_file:
                temp_file.write(content)
                temp_path = Path(temp_file.name)

            temp_path.replace(latex_path)

        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink()

    def delete_project_files(self, project_id: str) -> None:
        project_dir = self._get_project_dir(project_id)

        if project_dir.exists():
            shutil.rmtree(project_dir)

    def stage_project_deletion(self, project_id: str) -> Path | None:
        project_dir = self._get_project_dir(project_id)

        if not project_dir.exists():
            return None

        tombstone_dir = self.projects_dir / f".deleting-{project_id}"

        if tombstone_dir.exists():
            raise FileExistsError("Project deletion is already in progress")

        project_dir.rename(tombstone_dir)
        return tombstone_dir


    def restore_project_deletion(self, project_id: str) -> None:
        project_dir = self._get_project_dir(project_id)
        tombstone_dir = self.projects_dir / f".deleting-{project_id}"

        if tombstone_dir.exists():
            tombstone_dir.rename(project_dir)


    def finalize_project_deletion(self, tombstone_dir: Path) -> None:
        if tombstone_dir.exists():
            shutil.rmtree(tombstone_dir)