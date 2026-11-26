"""CLI entrypoint for running backend database and file seeding.

Usage:
    python -m backend.seed
    python -m backend.seed --force
    python -m backend.seed --no-project
"""

from backend.db.seed import (
    DEFAULT_MINIMAL_RESUME_LATEX,
    DEFAULT_PROFILE_DATA,
    DEFAULT_STARTER_RESUME_LATEX,
    init_database,
    init_directories,
    main,
    seed_all,
    seed_profile_files,
    seed_starter_project,
    seed_templates,
)

__all__ = [
    "DEFAULT_MINIMAL_RESUME_LATEX",
    "DEFAULT_PROFILE_DATA",
    "DEFAULT_STARTER_RESUME_LATEX",
    "init_database",
    "init_directories",
    "main",
    "seed_all",
    "seed_profile_files",
    "seed_starter_project",
    "seed_templates",
]

if __name__ == "__main__":
    main()
