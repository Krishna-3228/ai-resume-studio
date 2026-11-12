from sqlalchemy.orm import Session

from backend.services.project_service import ProjectService
from backend.services.project_storage import ProjectStorage


class DocumentService:
    def __init__(self, db: Session, storage: ProjectStorage):
        self.db = db
        self.storage = storage
        self.project_service = ProjectService(db)

    def get_latex(self, project_id: str) -> str:
        project = self.project_service.get_project(project_id)

        if project is None:
            raise FileNotFoundError("Project not found")

        return self.storage.read_latex(project_id)

    def save_latex(self, project_id: str, content: str) -> None:
        project = self.project_service.get_project(project_id)

        if project is None:
            raise FileNotFoundError("Project not found")

        current_content = self.storage.read_latex(project_id)

        if current_content == content:
            return

        self.storage.write_latex(project_id, content)

        self.project_service.update_document_timestamp(project_id)