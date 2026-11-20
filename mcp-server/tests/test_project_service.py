def test_write_records_intent_and_completion_and_preserves_content(project, services):
    project_id, _, latex_file = project
    project_service, event_service = services
    original_content = latex_file.read_text(encoding="utf-8")

    result = project_service.write_latex(project_id, original_content)

    operation_events = [
        event
        for event in event_service.read_events(project_id)
        if event["payload"].get("operation_id") == result["operation_id"]
    ]

    assert [event["event_type"] for event in operation_events] == [
        "latex_update_started",
        "latex_updated",
    ]
    assert operation_events[0]["payload"]["status"] == "started"
    assert operation_events[1]["payload"]["status"] == "completed"
    assert operation_events[1]["payload"]["content"] == original_content
    assert project_service.read_latex(project_id) == original_content


def test_compile_emits_events(project, monkeypatch):
    import subprocess
    from mcp_server.services.latex_service import LatexService
    from mcp_server.services.event_service import EventService

    project_id, project_dir, _ = project
    event_service = EventService()
    latex_service = LatexService()

    # Mock subprocess.run so compilation succeeds and creates resume.pdf
    def mock_run(*args, **kwargs):
        temp_dir = kwargs.get("output_directory") or args[0][args[0].index("-output-directory") + 1]
        from pathlib import Path
        (Path(temp_dir) / "resume.pdf").write_bytes(b"%PDF-1.4 mock")
        class MockResult:
            returncode = 0
            stdout = ""
            stderr = ""
        return MockResult()

    monkeypatch.setattr(subprocess, "run", mock_run)

    result = latex_service.compile(project_id)
    assert result["success"] is True

    events = event_service.read_events(project_id)
    compile_event_types = [e["event_type"] for e in events]
    assert "pdf_compile_started" in compile_event_types
    assert "pdf_compiled" in compile_event_types
