from pathlib import Path

from mcp_server.config import PROFILE_DIR


class ProfileService:
    """Read persistent user profile sections from YAML files."""

    SECTIONS = {
        "personal_info": "personal-info.yaml",
        "education": "education.yaml",
        "experience": "experience.yaml",
        "projects": "projects.yaml",
        "certifications": "certifications.yaml",
        "skills": "skills.yaml",
    }

    def __init__(self, profile_dir: Path = PROFILE_DIR):
        self.profile_dir = profile_dir

    def read_section(self, section: str) -> str:
        filename = self.SECTIONS.get(section)

        if filename is None:
            raise ValueError(f"Unknown profile section: {section}")

        file_path = self.profile_dir / filename

        if not file_path.is_file():
            raise FileNotFoundError(
                f"Profile section '{section}' was not found"
            )

        return file_path.read_text(encoding="utf-8")