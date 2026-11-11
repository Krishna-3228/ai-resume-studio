from pathlib import Path
from tempfile import NamedTemporaryFile

import yaml


class ProfileService:

    ALLOWED_SECTIONS = {
        "personal-info",
        "education",
        "skills",
        "projects",
        "experience",
        "certifications",
    }

    def __init__(self, profile_dir: Path):
        self.profile_dir = Path(profile_dir).resolve()
        self.profile_dir.mkdir(parents=True, exist_ok=True)

    def list_sections(self) -> list[str]:
        return sorted(self.ALLOWED_SECTIONS)

    def _get_file_path(self, section: str) -> Path:
        if section not in self.ALLOWED_SECTIONS:
            raise ValueError(f"Invalid profile section: {section}")

        return self.profile_dir / f"{section}.yaml"

    def read_profile(self, section: str) -> str:
        file_path = self._get_file_path(section)

        if not file_path.exists():
            raise FileNotFoundError(
                f"Profile file not found: {section}.yaml"
            )

        return file_path.read_text(encoding="utf-8")

    def save_profile(self, section: str, content: str) -> None:
        file_path = self._get_file_path(section)

        # Validate YAML syntax without modifying its formatting.
        try:
            yaml.safe_load(content)
        except yaml.YAMLError as error:
            raise ValueError(f"Invalid YAML: {error}") from error

        # Write atomically to prevent partial file corruption.
        temp_path = None

        try:
            with NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.profile_dir,
                delete=False,
            ) as temp_file:
                temp_file.write(content)
                temp_path = Path(temp_file.name)

            temp_path.replace(file_path)

        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink()