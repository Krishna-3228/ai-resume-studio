from backend.db.session import DATABASE_PATH
from backend.services.project_storage import ProjectStorage

project_storage = ProjectStorage(DATABASE_PATH.parent / "projects")


def get_project_storage() -> ProjectStorage:
    return project_storage