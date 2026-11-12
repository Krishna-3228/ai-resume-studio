import re
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class CompilationDiagnostic:
    type: Literal["error", "warning"]
    message: str
    line: int | None = None


class LatexDiagnosticParser:

    @staticmethod
    def parse(log_content: str) -> list[CompilationDiagnostic]:
        diagnostics = []
        lines = log_content.splitlines()

        file_line_pattern = re.compile(
            r"^(?:\./)?[^:\s]+\.tex:(\d+):\s*(.+)$"
        )

        for index, line in enumerate(lines):

            # Format produced by -file-line-error
            file_match = file_line_pattern.match(line)

            if file_match:
                message = file_match.group(2).strip()

                # Compiler termination messages are not source diagnostics.
                if message.startswith("==>"):
                    continue

                diagnostics.append(
                    CompilationDiagnostic(
                        type="error",
                        message=message,
                        line=int(file_match.group(1)),
                    )
                )
                continue

            # Traditional TeX error format
            if line.startswith("! "):
                message = line[2:].strip()
                line_number = None

                for following_line in lines[index + 1:]:
                    if following_line.startswith("! "):
                        break

                    match = re.match(r"^l\.(\d+)", following_line)

                    if match:
                        line_number = int(match.group(1))
                        break

                diagnostics.append(
                    CompilationDiagnostic(
                        type="error",
                        message=message,
                        line=line_number,
                    )
                )

            # LaTeX warnings
            elif line.startswith("LaTeX Warning:"):
                diagnostics.append(
                    CompilationDiagnostic(
                        type="warning",
                        message=line.removeprefix(
                            "LaTeX Warning:"
                        ).strip(),
                    )
                )

        return diagnostics