import json
import logging
from pathlib import Path
from typing import Any, AsyncGenerator

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent

from backend.services.llm_factory import create_llm, get_llm_status

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[4]


def extract_text_content(content: Any) -> str:
    """
    Extract human-readable plain text from LangChain message content or chunks.
    Handles strings, lists of content dicts (e.g. [{'type': 'text', 'text': '...'}]),
    Gemini/Anthropic content blocks, and nested structures.
    """
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if "text" in item:
                    parts.append(str(item["text"]))
                elif item.get("type") == "text" and "content" in item:
                    parts.append(str(item["content"]))
            elif hasattr(item, "text"):
                parts.append(str(item.text))
        return "".join(parts)
    if isinstance(content, dict):
        if "text" in content:
            return str(content["text"])
    return str(content)


class ReadLatexInput(BaseModel):
    """Inspect the current LaTeX document. No arguments required."""
    pass


class CompileResumeInput(BaseModel):
    """Compile the current resume into a PDF. No arguments required."""
    pass


class WriteLatexInput(BaseModel):
    """Replace the resume LaTeX code with updated, valid LaTeX code and automatically compile the PDF."""
    content: str = Field(description="The complete, updated, valid LaTeX document to write into resume.tex.")


PROJECT_TOOLS = {"read_latex", "write_latex", "compile_resume"}


def _make_prompt_callable(system_prompt: str):
    sys_msg = SystemMessage(content=system_prompt)

    def prompt_fn(state: dict) -> list[BaseMessage]:
        raw_msgs = state.get("messages", [])

        # Detect if write_latex has been called in history
        write_call_ids = set()
        read_call_ids = set()
        for msg in raw_msgs:
            if isinstance(msg, AIMessage) and msg.tool_calls:
                for tc in msg.tool_calls:
                    if tc.get("name") == "write_latex":
                        write_call_ids.add(tc.get("id"))
                    elif tc.get("name") == "read_latex":
                        read_call_ids.add(tc.get("id"))

        has_written = bool(write_call_ids)
        cleaned_msgs: list[BaseMessage] = []
        for msg in raw_msgs:
            # If write_latex has already run, older read_latex output is redundant; compress it
            if has_written and isinstance(msg, ToolMessage) and msg.tool_call_id in read_call_ids:
                cleaned_msgs.append(
                    ToolMessage(
                        content="[Original LaTeX source code inspected and updated]",
                        tool_call_id=msg.tool_call_id,
                        name=getattr(msg, "name", "read_latex"),
                        id=msg.id,
                    )
                )
            else:
                cleaned_msgs.append(msg)

        return [sys_msg] + cleaned_msgs

    return prompt_fn


