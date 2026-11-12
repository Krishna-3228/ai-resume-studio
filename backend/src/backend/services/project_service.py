from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Project
from datetime import datetime, timezone

class ProjectService:

    def __init__(self, db: Session):
        self.db = db

    def create_project(
        self,
        title: str,
        description: str | None = None,
    ) -> Project:
        title = title.strip()

        if not title:
            raise ValueError("Project title cannot be empty")

        project = Project(
            title=title,
            description=description,
        )

        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)

        return project

    def list_projects(self) -> list[Project]:
        statement = (
            select(Project)
            .order_by(Project.updated_at.desc())
        )

        return list(self.db.scalars(statement).all())

    def get_project(self, project_id: str) -> Project | None:
        return self.db.get(Project, project_id)

    def update_project(
        self,
        project_id: str,
        title: str | None = None,
        description: str | None = None,
        update_description: bool = False,
    ) -> Project | None:
        project = self.get_project(project_id)

        if project is None:
            return None

        if title is not None:
            title = title.strip()

            if not title:
                raise ValueError("Project title cannot be empty")

            project.title = title

        if description is not None or update_description:
            project.description = description

        self.db.commit()
        self.db.refresh(project)

        return project

    def delete_project(self, project_id: str) -> bool:
        project = self.get_project(project_id)

        if project is None:
            return False

        self.db.delete(project)
        self.db.commit()

        return True

    def update_document_timestamp(self, project_id: str) -> bool:
        project = self.get_project(project_id)

        if project is None:
            return False

        project.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(project)

        return True