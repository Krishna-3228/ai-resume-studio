import os
from pathlib import Path


# Repository root:
# ai-resume-studio/
REPO_ROOT = Path(__file__).resolve().parents[3]


def get_data_dir() -> Path:
    """
    Resolve the shared AI Resume Studio data directory.

    Uses RESUME_DATA_DIR when provided.
    Otherwise defaults to the repository's data/ directory.
    """
    configured_path = os.getenv("RESUME_DATA_DIR")

    if configured_path:
        data_dir = Path(configured_path).expanduser()

        if not data_dir.is_absolute():
            data_dir = REPO_ROOT / data_dir
    else:
        data_dir = REPO_ROOT / "data"

    return data_dir.resolve()


DATA_DIR = get_data_dir()
PROFILE_DIR = DATA_DIR / "profile"
PROJECTS_DIR = DATA_DIR / "projects"
EVENTS_DIR = DATA_DIR / "events"