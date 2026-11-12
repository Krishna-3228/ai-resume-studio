import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { projectService, type Project } from "../services/projectService";
import { Group, Panel, Separator } from "react-resizable-panels";
import axios from "axios";

type CompilationDiagnostic = {
    type: "error" | "warning";
    message: string;
    line: number | null;
};

function Workspace() {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState<Project | null>(null);
    const [latex, setLatex] = useState("");
    const [savedLatex, setSavedLatex] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isDirty = latex !== savedLatex;

    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [compiling, setCompiling] = useState(false);
    const [compileError, setCompileError] = useState<string | null>(null);

    const [diagnostics, setDiagnostics] = useState<CompilationDiagnostic[]>([]);

    const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

    const loadPdf = async () => {
        if (!projectId) return;

        try {
            const pdfBlob = await projectService.getPdf(projectId);
            const newPdfUrl = URL.createObjectURL(pdfBlob);

            setPdfUrl((previousUrl) => {
                if (previousUrl) URL.revokeObjectURL(previousUrl);
                return newPdfUrl;
            });
        } catch {
            setPdfUrl(null);
        }
    };

    useEffect(() => {
        if (!projectId) return;

        const loadWorkspace = async () => {
            try {
                setLoading(true);
                setError(null);

                const [projectData, latexData] = await Promise.all([
                    projectService.getProject(projectId),
                    projectService.getLatex(projectId),
                ]);

                setProject(projectData);
                setLatex(latexData.content);
                setSavedLatex(latexData.content);
                await loadPdf();
            } catch (err) {
                console.error("Workspace loading failed:", err);

                if (axios.isAxiosError(err)) {
                    console.error("API response:", err.response?.data);
                    console.error("HTTP status:", err.response?.status);
                    console.error("Request URL:", err.config?.url);
                }

                setError("Failed to load project. Check the browser console.");
            } finally {
                setLoading(false);
            }
        };

        loadWorkspace();
    }, [projectId]);

    useEffect(() => {
        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [pdfUrl]);

    const handleSave = async () => {
        if (!projectId || !isDirty || saving) return;

        try {
            setSaving(true);
            setError(null);

            const response = await projectService.saveLatex(projectId, latex);

            setSavedLatex(response.content);
        } catch {
            setError("Failed to save LaTeX source.");
        } finally {
            setSaving(false);
        }
    };

    const applyDiagnostics = (items: CompilationDiagnostic[]) => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;

        if (!editor || !monaco) return;

        const model = editor.getModel();
        if (!model) return;

        const markers = items
            .filter((item) => item.line !== null)
            .filter((item) => item.line! >= 1 && item.line! <= model.getLineCount())
            .map((item) => ({
                startLineNumber: item.line!,
                startColumn: 1,
                endLineNumber: item.line!,
                endColumn: model.getLineMaxColumn(item.line!),
                message: item.message,
                severity:
                    item.type === "error"
                        ? monaco.MarkerSeverity.Error
                        : monaco.MarkerSeverity.Warning,
                source: "pdflatex",
            }));

        monaco.editor.setModelMarkers(model, "pdflatex", markers);
    };

    const handleCompile = async () => {
        if (!projectId || compiling) return;

        try {
            setCompiling(true);
            setCompileError(null);
            setDiagnostics([]);
            applyDiagnostics([]);

            // Save the latest editor content before compilation.
            if (isDirty) {
                const response = await projectService.saveLatex(projectId, latex);
                setSavedLatex(response.content);
            }

            // Compile the saved source.
            await projectService.compileProject(projectId);

            // Compilation succeeded: clear old diagnostics and refresh PDF.
            setDiagnostics([]);
            applyDiagnostics([]);
            await loadPdf();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const detail = err.response?.data?.detail;

                if (detail && Array.isArray(detail.diagnostics)) {
                    const receivedDiagnostics =
                        detail.diagnostics as CompilationDiagnostic[];

                    setDiagnostics(receivedDiagnostics);
                    applyDiagnostics(receivedDiagnostics);
                }

                setCompileError(
                    detail?.message ?? "Compilation failed. Check your LaTeX source."
                );
            } else {
                setCompileError("Compilation failed. Check your LaTeX source.");
            }
        } finally {
            setCompiling(false);
        }
    };

    const getSavedLayout = (key: string, fallback: Record<string, number>) => {
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : fallback;
        } catch {
            return fallback;
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">
                Loading project...
            </div>
        );
    }

    if (error && !project) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-gray-400">
                <p>{error}</p>
                <button onClick={() => navigate("/")}>Return to Dashboard</button>
            </div>
        );
    }



    return (
        <div className="flex h-screen flex-col bg-gray-950 text-gray-100">
            {/* Toolbar */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-800 px-5">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate("/")}
                        className="text-sm text-gray-400 hover:text-white"
                    >
                        ← Dashboard
                    </button>

                    <div className="h-5 border-l border-gray-700" />

                    <h1 className="text-sm font-semibold">{project?.title ?? "Resume Workspace"}</h1>
                </div>

                <div className="flex items-center gap-3">
                    {error && project && (
                        <span className="text-xs text-red-400">{error}</span>
                    )}
                    <button
                        onClick={() => {
                            if (!pdfUrl) return;

                            const link = document.createElement("a");
                            link.href = pdfUrl;
                            link.download = `${project?.title || "resume"}.pdf`;
                            link.click();
                        }}
                        disabled={!pdfUrl}
                        className="rounded-md border border-gray-700 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Download PDF
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving || loading}
                        className="rounded-md border border-gray-700 px-4 py-1.5 text-sm disabled:opacity-40"
                    >
                        {saving ? "Saving..." : isDirty ? "Save changes" : "Saved"}
                    </button>

                    <button
                        onClick={handleCompile}
                        disabled={compiling || loading || saving}
                        className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {compiling ? "Compiling..." : "Compile"}
                    </button>
                </div>
            </header>

            {/* Resizable Workspace */}
            <main className="min-h-0 flex-1">
                <Group
                    orientation="horizontal"
                    defaultLayout={getSavedLayout("workspace-horizontal", {
                        preview: 40,
                        workspace: 60,
                    })}
                    onLayoutChanged={(layout) =>
                        localStorage.setItem("workspace-horizontal", JSON.stringify(layout))
                    }
                    className="h-full"
                >
                    {/* PDF Preview */}
                    <Panel id="preview" defaultSize="40%" minSize="25%">
                        <section className="flex h-full min-h-0 flex-col">
                            <div className="flex h-10 shrink-0 items-center border-b border-gray-800 px-4">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    PDF Preview
                                </h2>
                            </div>

                            {compileError && (
                                <div className="border-b border-red-900 bg-red-950/40 px-4 py-2">
                                    <p className="text-xs text-red-400">
                                        {compileError}
                                    </p>
                                </div>
                            )}

                            {pdfUrl ? (
                                <iframe
                                    src={pdfUrl}
                                    title="Resume PDF Preview"
                                    className="h-full w-full border-0 bg-white"
                                />
                            ) : (
                                <div className="flex flex-1 items-center justify-center p-6">
                                    <div className="text-center">
                                        <p className="text-sm text-gray-400">
                                            No PDF generated yet
                                        </p>
                                        <p className="mt-2 text-xs text-gray-600">
                                            Compile your LaTeX source to preview your resume.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </section>
                    </Panel>

                    <Separator className="w-1 bg-gray-800 transition-colors hover:bg-blue-500 data-[separator=active]:bg-blue-500" />

                    {/* Editor + AI Chat */}
                    <Panel id="workspace" defaultSize="60%" minSize="35%">
                        <Group
                            orientation="vertical"
                            defaultLayout={getSavedLayout("workspace-vertical", {
                                editor: 60,
                                chat: 40,
                            })}
                            onLayoutChanged={(layout) =>
                                localStorage.setItem("workspace-vertical", JSON.stringify(layout))
                            }
                            className="h-full"
                        >
                            {/* LaTeX Editor */}
                            <Panel id="editor" defaultSize="60%" minSize="25%">
                                <section className="flex h-full min-h-0 flex-col">
                                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-800 px-4">
                                        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                            LaTeX Editor
                                        </h2>
                                        <span className="text-xs text-gray-600">resume.tex</span>
                                    </div>

                                    <div className="min-h-0 flex-1">
                                        <Editor
                                            height="100%"
                                            language="latex"
                                            theme="vs-dark"
                                            value={latex}
                                            onChange={(value) => {
                                                setLatex(value ?? "");

                                                // Clear diagnostics when the source changes.
                                                setDiagnostics([]);
                                                applyDiagnostics([]);
                                            }}
                                            onMount={(editor, monaco) => {
                                                editorRef.current = editor;
                                                monacoRef.current = monaco;
                                            }}
                                            options={{
                                                minimap: { enabled: false },
                                                fontSize: 14,
                                                fontFamily: "monospace",
                                                lineNumbers: "on",
                                                scrollBeyondLastLine: false,
                                                automaticLayout: true,
                                                wordWrap: "on",
                                                padding: {
                                                    top: 16,
                                                    bottom: 16,
                                                },
                                            }}
                                        />
                                    </div>
                                </section>
                            </Panel>

                            <Separator className="h-1 bg-gray-800 transition-colors hover:bg-blue-500 data-[separator=active]:bg-blue-500" />

                            {/* AI Chat */}
                            <Panel id="chat" defaultSize="40%" minSize="20%">
                                <section className="flex h-full min-h-0 flex-col">
                                    <div className="flex h-10 shrink-0 items-center border-b border-gray-800 px-4">
                                        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                            AI Assistant
                                        </h2>
                                    </div>

                                    <div className="flex flex-1 flex-col items-center justify-center">
                                        <p className="text-sm text-gray-400">
                                            Resume AI Assistant
                                        </p>
                                        <p className="mt-2 text-xs text-gray-600">
                                            Ask questions or request changes to your resume.
                                        </p>
                                    </div>

                                    <div className="border-t border-gray-800 p-3">
                                        <div className="flex gap-2">
                                            <input
                                                disabled
                                                placeholder="Ask AI to improve your resume..."
                                                className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-400 outline-none"
                                            />
                                            <button
                                                disabled
                                                className="rounded-md bg-blue-600 px-4 text-sm opacity-50"
                                            >
                                                Send
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </Panel>
                        </Group>
                    </Panel>
                </Group>
            </main>
        </div>
    );
}

export default Workspace;