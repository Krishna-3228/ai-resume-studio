import logging

from fastmcp import FastMCP

from mcp_server.services.project_service import ProjectService
from mcp_server.services.latex_service import LatexService
from mcp_server.services.profile_service import ProfileService


logger = logging.getLogger(__name__)

project_service = ProjectService()
latex_service = LatexService()
profile_service = ProfileService()

mcp = FastMCP("Resume Studio")


@mcp.tool()
def read_latex(project_id: str) -> str:
    """Read the LaTeX source of a resume project."""
    return project_service.read_latex(project_id)


@mcp.tool()
def write_latex(project_id: str, content: str, summary: str = "") -> dict:
    """Replace the LaTeX source of a resume project and automatically compile it into a PDF."""
    return project_service.write_latex(project_id, content, summary)


@mcp.tool()
def compile_resume(project_id: str) -> dict:
    """Manually recompile a project's LaTeX source into a PDF."""
    return latex_service.compile(project_id)

## Profile tools
@mcp.tool()
def get_personal_info() -> str:
    """Retrieve the user's personal information from their profile."""
    return profile_service.read_section("personal_info")


@mcp.tool()
def get_education() -> str:
    """Retrieve the user's educational background."""
    return profile_service.read_section("education")


@mcp.tool()
def get_experience() -> str:
    """Retrieve the user's professional experience."""
    return profile_service.read_section("experience")


@mcp.tool()
def get_projects() -> str:
    """Retrieve the user's projects from their profile."""
    return profile_service.read_section("projects")


@mcp.tool()
def get_certifications() -> str:
    """Retrieve the user's certifications."""
    return profile_service.read_section("certifications")


@mcp.tool()
def get_skills() -> str:
    """Retrieve the user's skills."""
    return profile_service.read_section("skills")

def main():
    logging.basicConfig(level=logging.INFO)
    mcp.run()


if __name__ == "__main__":
    main()