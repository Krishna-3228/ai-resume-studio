from pydantic import BaseModel


class LatexUpdate(BaseModel):
    content: str


class LatexResponse(BaseModel):
    project_id: str
    content: str