import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { projectService, type Project } from "../services/projectService";
import { chatService, streamChat, type ChatMessage, type ChatStatus } from "../services/chatService";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Sparkles, Send, Trash2, Wrench, AlertCircle, Bot, User, ArrowLeft, Download, Save, Play, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import axios from "axios";
import { configureStudioTheme } from "../utils/monacoTheme";
import { toast } from "../components/toast";

function cleanMessageContent(content: string): string {
    if (!content) return "";
    const trimmed = content.trim();
    // Clean Python-serialized block chunks like [{'type': 'text', 'text': '...'}]
    if (trimmed.startsWith("[{'") || trimmed.startsWith('[{"')) {
        try {
            const textMatches = Array.from(trimmed.matchAll(/['"]text['"]\s*:\s*(['"])([\s\S]*?)\1/g));
            if (textMatches.length > 0) {
                return textMatches
                    .map((m) =>
                        m[2]
                            .replace(/\\n/g, "\n")
                            .replace(/\\"/g, '"')
                            .replace(/\\'/g, "'")
                    )
                    .join("");
            }
        } catch {
            // fallback to original
        }
    }
    return content;
}

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
    const [isAiWriting, setIsAiWriting] = useState(false);
    const [pdfKey, setPdfKey] = useState(0);

    // AI Chat state
    const [chatStatus, setChatStatus] = useState<ChatStatus | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const [isChatThinking, setIsChatThinking] = useState(false);
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const chatScrollRef = useRef<HTMLDivElement | null>(null);

    const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

    const loadPdf = useCallback(async () => {
        if (!projectId) return;

        try {
            const pdfBlob = await projectService.getPdf(projectId);
            const newPdfUrl = URL.createObjectURL(pdfBlob);

            setPdfUrl((previousUrl) => {
                if (previousUrl) {
                    try {
                        URL.revokeObjectURL(previousUrl);
                    } catch {
                        // ignore
                    }
                }
                return newPdfUrl;
            });
            setPdfKey((k) => k + 1);
        } catch {
            setPdfUrl(null);
        }
    }, [projectId]);

    const applyDiagnostics = useCallback((items: CompilationDiagnostic[]) => {
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
    }, []);

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
    }, [projectId, loadPdf]);

    useEffect(() => {
        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [pdfUrl]);

    useEffect(() => {
        chatService.getStatus().then(setChatStatus).catch(() => null);
        if (projectId) {
            chatService.getHistory(projectId).then(setChatMessages).catch(() => null);
        }
    }, [projectId]);

    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [chatMessages, activeTool, isChatThinking]);

    const handleSendMessage = async (customPrompt?: string) => {
        const query = (customPrompt || inputMessage).trim();
        if (!query || !projectId || isChatThinking) return;

        setInputMessage("");
        const userMsgId = `user-${crypto.randomUUID()}`;
        const assistantMsgId = `assistant-${crypto.randomUUID()}`;

        setChatMessages((prev) => [
            ...prev,
            { id: userMsgId, role: "user", content: query },
            { id: assistantMsgId, role: "assistant", content: "", isStreaming: true, toolsUsed: [] },
        ]);

        setIsChatThinking(true);
        setActiveTool(null);

        try {
            await streamChat(
                projectId,
                query,
                (chunk) => {
                    setChatMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
                        )
                    );
                },
                (toolName) => {
                    setActiveTool(toolName);
                    setChatMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMsgId
                                ? {
                                      ...m,
                                      toolsUsed: Array.from(new Set([...(m.toolsUsed || []), toolName])),
                                  }
                                : m
                        )
                    );
                },
                () => {
                    setActiveTool(null);
                },
                (fullReply) => {
                    setChatMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMsgId
                                ? { ...m, content: fullReply || m.content, isStreaming: false }
                                : m
                        )
                    );
                    setIsChatThinking(false);
                    setActiveTool(null);
                },
                (errorMsg) => {
                    setChatMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMsgId
                                ? {
                                      ...m,
                                      content: m.content || `⚠️ Error: ${errorMsg}`,
                                      isStreaming: false,
                                  }
                                : m
                        )
                    );
                    setIsChatThinking(false);
                    setActiveTool(null);
                }
            );
        } catch (err: unknown) {
            const errText = err instanceof Error ? err.message : String(err);
            setChatMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantMsgId
                        ? {
                              ...m,
                              content: m.content || `⚠️ Failed to send message: ${errText}`,
                              isStreaming: false,
                          }
                        : m
                )
            );
        } finally {
            setIsChatThinking(false);
            setActiveTool(null);
        }
    };

    const handleClearChat = async () => {
        if (!projectId) return;
        try {
            await chatService.clearHistory(projectId);
            setChatMessages([]);
            toast.deleted("Chat History", "AI conversation history has been cleared.");
        } catch (err) {
            console.error("Failed to clear chat:", err);
            toast.error("Clear Failed", "Failed to clear conversation history.");
        }
    };

    const handleSave = async () => {
        if (!projectId || !isDirty || saving) return;

        try {
            setSaving(true);
            setError(null);

            const response = await projectService.saveLatex(projectId, latex);

            setSavedLatex(response.content);
            toast.saved("LaTeX Source", `Saved resume.tex for "${project?.title || "Project"}".`);
        } catch {
            setError("Failed to save LaTeX source.");
            toast.error("Save Failed", "Failed to save LaTeX source to disk.");
        } finally {
            setSaving(false);
        }
    };

    // Keyboard shortcut for Ctrl+S / Cmd+S
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "s") {
                event.preventDefault();
                if (isDirty && !saving && !loading && !isAiWriting) {
                    handleSave();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isDirty, saving, loading, isAiWriting, projectId, latex, project?.title]);

    // Real-time EventSource listener for MCP and AI events
    useEffect(() => {
        if (!projectId) return;

        const eventSource = new EventSource(`/api/projects/${projectId}/events`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const eventType = data.event_type;
                const payload = data.payload || {};

                if (eventType === "latex_update_started" || eventType === "ai_writing_started") {
                    setIsAiWriting(true);
                } else if (eventType === "latex_updated" || eventType === "ai_writing_completed") {
                    setIsAiWriting(false);
                    if (typeof payload.content === "string") {
                        setLatex(payload.content);
                        setSavedLatex(payload.content);
                    }
                    toast.updated("LaTeX Source", "AI assistant updated resume.tex.");
                } else if (eventType === "latex_update_failed" || eventType === "ai_writing_failed") {
                    setIsAiWriting(false);
                    const errMsg = payload.error || "AI LaTeX edit failed.";
                    setError(errMsg);
                    toast.error("AI Edit Failed", errMsg);
                } else if (eventType === "pdf_compile_started" || eventType === "compile_started") {
                    setCompiling(true);
                    setCompileError(null);
                } else if (eventType === "pdf_compiled" || eventType === "compile_completed") {
                    setCompiling(false);
                    setCompileError(null);
                    setDiagnostics([]);
                    applyDiagnostics([]);
                    loadPdf();
                    toast.compiled("Resume PDF", "Recompiled successfully via AI agent.");
                } else if (eventType === "pdf_compile_failed" || eventType === "compile_failed") {
                    setCompiling(false);
                    const errMsg = payload.error || "AI compilation failed.";
                    setCompileError(errMsg);
                    toast.error("Compilation Failed", errMsg);
                }
            } catch (err) {
                console.error("Error processing SSE event:", err);
            }
        };

        eventSource.onerror = (err) => {
            console.warn("SSE connection interrupted (reconnecting):", err);
        };

        return () => {
            eventSource.close();
        };
    }, [projectId, loadPdf, applyDiagnostics]);

    const handleCompile = async () => {
        if (!projectId || compiling) return;

        try {
            setCompiling(true);
            setCompileError(null);
            setDiagnostics([]);
            applyDiagnostics([]);

            // Save latest editor content before compilation
            if (isDirty) {
                const response = await projectService.saveLatex(projectId, latex);
                setSavedLatex(response.content);
            }

            // Compile the saved source
            await projectService.compileProject(projectId);

            // Clear old diagnostics and reload preview
            setDiagnostics([]);
            applyDiagnostics([]);
            await loadPdf();
            toast.compiled("LaTeX Resume", "PDF compiled and preview updated.");
        } catch (err: unknown) {
            let errorMsg = "Compilation failed. Check your LaTeX source.";
            if (axios.isAxiosError(err)) {
                const detail = err.response?.data?.detail;

                if (detail && Array.isArray(detail.diagnostics)) {
                    const receivedDiagnostics = detail.diagnostics as CompilationDiagnostic[];
                    setDiagnostics(receivedDiagnostics);
                    applyDiagnostics(receivedDiagnostics);
                }

                errorMsg = detail?.message ?? "Compilation failed. Check your LaTeX source.";
                setCompileError(errorMsg);
            } else {
                setCompileError(errorMsg);
            }
            toast.error("Compilation Failed", errorMsg);
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
            <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#000407] text-[#bfecf3]">
                <Loader2 size={28} className="animate-spin text-[#ff7d00]" />
                <span className="text-sm font-bold text-white">Opening workspace...</span>
            </div>
        );
    }

    if (error && !project) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#000407] text-[#ffecd1] p-6 text-center">
                <div className="rounded-2xl border-2 border-[#78290f] bg-[#000c15] p-6 max-w-md shadow-2xl">
                    <p className="text-sm text-[#ee9679] font-semibold">{error}</p>
                    <button
                        onClick={() => navigate("/")}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ff7d00] hover:bg-[#ff9633] px-5 py-2 text-xs font-bold text-[#000407] transition-all"
                    >
                        <ArrowLeft size={14} />
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-[#000407] text-[#ffecd1] selection:bg-[#ff7d00]/30 selection:text-[#ff9633]">
            {/* Top Toolbar */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#15616d]/40 bg-[#00080e] px-5 z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate("/")}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#bfecf3] hover:text-[#ff7d00] transition-colors"
                    >
                        <ArrowLeft size={14} className="stroke-[2.5]" />
                        <span>Dashboard</span>
                    </button>

                    <div className="h-4 border-l border-[#15616d]/60" />

                    <div className="flex items-center gap-2">
                        <h1 className="text-sm font-extrabold text-white tracking-tight">
                            {project?.title ?? "Resume Workspace"}
                        </h1>
                        <span className="rounded-md bg-[#001524] border border-[#15616d] px-2 py-0.5 text-[10px] font-mono text-[#3ec5da] font-semibold">
                            LaTeX
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {error && project && (
                        <span className="text-xs text-[#ee9679] bg-[#78290f]/30 px-2.5 py-1 rounded-lg border border-[#78290f] font-medium">
                            {error}
                        </span>
                    )}

                    <button
                        onClick={() => {
                            if (!pdfUrl) return;

                            const fileName = `${project?.title || "resume"}.pdf`;
                            const link = document.createElement("a");
                            link.href = pdfUrl;
                            link.download = fileName;
                            link.click();
                            toast.info("Downloading PDF", `Started download for "${fileName}".`);
                        }}
                        disabled={!pdfUrl}
                        className="flex items-center gap-1.5 rounded-xl border border-[#15616d] bg-[#000c15] px-3.5 py-1.5 text-xs font-bold text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                        <Download size={13} />
                        <span>Download PDF</span>
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving || loading || isAiWriting}
                        className="flex items-center gap-1.5 rounded-xl border border-[#15616d] bg-[#000c15] px-3.5 py-1.5 text-xs font-bold text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors disabled:opacity-40"
                    >
                        {saving ? (
                            <>
                                <Loader2 size={13} className="animate-spin text-[#ff7d00]" />
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save size={13} />
                                <span>{isDirty ? "Save changes" : "Saved"}</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleCompile}
                        disabled={compiling || loading || saving || isAiWriting}
                        className="flex items-center gap-1.5 rounded-xl bg-[#ff7d00] hover:bg-[#ff9633] px-4 py-1.5 text-xs font-extrabold text-[#000407] shadow-md shadow-[#ff7d00]/25 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {compiling ? (
                            <>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Compiling...</span>
                            </>
                        ) : (
                            <>
                                <Play size={13} className="fill-current" />
                                <span>Compile</span>
                            </>
                        )}
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
                        <section className="flex h-full min-h-0 flex-col bg-[#000407]">
                            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#15616d]/40 bg-[#00080e] px-4">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-[#bfecf3]">
                                    PDF Preview
                                </h2>
                                {compiling && (
                                    <span className="flex items-center gap-1.5 text-xs text-[#ff7d00] font-bold">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#ff7d00] animate-pulse" />
                                        Compiling...
                                    </span>
                                )}
                            </div>

                            {compileError && (
                                <div className="border-b border-[#78290f] bg-[#78290f]/40 px-4 py-3 max-h-40 overflow-y-auto">
                                    <div className="flex items-center justify-between pb-1">
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#ee9679]">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#e66235]" />
                                            LaTeX Compilation Error
                                        </span>
                                        <button
                                            onClick={() => setCompileError(null)}
                                            className="text-xs text-[#ee9679] hover:text-white font-bold transition-colors"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                    <pre className="text-xs text-[#f7cbbc] font-mono whitespace-pre-wrap break-words">
                                        {compileError}
                                    </pre>
                                </div>
                            )}

                            {pdfUrl ? (
                                <iframe
                                    key={`pdf-preview-${pdfKey}`}
                                    src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                                    title="Resume PDF Preview"
                                    className="h-full w-full border-0 bg-white"
                                />
                            ) : (
                                <div className="flex flex-1 items-center justify-center p-6 bg-[#000407]">
                                    <div className="text-center max-w-xs">
                                        <div className="h-12 w-12 rounded-2xl bg-[#00111d] border border-[#15616d]/70 flex items-center justify-center mx-auto text-[#ff7d00] mb-3 shadow-inner">
                                            <Play size={20} className="fill-current translate-x-0.5" />
                                        </div>
                                        <p className="text-sm font-bold text-white">
                                            No PDF generated yet
                                        </p>
                                        <p className="mt-1 text-xs text-[#bfecf3]">
                                            Click the <strong className="text-[#ff7d00]">Compile</strong> button above to render your resume preview.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </section>
                    </Panel>

                    <Separator className="w-1 bg-[#15616d]/40 transition-colors hover:bg-[#ff7d00] data-[separator=active]:bg-[#ff7d00]" />

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
                                <section className="flex h-full min-h-0 flex-col bg-[#000407]">
                                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#15616d]/40 bg-[#00080e] px-4">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xs font-bold uppercase tracking-wider text-[#bfecf3]">
                                                LaTeX Source
                                            </h2>
                                            {isAiWriting && (
                                                <span className="flex items-center gap-1.5 rounded-full bg-[#ff7d00]/20 px-2 py-0.5 text-[11px] font-bold text-[#ff7d00] border border-[#ff7d00]/50">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-[#ff7d00] animate-pulse" />
                                                    AI Editing (Read-Only)
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {diagnostics.length > 0 && (
                                                <span className="text-xs text-[#ff9f17] font-bold">
                                                    {diagnostics.length} diagnostic{diagnostics.length === 1 ? "" : "s"}
                                                </span>
                                            )}
                                            <span className="font-mono text-xs text-[#3ec5da] font-bold">resume.tex</span>
                                        </div>
                                    </div>

                                    <div className="min-h-0 flex-1 bg-[#000407]">
                                        <Editor
                                            height="100%"
                                            language="latex"
                                            theme="studio-dark"
                                            beforeMount={configureStudioTheme}
                                            value={latex}
                                            onChange={(value) => {
                                                if (isAiWriting) return;
                                                setLatex(value ?? "");

                                                // Clear diagnostics when source changes
                                                setDiagnostics([]);
                                                applyDiagnostics([]);
                                            }}
                                            onMount={(editor, monaco) => {
                                                editorRef.current = editor;
                                                monacoRef.current = monaco;
                                            }}
                                            options={{
                                                readOnly: isAiWriting,
                                                minimap: { enabled: false },
                                                fontSize: 13,
                                                fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, monospace",
                                                lineNumbers: "on",
                                                scrollBeyondLastLine: false,
                                                automaticLayout: true,
                                                wordWrap: "on",
                                                padding: {
                                                    top: 14,
                                                    bottom: 14,
                                                },
                                            }}
                                        />
                                    </div>
                                </section>
                            </Panel>

                            <Separator className="h-1 bg-[#15616d]/40 transition-colors hover:bg-[#ff7d00] data-[separator=active]:bg-[#ff7d00]" />

                            {/* AI Chat */}
                            <Panel id="chat" defaultSize="40%" minSize="20%">
                                <section className="flex h-full min-h-0 flex-col bg-[#000407]">
                                    {/* Chat Header */}
                                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#15616d]/40 bg-[#00080e] px-4">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={14} className="text-[#ff7d00]" />
                                            <h2 className="text-xs font-bold uppercase tracking-wider text-[#bfecf3]">
                                                AI Assistant
                                            </h2>
                                            {chatStatus && (
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${
                                                        chatStatus.configured
                                                            ? "bg-[#15616d]/30 text-[#3ec5da] border border-[#15616d]"
                                                            : "bg-[#78290f]/30 text-[#ee9679] border border-[#78290f]"
                                                    }`}
                                                >
                                                    {chatStatus.configured
                                                        ? `${chatStatus.provider} (${chatStatus.model})`
                                                        : "No LLM Key"}
                                                </span>
                                            )}
                                        </div>

                                        {chatMessages.length > 0 && (
                                            <button
                                                onClick={handleClearChat}
                                                title="Clear conversation"
                                                className="text-[#bfecf3] hover:text-white transition-colors p-1 rounded-lg hover:bg-[#001524]"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Unconfigured Alert */}
                                    {chatStatus && !chatStatus.configured && (
                                        <div className="border-b border-[#78290f] bg-[#78290f]/20 px-3 py-2 flex items-start gap-2 text-xs text-[#ee9679]">
                                            <AlertCircle size={14} className="shrink-0 mt-0.5 text-[#e66235]" />
                                            <p className="leading-tight">
                                                Configure your API key (<code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, or <code>ANTHROPIC_API_KEY</code>) in <code>.env</code> to activate the AI assistant.
                                            </p>
                                        </div>
                                    )}

                                    {/* Message List or Empty Suggestions */}
                                    <div
                                        ref={chatScrollRef}
                                        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-[#000407]"
                                    >
                                        {chatMessages.length === 0 ? (
                                            <div className="flex h-full flex-col items-center justify-center text-center p-2">
                                                <div className="h-10 w-10 rounded-2xl bg-[#00111d] border border-[#15616d]/80 flex items-center justify-center text-[#ff7d00] mb-2 shadow-inner">
                                                    <Bot size={22} />
                                                </div>
                                                <p className="text-sm font-bold text-white">
                                                    How can I help with your resume?
                                                </p>
                                                <p className="mt-1 text-xs text-[#bfecf3] max-w-xs">
                                                    Ask to tailor bullet points, import profile details, or fix LaTeX errors.
                                                </p>

                                                {/* Suggestions */}
                                                <div className="mt-4 flex flex-col gap-1.5 w-full max-w-sm text-left">
                                                    {[
                                                        "Tailor bullet points for a Senior Developer role",
                                                        "Import experience and skills from my master profile",
                                                        "Enhance resume formatting and strong action verbs",
                                                        "Fix LaTeX compilation errors and warnings",
                                                    ].map((prompt, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleSendMessage(prompt)}
                                                            disabled={!chatStatus?.configured || isChatThinking}
                                                            className="rounded-xl border border-[#15616d]/70 bg-[#000c15] px-3.5 py-2 text-xs font-semibold text-[#ffecd1] hover:border-[#ff7d00] hover:text-[#ff7d00] hover:bg-[#001524] transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                                        >
                                                            ✨ {prompt}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            chatMessages.map((msg) => (
                                                <div
                                                    key={msg.id}
                                                    className={`flex gap-2.5 ${
                                                        msg.role === "user" ? "justify-end" : "justify-start"
                                                    }`}
                                                >
                                                    {msg.role === "assistant" && (
                                                        <div className="h-6 w-6 rounded-full bg-[#00111d] border border-[#ff7d00]/50 flex items-center justify-center shrink-0 mt-0.5 text-[#ff7d00]">
                                                            <Bot size={13} />
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                                                            msg.role === "user"
                                                                ? "bg-[#ff7d00] text-[#000407] font-bold shadow-md shadow-[#ff7d00]/20"
                                                                : "bg-[#000c15] border border-[#15616d]/60 text-[#ffecd1] shadow-md"
                                                        }`}
                                                    >
                                                        {/* Tool usage tags */}
                                                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                                                            <div className="mb-2 flex flex-wrap gap-1">
                                                                {msg.toolsUsed.map((tool) => (
                                                                    <span
                                                                        key={tool}
                                                                        className="inline-flex items-center gap-1 rounded-md bg-[#000407] border border-[#15616d] px-1.5 py-0.5 text-[10px] text-[#3ec5da] font-mono font-bold"
                                                                    >
                                                                        <Wrench size={9} />
                                                                        {tool}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {msg.role === "assistant" ? (
                                                            <div className="leading-relaxed">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{
                                                                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                                                        h1: ({ children }) => <h1 className="text-sm font-bold text-white mt-3 mb-1.5">{children}</h1>,
                                                                        h2: ({ children }) => <h2 className="text-xs font-bold text-white mt-2.5 mb-1">{children}</h2>,
                                                                        h3: ({ children }) => <h3 className="text-xs font-semibold text-[#ff7d00] mt-2 mb-1">{children}</h3>,
                                                                        ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1.5 pl-1">{children}</ul>,
                                                                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1.5 pl-1">{children}</ol>,
                                                                        li: ({ children }) => <li className="text-[#ffecd1]">{children}</li>,
                                                                        code: ({ children }) => <code className="bg-[#000407] border border-[#15616d] text-[#ff7d00] px-1 py-0.5 rounded text-[11px] font-mono">{children}</code>,
                                                                        pre: ({ children }) => <pre className="bg-[#000407] border border-[#15616d] p-2.5 rounded-xl my-1.5 overflow-x-auto text-[11px] font-mono text-[#ffecd1]">{children}</pre>,
                                                                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#3ec5da] underline hover:text-[#7ed9e7]">{children}</a>,
                                                                        hr: () => <hr className="border-[#15616d]/50 my-2" />,
                                                                        strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                                                                    }}
                                                                >
                                                                    {cleanMessageContent(msg.content)}
                                                                </ReactMarkdown>
                                                            </div>
                                                        ) : (
                                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                                        )}

                                                        {msg.isStreaming && !msg.content && (
                                                            <div className="flex items-center gap-1.5 py-1 text-[#bfecf3]">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-[#ff7d00] animate-pulse" />
                                                                <span className="text-[11px] italic">
                                                                    {compiling
                                                                        ? "Compiling PDF preview..."
                                                                        : isAiWriting
                                                                        ? "Updating LaTeX code..."
                                                                        : activeTool
                                                                        ? `Running tool: ${activeTool}...`
                                                                        : msg.toolsUsed && msg.toolsUsed.includes("write_latex")
                                                                        ? "Resume updated! Summarizing changes..."
                                                                        : "Thinking..."}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {msg.role === "user" && (
                                                        <div className="h-6 w-6 rounded-full bg-[#001524] border border-[#15616d] flex items-center justify-center shrink-0 mt-0.5 text-[#bfecf3]">
                                                            <User size={13} />
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}

                                        {/* Active Tool Badge */}
                                        {activeTool && (
                                            <div className="flex items-center gap-2 px-2 text-xs text-[#3ec5da] animate-pulse font-mono">
                                                <Wrench size={12} />
                                                <span>Running tool: <code>{activeTool}</code>...</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Input Footer */}
                                    <div className="border-t border-[#15616d]/40 bg-[#00080e] p-3">
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }}
                                            className="flex gap-2"
                                        >
                                            <input
                                                value={inputMessage}
                                                onChange={(e) => setInputMessage(e.target.value)}
                                                disabled={isChatThinking || (chatStatus !== null && !chatStatus.configured)}
                                                placeholder={
                                                    chatStatus?.configured
                                                        ? "Ask AI to edit, format, or improve your resume..."
                                                        : "Configure API key in .env to chat..."
                                                }
                                                className="flex-1 rounded-xl border border-[#15616d] bg-[#000c15] px-3.5 py-2 text-xs text-[#ffecd1] placeholder-[#7ed9e7]/50 outline-none focus:border-[#ff7d00] focus:ring-1 focus:ring-[#ff7d00]/30 disabled:opacity-50 transition-all font-medium"
                                            />
                                            <button
                                                type="submit"
                                                disabled={
                                                    !inputMessage.trim() ||
                                                    isChatThinking ||
                                                    (chatStatus !== null && !chatStatus.configured)
                                                }
                                                className="rounded-xl bg-[#ff7d00] hover:bg-[#ff9633] px-4 py-2 text-xs font-bold text-[#000407] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-[#ff7d00]/25 active:scale-95"
                                            >
                                                <Send size={13} className="stroke-[2.5]" />
                                            </button>
                                        </form>
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
