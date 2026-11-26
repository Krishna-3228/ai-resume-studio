"""Database and file seeding module for AI Resume Studio.

Initializes necessary runtime directories, database tables, profile YAML files,
resources, and starter resume project when the application runs for the first time.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from backend.db.base import Base
from backend.db.session import (
    REPO_ROOT,
    SessionLocal,
    data_dir as default_data_dir,
    engine as default_engine,
)
from backend.models.project import Project
from backend.services.compilation_service import CompilationService
from backend.services.profile_service import ProfileService
from backend.services.project_lifecycle_service import ProjectLifecycleService
from backend.services.project_storage import ProjectStorage

logger = logging.getLogger(__name__)

# Fallback profile section content if example files are missing
DEFAULT_PROFILE_DATA: dict[str, str] = {
    "personal-info": """full_name: John Doe
email: johndoe@example.com
phone: "+1 555-012-3456"
github: https://github.com/johndoe
linkedin: https://linkedin.com/in/johndoe
""",
    "education": """education:
  - type: graduation
    institution: ABC University
    address: San Francisco, CA
    degree: B.S. in Computer Science
    batch: 2020-2024
    cgpa: 3.8/4.0

  - type: high_school
    institution: Central High School
    address: San Francisco, CA
    batch: 2020
    percentage: 95%
""",
    "experience": """experience:
  - role: Software Engineer
    company: Tech Innovations Corp
    location: San Francisco, CA
    period: 2024 - Present
    highlights:
      - Developed and maintained RESTful APIs using Python and FastAPI.
      - Built interactive frontend components in React and TypeScript.
      - Collaborated on database schema design and optimization.

  - role: Software Engineer Intern
    company: Digital Solutions Studio
    location: Remote
    period: 2023 - 2024
    highlights:
      - Implemented automated CI/CD pipelines using GitHub Actions and Docker.
      - Designed modular UI components improving page load performance.
""",
    "skills": """languages:
  - Python
  - TypeScript
  - JavaScript
  - Go
  - SQL

frameworks:
  - FastAPI
  - React
  - Node.js
  - Next.js
  - Express

databases:
  - PostgreSQL
  - SQLite
  - Redis
  - MongoDB

tools:
  - Docker
  - Git
  - GitHub Actions
  - Linux
  - LaTeX
""",
    "projects": """projects:
  - name: AI Resume Studio
    tech_stack:
      - Python
      - FastAPI
      - React
      - TypeScript
      - LaTeX
    github_link: https://github.com/example/ai-resume-studio
    live_demo_link: https://resume-studio.example.com
    description:
      - Built an interactive LaTeX resume editor with real-time compilation and AI assistance.
      - Implemented atomic document storage, project duplication, and persistent profile synchronization.

  - name: Distributed Task Orchestrator
    tech_stack:
      - Python
      - Redis
      - Docker
    github_link: https://github.com/example/task-orchestrator
    description:
      - Engineered an asynchronous job queue processing concurrent background tasks with failure recovery.
""",
    "certifications": """certifications:
  - name: AWS Certified Solutions Architect
    provider: Amazon Web Services
    certificate_link: https://aws.amazon.com/certification
    tags:
      - Cloud Computing
      - AWS
      - Architecture

  - name: Professional Scrum Master
    provider: Scrum.org
    tags:
      - Agile
      - Scrum
""",
}

DEFAULT_STARTER_RESUME_LATEX = r"""\documentclass[11pt,a4paper]{article}
\usepackage[margin=0.75in]{geometry}
\usepackage{hyperref}
\usepackage{enumitem}
\usepackage{titlesec}

\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    urlcolor=blue,
}

\setlist[itemize]{noitemsep, topsep=2pt, leftmargin=1.5em}
\titleformat{\section}{\large\bfseries}{}{0em}{}[\titlerule]
\titlespacing*{\section}{0pt}{10pt}{6pt}

\pagestyle{empty}

\begin{document}

