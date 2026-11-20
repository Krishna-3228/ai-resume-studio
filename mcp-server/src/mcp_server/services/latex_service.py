import shutil
import subprocess
import tempfile
from pathlib import Path

from mcp_server.services.event_service import EventService
from mcp_server.services.storage_service import StorageService


def _extract_clean_error(raw_output: str) -> str:
    lines = raw_output.splitlines()
    error_lines = []
    capture = False
    for line in lines:
        if line.startswith("!"):
            capture = True
            error_lines.append(line)
        elif capture:
            if line.startswith("l.") or line.strip().startswith("..."):
                error_lines.append(line)
                capture = False
            elif line.startswith("Here is how much") or line.startswith("No pages of output."):
                capture = False
            elif len(error_lines) < 6 and line.strip():
                error_lines.append(line)

    if error_lines:
        return "\n".join(error_lines)

    non_empty = [l for l in lines if l.strip()]
    return "\n".join(non_empty[-6:]) if non_empty else "LaTeX compilation failed with unspecified error."


class LatexService:
    def __init__(self):
        self.event_service = EventService()
        self.storage_service = StorageService()

    def compile(self, project_id: str) -> dict:
        latex_file = self.storage_service.get_latex_file(project_id)
        project_dir = latex_file.parent

        if not shutil.which("pdflatex"):
            raise RuntimeError("pdflatex is not installed")

        # Notify compile started
        self.event_service.emit_event(
            project_id,
            "pdf_compile_started",
            {"project_id": project_id, "status": "compiling"},
        )

        with tempfile.TemporaryDirectory(dir=project_dir) as temp_dir:
            result = subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-output-directory",
                    temp_dir,
                    str(latex_file),
                ],
                capture_output=True,
                text=True,
                timeout=60,
                cwd=project_dir,
            )

            generated_pdf = Path(temp_dir) / "resume.pdf"

            if result.returncode != 0 or not generated_pdf.is_file():
                raw_error = result.stdout + result.stderr
                clean_error = _extract_clean_error(raw_error)
                self.event_service.emit_event(
                    project_id,
                    "pdf_compile_failed",
                    {
                        "project_id": project_id,
                        "status": "failed",
                        "error": clean_error,
                    },
                )
                return {
                    "success": False,
                    "message": "LaTeX compilation failed",
                    "output": clean_error,
                }

            pdf_file = project_dir / "resume.pdf"
            generated_pdf.replace(pdf_file)

        # Notify compile completed
        self.event_service.emit_event(
            project_id,
            "pdf_compiled",
            {"project_id": project_id, "status": "completed", "success": True},
        )

        return {
            "success": True,
            "message": "Resume compiled successfully",
        }