class AgentService:
    def __init__(self):
        self._mcp_client: MultiServerMCPClient | None = None
        self._checkpointer = InMemorySaver()
        self._tools_cache: list[Any] | None = None

    def _get_mcp_client(self) -> MultiServerMCPClient:
        if self._mcp_client is None:
            mcp_server_dir = REPO_ROOT / "mcp-server"
            self._mcp_client = MultiServerMCPClient(
                {
                    "resume_studio": {
                        "command": "uv",
                        "args": ["run", "python", "-m", "mcp_server.server"],
                        "transport": "stdio",
                        "cwd": str(mcp_server_dir),
                    }
                }
            )
        return self._mcp_client

    async def get_raw_tools(self) -> list[Any]:
        if self._tools_cache is None:
            client = self._get_mcp_client()
            self._tools_cache = await client.get_tools()
        return self._tools_cache

    def _wrap_tool_for_project(self, tool: Any, project_id: str) -> Any:
        """Wrap an MCP tool to automatically inject project_id with clean Pydantic schemas."""
        if tool.name not in PROJECT_TOOLS:
            return tool

        if tool.name == "read_latex":
            schema = ReadLatexInput
        elif tool.name == "compile_resume":
            schema = CompileResumeInput
        elif tool.name == "write_latex":
            schema = WriteLatexInput
        else:
            schema = tool.args_schema

        async def wrapped_call(**kwargs):
            kwargs["project_id"] = project_id
            return await tool.ainvoke(kwargs)

        return StructuredTool.from_function(
            coroutine=wrapped_call,
            name=tool.name,
            description=tool.description,
            args_schema=schema,
        )

    def _get_system_prompt(self, project_id: str) -> str:
        return (
            "You are an expert AI Resume Assistant inside AI Resume Studio. "
            f"The user is working on the resume project with ID: {project_id}.\n\n"
            "Your Capabilities & Tools:\n"
            "- read_latex: Inspect the current LaTeX code of this resume (no arguments required).\n"
            "- write_latex: Replace the LaTeX code of this resume with updated, valid LaTeX. "
            "NOTE: write_latex AUTOMATICALLY compiles the PDF upon saving. You do NOT need to call compile_resume after write_latex.\n"
            "- compile_resume: Manually re-compile the resume if needed (no arguments required).\n"
            "- Profile tools: get_personal_info, get_education, get_experience, get_projects, "
            "get_certifications, get_skills to read master profile sections.\n\n"
            "Operating Instructions:\n"
            "1. Before proposing or making any changes, inspect the current resume source using read_latex.\n"
            "2. If the user asks to add information from their profile, call the relevant profile tool(s).\n"
            "3. When updating the resume with write_latex, provide the COMPLETE, valid, and properly formatted "
            "LaTeX document in 'content'.\n"
            "   CRITICAL LATEX SYNTAX RULES:\n"
            "   - In LaTeX, the '&' character is strictly reserved for table column alignment. You MUST ALWAYS escape ampersands in prose, coursework, company names, and bullet items as '\\&' (e.g. 'Data Structures \\& Algorithms', 'R\\&D'). NEVER output a bare '&' in regular text.\n"
            "   - Other special characters like %, _, #, $ must also be escaped as \\%, \\_, \\#, \\$ unless used in valid LaTeX commands.\n"
            "4. Since write_latex automatically compiles the PDF, you do NOT need to call compile_resume after calling write_latex. "
            "If write_latex reports a compilation failure, inspect the error output, fix the LaTeX code, and call write_latex again.\n"
            "5. Once write_latex succeeds, summarize your edits clearly and professionally in your final response.\n"
            "6. Call only the tools listed above; do not invent other tool names."
        )

    async def get_agent(self, project_id: str):
        llm = create_llm()
        raw_tools = await self.get_raw_tools()
        tools = [self._wrap_tool_for_project(t, project_id) for t in raw_tools]
        system_prompt = self._get_system_prompt(project_id)

        agent = create_react_agent(
            model=llm,
            tools=tools,
            prompt=_make_prompt_callable(system_prompt),
            checkpointer=self._checkpointer,
        )
        return agent

    async def stream_chat(
        self, project_id: str, message: str
    ) -> AsyncGenerator[dict[str, Any], None]:
        status = get_llm_status()
        if not status["configured"]:
            yield {
                "type": "error",
                "message": status["message"],
            }
            return

        try:
            agent = await self.get_agent(project_id)
        except Exception as error:
            logger.exception("Failed to initialize agent")
            yield {
                "type": "error",
                "message": f"Failed to initialize AI agent: {error}",
            }
            return

        config = {"configurable": {"thread_id": project_id}}
        inputs = {"messages": [HumanMessage(content=message)]}

        accumulated_text = ""

        try:
            async for event in agent.astream_events(inputs, config=config, version="v2"):
                kind = event.get("event")

                if kind == "on_tool_start":
                    tool_name = event.get("name")
                    tool_input = event.get("data", {}).get("input", {})
                    yield {
                        "type": "tool_start",
                        "tool": tool_name,
                        "input": tool_input,
                    }

                elif kind == "on_tool_end":
                    tool_name = event.get("name")
                    yield {
                        "type": "tool_end",
                        "tool": tool_name,
                    }

                elif kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        text = extract_text_content(chunk.content)
                        if text:
                            accumulated_text += text
                            yield {
                                "type": "chunk",
                                "content": text,
                            }

            # Fallback if model did not stream individual chunks
            if not accumulated_text.strip():
                try:
                    state = await agent.aget_state(config)
                    raw_messages = state.values.get("messages", []) if state else []
                    if raw_messages and isinstance(raw_messages[-1], AIMessage):
                        accumulated_text = extract_text_content(raw_messages[-1].content)
                except Exception:
                    pass

            # Once the stream finishes, yield done
            yield {
                "type": "done",
                "reply": accumulated_text.strip(),
            }

        except Exception as error:
            logger.exception("Chat generation error")
            yield {
                "type": "error",
                "message": f"An error occurred while generating response: {error}",
            }

    async def get_history(self, project_id: str) -> list[dict[str, str]]:
        config = {"configurable": {"thread_id": project_id}}
        try:
            # We can read messages from checkpointer state
            agent = await self.get_agent(project_id)
            state = await agent.aget_state(config)
            raw_messages = state.values.get("messages", []) if state else []
            history = []
            for msg in raw_messages:
                if isinstance(msg, HumanMessage):
                    history.append({
                        "role": "user",
                        "content": extract_text_content(msg.content),
                    })
                elif isinstance(msg, AIMessage):
                    text = extract_text_content(msg.content)
                    if text and text.strip():
                        history.append({"role": "assistant", "content": text})
            return history
        except Exception:
            return []

    def clear_history(self, project_id: str) -> None:
        # Reset checkpointer state for thread_id
        # In InMemorySaver, checkpoints are stored in self._checkpointer.storage[thread_id]
        if hasattr(self._checkpointer, "storage"):
            self._checkpointer.storage.pop(project_id, None)
        elif hasattr(self._checkpointer, "checkpoints"):
            self._checkpointer.checkpoints.pop(project_id, None)


agent_service = AgentService()
