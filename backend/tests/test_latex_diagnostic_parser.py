from backend.services.latex_diagnostic_parser import (
    LatexDiagnosticParser,
    CompilationDiagnostic,
)


def test_parse_undefined_control_sequence():
    log = r"""
! Undefined control sequence.
l.18 \thiscommanddoesnotexist
"""

    diagnostics = LatexDiagnosticParser.parse(log)

    assert len(diagnostics) == 1

    assert diagnostics[0] == CompilationDiagnostic(
        type="error",
        message="Undefined control sequence.",
        line=18,
    )


def test_parse_multiple_errors():
    log = r"""
! Undefined control sequence.
l.10 \unknowncommand

! Missing $ inserted.
l.25 some_text
"""

    diagnostics = LatexDiagnosticParser.parse(log)

    assert len(diagnostics) == 2
    assert diagnostics[0].line == 10
    assert diagnostics[1].line == 25


def test_parse_warnings():
    log = """
LaTeX Warning: Reference `section1' undefined on input line 15.
"""

    diagnostics = LatexDiagnosticParser.parse(log)

    assert len(diagnostics) == 1
    assert diagnostics[0].type == "warning"


def test_empty_log():
    diagnostics = LatexDiagnosticParser.parse("")

    assert diagnostics == []

def test_parse_file_line_error_format():
    log = r"""
./resume.tex:18: Undefined control sequence.
l.18 \thiscommanddoesnotexist

./resume.tex:18: ==> Fatal error occurred, no output PDF file produced!
"""

    diagnostics = LatexDiagnosticParser.parse(log)

    assert len(diagnostics) == 1

    assert diagnostics[0] == CompilationDiagnostic(
        type="error",
        message="Undefined control sequence.",
        line=18,
    )