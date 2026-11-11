import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.services.profile_service import ProfileService


# Resolve the repository root independently of the working directory.
REPO_ROOT = Path(__file__).resolve().parents[3]

data_dir = Path(os.getenv("RESUME_DATA_DIR", REPO_ROOT / "data"))

if not data_dir.is_absolute():
    data_dir = REPO_ROOT / data_dir

profile_service = ProfileService(data_dir / "profile")

app = FastAPI(
    title="Resume Studio API",
    description="Backend API for Resume Studio",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProfileUpdate(BaseModel):
    content: str


@app.get("/api/profile")
def list_profile_sections():
    return {"sections": profile_service.list_sections()}


@app.get("/api/profile/{section}")
def get_profile_section(section: str):
    try:
        content = profile_service.read_profile(section)
        return {"section": section, "content": content}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))


@app.put("/api/profile/{section}")
def update_profile_section(section: str, body: ProfileUpdate):
    try:
        profile_service.save_profile(section, body.content)
        return {"message": "Profile updated successfully", "section": section}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))