import shutil
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy.orm import Session

from backend.services.project_service import ProjectService
from backend.services.project_storage import ProjectStorage


class CompilationError(Exception):
    def __init__(self, message: str, output: str = ""):
        super().__init__(message)
        self.output = output


class CompilationService:
    def __init__(
        self,
        db: Session,
        storage: ProjectStorage,
        timeout: int = 30,
    ):
        self.db = db
        self.storage = storage
        self.timeout = timeout
        self.project_service = ProjectService(db)

    def compile_project(self, project_id: str) -> dict:
        project = self.project_service.get_project(project_id)

        if project is None:
            raise FileNotFoundError("Project not found")

        project_dir = self.storage._get_project_dir(project_id)
        latex_path = self.storage.get_latex_path(project_id)

        if not latex_path.is_file():
            raise FileNotFoundError("LaTeX source file not found")

        pdf_path = self.storage.get_pdf_path(project_id)

        with tempfile.TemporaryDirectory(
            prefix=".compile-",
            dir=project_dir,
        ) as temp_dir:
            build_dir = Path(temp_dir)

            shutil.copy2(latex_path, build_dir / "resume.tex")

            try:
                result = subprocess.run(
                    [
                        "pdflatex",
                        "-no-shell-escape",
                        "-interaction=nonstopmode",
                        "-halt-on-error",
                        "-file-line-error",
                        "resume.tex",
                    ],
                    cwd=build_dir,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                    check=False,
                )

            except subprocess.TimeoutExpired as error:
                output = error.stdout or ""
                if isinstance(output, bytes):
                    output = output.decode(errors="replace")

                raise CompilationError(
                    "LaTeX compilation timed out",
                    output,
                ) from error

            except FileNotFoundError as error:
                raise CompilationError(
                    "pdflatex executable not found"
                ) from error

            output = result.stdout + result.stderr
            compiled_pdf = build_dir / "resume.pdf"

            if result.returncode != 0 or not compiled_pdf.is_file():
                raise CompilationError(
                    "LaTeX compilation failed",
                    output,
                )

            # Replace the previous PDF only after successful compilation.
            compiled_pdf.replace(pdf_path)

        self.project_service.update_document_timestamp(project_id)

        return {
            "success": True,
            "message": "PDF generated successfully",
        }