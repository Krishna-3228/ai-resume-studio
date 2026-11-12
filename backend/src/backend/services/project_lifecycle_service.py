from sqlalchemy.orm import Session

from backend.models import Project
from backend.services.project_storage import ProjectStorage


class ProjectLifecycleService:
    def __init__(self, db: Session, storage: ProjectStorage):
        self.db = db
        self.storage = storage

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

        project_files_created = False

        try:
            self.db.add(project)

            # Generate the project ID without committing yet.
            self.db.flush()

            # Create the corresponding filesystem directory.
            self.storage.create_project_files(project.id)
            project_files_created = True

            # Commit only after filesystem creation succeeds.
            self.db.commit()
            self.db.refresh(project)

            return project

        except Exception:
            self.db.rollback()

            if project_files_created:
                self.storage.delete_project_files(project.id)

            raise

    def delete_project(self, project_id: str) -> bool:
        project = self.db.get(Project, project_id)

        if project is None:
            return False

        tombstone_dir = self.storage.stage_project_deletion(project_id)

        try:
            self.db.delete(project)
            self.db.commit()

        except Exception:
            self.db.rollback()
            self.storage.restore_project_deletion(project_id)
            raise

        if tombstone_dir is not None:
            try:
                self.storage.finalize_project_deletion(tombstone_dir)
            except OSError:
                # Database deletion succeeded, but filesystem cleanup failed.
                # The leftover tombstone can be cleaned up separately.
                import logging
                logging.exception("Could not remove project directory: %s", project_id)

        return True