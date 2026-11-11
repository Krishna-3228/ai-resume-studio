from pathlib import Path

import pytest

from backend.services.profile_service import ProfileService


@pytest.fixture
def profile_service(tmp_path: Path):
    return ProfileService(tmp_path)


def test_list_sections(profile_service):
    sections = profile_service.list_sections()

    assert "education" in sections
    assert "skills" in sections
    assert len(sections) == 6


def test_read_profile(profile_service):
    content = "education:\n  - institution: KIIT\n"

    (profile_service.profile_dir / "education.yaml").write_text(content)

    result = profile_service.read_profile("education")

    assert result == content


def test_save_profile(profile_service):
    content = "skills:\n  - Python\n  - C++\n"

    profile_service.save_profile("skills", content)

    saved = (profile_service.profile_dir / "skills.yaml").read_text()

    assert saved == content


def test_invalid_yaml_is_rejected(profile_service):
    content = "education:\n  - institution: [KIIT\n"

    with pytest.raises(ValueError, match="Invalid YAML"):
        profile_service.save_profile("education", content)


def test_invalid_section_is_rejected(profile_service):
    with pytest.raises(ValueError, match="Invalid profile section"):
        profile_service.read_profile("../secret")


def test_missing_profile_file(profile_service):
    with pytest.raises(FileNotFoundError):
        profile_service.read_profile("education")