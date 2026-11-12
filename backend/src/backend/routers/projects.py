from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.db.dependencies import get_db
from backend.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from backend.services.project_service import ProjectService

from backend.dependencies import get_project_storage
from backend.services.project_lifecycle_service import ProjectLifecycleService
from backend.services.project_storage import ProjectStorage

from backend.schemas.document import LatexUpdate, LatexResponse
from backend.services.document_service import DocumentService
from backend.services.compilation_service import (
    CompilationService,
    CompilationError,
)

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    storage: ProjectStorage = Depends(get_project_storage),
):
    service = ProjectLifecycleService(db, storage)

    try:
        return service.create_project(
            title=body.title,
            description=body.description,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return ProjectService(db).list_projects()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    project = ProjectService(db).get_project(project_id)

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
):
    service = ProjectService(db)

    try:
        project = service.update_project(
            project_id,
            title=body.title,
            description=body.description,
            update_description="description" in body.model_fields_set,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    storage: ProjectStorage = Depends(get_project_storage),
):
    service = ProjectLifecycleService(db, storage)

    deleted = service.delete_project(project_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get(
    "/{project_id}/latex",
    response_model=LatexResponse,
)
def get_project_latex(
    project_id: str,
    db: Session = Depends(get_db),
    storage: ProjectStorage = Depends(get_project_storage),
):
    service = DocumentService(db, storage)

    try:
        content = service.get_latex(project_id)
        return LatexResponse(
            project_id=project_id,
            content=content,
        )
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.put(
    "/{project_id}/latex",
    response_model=LatexResponse,
)
def save_project_latex(
    project_id: str,
    body: LatexUpdate,
    db: Session = Depends(get_db),
    storage: ProjectStorage = Depends(get_project_storage),
):
    service = DocumentService(db, storage)

    try:
        content = service.save_latex(project_id, body.content)

        return LatexResponse(
            project_id=project_id,
            content=body.content,
        )
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))

@router.post("/{project_id}/compile")
def compile_project(
    project_id: str,
    db: Session = Depends(get_db),
    storage: ProjectStorage = Depends(get_project_storage),
):
    service = CompilationService(db, storage)

    try:
        return service.compile_project(project_id)

    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))

    except CompilationError as error:
        raise HTTPException(
            status_code=422,
            detail={
                "message": str(error),
                "output": error.output,
                "diagnostics": [
                    {
                        "type": diagnostic.type,
                        "message": diagnostic.message,
                        "line": diagnostic.line,
                    }
                    for diagnostic in error.diagnostics
                ],
            },
        )

@router.get("/{project_id}/pdf")
def get_project_pdf(
    project_id: str,
    db: Session = Depends(get_db),
    storage: ProjectStorage = Depends(get_project_storage),
):
    project = ProjectService(db).get_project(project_id)

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    pdf_path = storage.get_pdf_path(project_id)

    if not pdf_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="PDF has not been generated yet",
        )

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename="resume.pdf",
    )