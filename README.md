# AI Resume Studio

An AI-assisted LaTeX resume editor with project-based resume
management and persistent profile storage.

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Monaco Editor

### Backend
- Python
- FastAPI
- FastMCP
- PyYAML

### AI
- LangGraph
- LLM integration
- Model Context Protocol (MCP)

### Document Processing
- LaTeX
- PDF compilation

## Project Structure

- frontend/: React application
- backend/: FastAPI application and MCP server
- data/: Persistent user profile and resume projects
- templates/: LaTeX resume templates
- resources/: Default resume templates and profile seed files

## Development

Backend:

    cd backend
    uv sync
    uv run uvicorn backend.main:app --reload

> **Note**: Database tables, profile files, and resources are automatically seeded on first launch. You can also run the seeder manually via `uv run backend-seed` or `python -m backend.seed`.

Frontend:

    cd frontend
    npm install
    npm run dev