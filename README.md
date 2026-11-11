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

## Development

Backend:

    cd backend
    uv sync
    uv run uvicorn backend.main:app --reload

Frontend:

    cd frontend
    npm install
    npm run dev