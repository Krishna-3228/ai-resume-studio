import asyncio


def _text_content(result):
    return "\n".join(
        item.text for item in result.content if hasattr(item, "text")
    )


def test_mcp_tools_are_registered_and_use_isolated_storage(
    project, isolated_storage, monkeypatch, tmp_path
):
    from mcp_server.services.latex_service import LatexService
    from mcp_server.services.profile_service import ProfileService
    from mcp_server.services.project_service import ProjectService
    import mcp_server.server as server_module

    project_id, _, _ = project
    profile_dir = tmp_path / "profile"
    profile_dir.mkdir()

    profile_sections = {
        "personal-info.yaml": "name: Test User\n",
        "education.yaml": "- degree: Test Degree\n",
        "experience.yaml": "- role: Test Role\n",
        "projects.yaml": "- name: Test Project\n",
        "certifications.yaml": "- name: Test Certification\n",
        "skills.yaml": "- Python\n",
    }
    for filename, content in profile_sections.items():
        (profile_dir / filename).write_text(content, encoding="utf-8")

    # Replace module-level services because the registered tool functions
    # resolve these globals when called.
    monkeypatch.setattr(server_module, "project_service", ProjectService())
    monkeypatch.setattr(server_module, "latex_service", LatexService())
    monkeypatch.setattr(
        server_module,
        "profile_service",
        ProfileService(profile_dir=profile_dir),
    )
    monkeypatch.setattr(
        server_module.latex_service,
        "compile",
        lambda requested_id: {
            "success": requested_id == project_id,
            "message": "Mock compilation",
        },
    )

    async def exercise_tools():
        tools = await server_module.mcp.list_tools()
        tool_names = {tool.name for tool in tools}

        expected_names = {
            "read_latex",
            "write_latex",
            "compile_resume",
            "get_personal_info",
            "get_education",
            "get_experience",
            "get_projects",
            "get_certifications",
            "get_skills",
        }
        assert expected_names <= tool_names

        new_content = (
            r"\documentclass{article}\begin{document}"
            r"Updated by pytest"
            r"\end{document}"
        )
        write_result = await server_module.mcp.call_tool(
            "write_latex",
            {"project_id": project_id, "content": new_content},
        )
        assert not write_result.is_error

        read_result = await server_module.mcp.call_tool(
            "read_latex", {"project_id": project_id}
        )
        assert not read_result.is_error
        assert new_content in _text_content(read_result)

        compile_result = await server_module.mcp.call_tool(
            "compile_resume", {"project_id": project_id}
        )
        assert not compile_result.is_error
        assert "Mock compilation" in _text_content(compile_result)

        profile_tools = {
            "get_personal_info": "name: Test User",
            "get_education": "Test Degree",
            "get_experience": "Test Role",
            "get_projects": "Test Project",
            "get_certifications": "Test Certification",
            "get_skills": "Python",
        }
        for tool_name, expected_text in profile_tools.items():
            result = await server_module.mcp.call_tool(tool_name, {})
            assert not result.is_error
            assert expected_text in _text_content(result)

    asyncio.run(exercise_tools())