\begin{center}
    {\LARGE \textbf{Alex Morgan}} \\ \vspace{4pt}
    San Francisco, CA \ \textbullet\ \href{mailto:alex.morgan@example.com}{alex.morgan@example.com} \ \textbullet\ (555) 123-4567 \\
    \href{https://github.com/alexmorgan}{github.com/alexmorgan} \ \textbullet\ \href{https://linkedin.com/in/alexmorgan}{linkedin.com/in/alexmorgan}
\end{center}

\section*{Summary}
Results-driven Software Engineer with expertise in building scalable web applications, RESTful APIs, and cloud services using modern technologies. Passionate about clean architecture, developer productivity, and AI-assisted workflows.

\section*{Technical Skills}
\begin{itemize}
    \item \textbf{Languages:} Python, TypeScript, JavaScript, Go, SQL, HTML/CSS
    \item \textbf{Frameworks \& Libraries:} FastAPI, React, Node.js, Next.js, Express, Tailwind CSS
    \item \textbf{Databases \& Caching:} PostgreSQL, SQLite, Redis, MongoDB
    \item \textbf{DevOps \& Tools:} Docker, Git, GitHub Actions, Linux, LaTeX, AWS (EC2, S3)
\end{itemize}

\section*{Professional Experience}
\textbf{Senior Software Engineer} \hfill Jan 2024 -- Present \\
\textit{CloudScale Innovations} \hfill San Francisco, CA
\begin{itemize}
    \item Architected and launched high-throughput REST APIs serving over 50,000 daily active users with sub-50ms latency.
    \item Led migration from monolithic backend to containerized microservices using Docker and FastAPI.
    \item Reduced CI/CD build and deployment cycle times by 40\% through parallel testing and optimized Docker multi-stage builds.
\end{itemize}

\vspace{4pt}
\textbf{Software Engineer} \hfill Jun 2021 -- Dec 2023 \\
\textit{NextGen Web Labs} \hfill Austin, TX
\begin{itemize}
    \item Developed full-stack dashboard features using React, TypeScript, and Python.
    \item Integrated real-time event streaming via Server-Sent Events (SSE) and WebSockets.
    \item Improved database query performance by 35\% by indexing frequently filtered attributes.
\end{itemize}

\section*{Projects}
\textbf{AI Resume Studio} \hfill \textit{Python, FastAPI, React, TypeScript, LaTeX}
\begin{itemize}
    \item Built an interactive LaTeX resume editor with real-time compilation, live PDF preview, and AI agent integration.
    \item Implemented atomic document storage, project duplication, and persistent profile synchronization.
\end{itemize}

\vspace{4pt}
\textbf{Distributed Task Orchestrator} \hfill \textit{Go, Redis, Docker}
\begin{itemize}
    \item Engineered an asynchronous job queue processing concurrent background tasks with failure recovery and retries.
\end{itemize}

\section*{Education}
\textbf{Bachelor of Science in Computer Science} \hfill 2017 -- 2021 \\
State University \hfill GPA: 3.8 / 4.0

\end{document}
"""

DEFAULT_MINIMAL_RESUME_LATEX = r"""\documentclass[11pt,a4paper]{article}
\usepackage[margin=1in]{geometry}
\usepackage{hyperref}

\pagestyle{empty}

\begin{document}

\begin{center}
    {\LARGE \textbf{John Doe}} \\ \vspace{4pt}
    \href{mailto:john.doe@example.com}{john.doe@example.com} \ \textbullet\ (555) 012-3456 \ \textbullet\ \href{https://github.com/johndoe}{github.com/johndoe}
\end{center}

\section*{Objective}
Software Engineer with strong fundamentals in backend systems, database modeling, and automated testing looking to build high-impact products.

\section*{Skills}
Python, TypeScript, SQL, React, FastAPI, Docker, Git

\section*{Education}
\textbf{Bachelor of Technology in Computer Science} \hfill 2020 -- 2024 \\
State University

\end{document}
"""


def init_directories(data_dir: Path, repo_root: Path | None = None) -> list[Path]:
    """Ensure all required runtime directories exist."""
    dirs = [
        data_dir,
        data_dir / "profile",
        data_dir / "projects",
        data_dir / "events",
        data_dir / "locks",
    ]

    if repo_root is not None:
        dirs.extend(
            [
                repo_root / "templates",
                repo_root / "resources",
                repo_root / "resources" / "templates",
                repo_root / "resources" / "profile",
            ]
        )

    for directory in dirs:
        directory.mkdir(parents=True, exist_ok=True)

    return dirs


def init_database(engine: Engine | None = None) -> None:
    """Initialize database tables and sync alembic version table."""
    active_engine = engine or default_engine

    # Create all tables defined in SQLAlchemy Base
    Base.metadata.create_all(bind=active_engine)

    # Initialize alembic_version table if it does not exist yet
    try:
        with active_engine.connect() as conn:
            has_alembic = conn.execute(
                text(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'"
                )
            ).fetchone()

            if not has_alembic:
                conn.execute(
                    text(
                        "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL, PRIMARY KEY (version_num))"
                    )
                )
                conn.execute(
                    text(
                        "INSERT INTO alembic_version (version_num) VALUES ('12d8272cc9c8')"
                    )
                )
                conn.commit()
    except Exception as exc:
        logger.debug("Could not verify alembic_version table: %s", exc)


def seed_profile_files(
    profile_dir: Path,
    resources_dir: Path | None = None,
    force: bool = False,
) -> list[str]:
    """Seed profile YAML files for all allowed sections."""
    profile_dir.mkdir(parents=True, exist_ok=True)
    seeded_sections: list[str] = []

    for section in sorted(ProfileService.ALLOWED_SECTIONS):
        target_file = profile_dir / f"{section}.yaml"
        if target_file.exists() and not force:
            continue

        # 1. Try copying from local .yaml.example
        example_file = profile_dir / f"{section}.yaml.example"
        if example_file.is_file() and example_file.stat().st_size > 0:
            shutil.copy2(example_file, target_file)
            seeded_sections.append(section)
            continue

        # 2. Try copying from resources/profile/
        if resources_dir is not None:
            resource_file = resources_dir / "profile" / f"{section}.yaml"
            if resource_file.is_file() and resource_file.stat().st_size > 0:
                shutil.copy2(resource_file, target_file)
                seeded_sections.append(section)
                continue

            resource_example = resources_dir / "profile" / f"{section}.yaml.example"
            if resource_example.is_file() and resource_example.stat().st_size > 0:
                shutil.copy2(resource_example, target_file)
                seeded_sections.append(section)
                continue

        # 3. Fallback to clean default template data
        fallback_content = DEFAULT_PROFILE_DATA.get(section, "")
        target_file.write_text(fallback_content, encoding="utf-8")
        seeded_sections.append(section)

    return seeded_sections


def seed_templates(
    templates_dir: Path,
    resources_dir: Path | None = None,
    force: bool = False,
) -> list[str]:
    """Seed LaTeX resume templates in templates/ and resources/templates/."""
    templates_dir.mkdir(parents=True, exist_ok=True)
    templates_to_seed = {
        "starter_resume.tex": DEFAULT_STARTER_RESUME_LATEX,
        "minimal_resume.tex": DEFAULT_MINIMAL_RESUME_LATEX,
    }

    seeded: list[str] = []

    for name, fallback_content in templates_to_seed.items():
        target = templates_dir / name
        if not target.exists() or force:
            source = (
                resources_dir / "templates" / name
                if resources_dir is not None
                else None
            )

            if source is not None and source.is_file():
                shutil.copy2(source, target)
            else:
                target.write_text(fallback_content, encoding="utf-8")

            seeded.append(name)

    return seeded


def seed_starter_project(
    db: Session,
    storage: ProjectStorage,
    template_path: Path | None = None,
    force: bool = False,
) -> Project | None:
    """Create an initial starter resume project if none exist."""
    existing_project = db.scalars(select(Project)).first()
    if existing_project is not None and not force:
        return None

    if template_path is not None and template_path.is_file():
        latex_content = template_path.read_text(encoding="utf-8")
    else:
        latex_content = DEFAULT_STARTER_RESUME_LATEX

    lifecycle = ProjectLifecycleService(db, storage)
    project = lifecycle.create_project(
        title="Software Engineer Resume",
        description="A starter software engineering resume to explore LaTeX editing and AI features.",
    )

    storage.write_latex(project.id, latex_content)

    # Attempt to compile the starter resume PDF if pdflatex is available
    try:
        CompilationService(db, storage, timeout=30).compile_project(project.id)
    except Exception as exc:
        logger.debug("Starter resume compilation skipped: %s", exc)

    return project


def seed_all(
    data_dir: Path | None = None,
    repo_root: Path | None = None,
    engine: Engine | None = None,
    db: Session | None = None,
    storage: ProjectStorage | None = None,
    seed_project: bool = True,
    force: bool = False,
) -> dict[str, Any]:
    """Execute all seeding and initialization steps. Idempotent and safe to run on every startup."""
    active_data_dir = (data_dir or default_data_dir).resolve()
    active_repo_root = (repo_root or REPO_ROOT).resolve()
    active_engine = engine or default_engine

    # 1. Directories
    dirs = init_directories(active_data_dir, active_repo_root)

    # 2. Database
    init_database(active_engine)

    # 3. Resources & Templates
    resources_dir = active_repo_root / "resources"
    templates_dir = active_repo_root / "templates"
    seeded_templates = seed_templates(
        templates_dir, resources_dir=resources_dir, force=force
    )

    # 4. Profile files
    profile_dir = active_data_dir / "profile"
    seeded_profiles = seed_profile_files(
        profile_dir, resources_dir=resources_dir, force=force
    )

    # 5. Starter resume project
    starter_project: Project | None = None
    if seed_project:
        active_storage = storage or ProjectStorage(active_data_dir / "projects")
        template_file = templates_dir / "starter_resume.tex"

        if db is not None:
            starter_project = seed_starter_project(
                db, active_storage, template_path=template_file, force=force
            )
        else:
            with SessionLocal() as session:
                starter_project = seed_starter_project(
                    session, active_storage, template_path=template_file, force=force
                )

    return {
        "directories": [str(d) for d in dirs],
        "database": "initialized",
        "profile_files": seeded_profiles,
        "templates": seeded_templates,
        "starter_project": starter_project.id if starter_project else None,
    }


def main() -> None:
    """CLI entrypoint for running the seeder directly."""
    parser = argparse.ArgumentParser(
        description="Initialize database, profile files, and resources for AI Resume Studio."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force overwrite existing profile files and create starter project even if projects exist.",
    )
    parser.add_argument(
        "--no-project",
        action="store_true",
        help="Skip seeding the initial starter resume project.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Custom path to data directory.",
    )

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    logger.info("Running AI Resume Studio initialization and seeding...")

    result = seed_all(
        data_dir=args.data_dir,
        seed_project=not args.no_project,
        force=args.force,
    )

    logger.info("Database schema: %s", result["database"])
    if result["profile_files"]:
        logger.info("Seeded profile sections: %s", ", ".join(result["profile_files"]))
    else:
        logger.info("Profile sections: up to date")

    if result["templates"]:
        logger.info("Seeded templates: %s", ", ".join(result["templates"]))
    else:
        logger.info("Templates: up to date")

    if result["starter_project"]:
        logger.info("Created starter resume project ID: %s", result["starter_project"])
    else:
        logger.info("Projects: existing projects found (skipped starter project creation)")

    logger.info("Initialization completed successfully.")


if __name__ == "__main__":
    main()
