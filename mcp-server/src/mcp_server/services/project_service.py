from uuid import uuid4

from mcp_server.services.event_service import EventService
from mcp_server.services.latex_service import LatexService
from mcp_server.services.storage_service import StorageService


class ProjectService:
    def __init__(self):
        self.storage_service = StorageService()
        self.event_service = EventService()
        self.latex_service = LatexService()

    def read_latex(self, project_id: str) -> str:
        latex_file = self.storage_service.get_latex_file(project_id)
        return latex_file.read_text(encoding="utf-8")

    def write_latex(self, project_id: str, content: str) -> dict:
        latex_file = self.storage_service.get_latex_file(project_id)
        operation_id = str(uuid4())

        # Notify that AI editing/writing has started
        self.event_service.emit_event(
            project_id,
            "latex_update_started",
            {
                "operation_id": operation_id,
                "source": "mcp",
                "status": "started",
            },
        )

        try:
            # Write new content to resume.tex
            latex_file.write_text(content, encoding="utf-8")

            # Notify that AI editing/writing completed with the updated content
            self.event_service.emit_event(
                project_id,
                "latex_updated",
                {
                    "operation_id": operation_id,
                    "source": "mcp",
                    "status": "completed",
                    "content": content,
                },
            )

            # Automatically compile the updated LaTeX into PDF
            compile_res = self.latex_service.compile(project_id)
            if not compile_res.get("success", False):
                return {
                    "project_id": project_id,
                    "operation_id": operation_id,
                    "success": False,
                    "message": "LaTeX source updated, but compilation failed.",
                    "compile_error": compile_res.get("output", "Compilation error"),
                }

            return {
                "project_id": project_id,
                "operation_id": operation_id,
                "success": True,
                "message": "LaTeX source updated and PDF compiled successfully.",
            }
        except Exception as error:
            self.event_service.emit_event(
                project_id,
                "latex_update_failed",
                {
                    "operation_id": operation_id,
                    "source": "mcp",
                    "status": "failed",
                    "error": str(error),
                },
            )
            raise
