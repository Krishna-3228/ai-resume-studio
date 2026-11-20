import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { projectService, type Project } from "../services/projectService";
import { chatService, streamChat, type ChatMessage, type ChatStatus } from "../services/chatService";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Sparkles, Send, Trash2, Wrench, AlertCircle, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import axios from "axios";

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
    }, [projectId]);

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
        const userMsgId = `user-${Date.now()}`;
        const assistantMsgId = `assistant-${Date.now()}`;

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
                (_toolName) => {
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
        } catch (err) {
            console.error("Failed to clear chat:", err);
        }
    };

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
                } else if (eventType === "latex_update_failed" || eventType === "ai_writing_failed") {
                    setIsAiWriting(false);
                    setError(payload.error || "AI LaTeX edit failed.");
                } else if (eventType === "pdf_compile_started" || eventType === "compile_started") {
                    setCompiling(true);
                    setCompileError(null);
                } else if (eventType === "pdf_compiled" || eventType === "compile_completed") {
                    setCompiling(false);
                    setCompileError(null);
                    setDiagnostics([]);
                    applyDiagnostics([]);
                    loadPdf();
                } else if (eventType === "pdf_compile_failed" || eventType === "compile_failed") {
                    setCompiling(false);
                    setCompileError(payload.error || "AI compilation failed.");
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
                        disabled={!isDirty || saving || loading || isAiWriting}
                        className="rounded-md border border-gray-700 px-4 py-1.5 text-sm disabled:opacity-40"
                    >
                        {saving ? "Saving..." : isDirty ? "Save changes" : "Saved"}
                    </button>

                    <button
                        onClick={handleCompile}
                        disabled={compiling || loading || saving || isAiWriting}
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
                            <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-800 px-4">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    PDF Preview
                                </h2>
                                {compiling && (
                                    <span className="flex items-center gap-1.5 text-xs text-blue-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                        Compiling...
                                    </span>
                                )}
                            </div>

                            {compileError && (
                                <div className="border-b border-red-900 bg-red-950/70 px-4 py-2.5 max-h-40 overflow-y-auto">
                                    <div className="flex items-center justify-between pb-1">
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                                            LaTeX Compilation Error
                                        </span>
                                        <button
                                            onClick={() => setCompileError(null)}
                                            className="text-xs text-red-400/80 hover:text-red-200"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                    <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-words">
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
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                                LaTeX Editor
                                            </h2>
                                            {isAiWriting && (
                                                <span className="flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                                    AI Writing (Read-Only)
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {diagnostics.length > 0 && (
                                                <span className="text-xs text-amber-400">
                                                    {diagnostics.length} diagnostic{diagnostics.length === 1 ? "" : "s"}
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-600">resume.tex</span>
                                        </div>
                                    </div>

                                    <div className="min-h-0 flex-1">
                                        <Editor
                                            height="100%"
                                            language="latex"
                                            theme="vs-dark"
                                            value={latex}
                                            onChange={(value) => {
                                                if (isAiWriting) return;
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
                                                readOnly: isAiWriting,
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
                                <section className="flex h-full min-h-0 flex-col bg-gray-950">
                                    {/* Chat Header */}
                                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-800 px-4">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={14} className="text-blue-400" />
                                            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                                AI Assistant
                                            </h2>
                                            {chatStatus && (
                                                <span
                                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                        chatStatus.configured
                                                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
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
                                                className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Unconfigured Alert */}
                                    {chatStatus && !chatStatus.configured && (
                                        <div className="border-b border-amber-900/40 bg-amber-950/20 px-3 py-2 flex items-start gap-2 text-xs text-amber-400">
                                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                            <p className="leading-tight">
                                                Add your API key (<code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, or <code>ANTHROPIC_API_KEY</code>) to <code>.env</code> in the project root to activate the AI assistant.
                                            </p>
                                        </div>
                                    )}

                                    {/* Message List or Empty Suggestions */}
                                    <div
                                        ref={chatScrollRef}
                                        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
                                    >
                                        {chatMessages.length === 0 ? (
                                            <div className="flex h-full flex-col items-center justify-center text-center p-2">
                                                <Bot size={28} className="text-gray-600 mb-2" />
                                                <p className="text-sm font-medium text-gray-300">
                                                    How can I help with your resume?
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500 max-w-xs">
                                                    Ask to tailor bullet points, import profile details, or fix LaTeX errors.
                                                </p>

                                                {/* Suggestions */}
                                                <div className="mt-4 flex flex-col gap-1.5 w-full max-w-sm text-left">
                                                    {[
                                                        "Tailor bullet points for a Senior Developer role",
                                                        "Import experience and skills from my profile",
                                                        "Enhance resume formatting and action verbs",
                                                        "Fix LaTeX compilation errors",
                                                    ].map((prompt, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleSendMessage(prompt)}
                                                            disabled={!chatStatus?.configured || isChatThinking}
                                                            className="rounded-md border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-700 hover:bg-gray-800 hover:text-gray-200 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
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
                                                        <div className="h-6 w-6 rounded-full bg-blue-900/50 border border-blue-700/50 flex items-center justify-center shrink-0 mt-0.5">
                                                            <Bot size={13} className="text-blue-400" />
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                                                            msg.role === "user"
                                                                ? "bg-blue-600 text-white"
                                                                : "bg-gray-900 border border-gray-800 text-gray-200"
                                                        }`}
                                                    >
                                                        {/* Tool usage tags */}
                                                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                                                            <div className="mb-2 flex flex-wrap gap-1">
                                                                {msg.toolsUsed.map((tool) => (
                                                                    <span
                                                                        key={tool}
                                                                        className="inline-flex items-center gap-1 rounded bg-gray-800 border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 font-mono"
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
                                                                        h3: ({ children }) => <h3 className="text-xs font-semibold text-blue-300 mt-2 mb-1">{children}</h3>,
                                                                        ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1.5 pl-1">{children}</ul>,
                                                                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1.5 pl-1">{children}</ol>,
                                                                        li: ({ children }) => <li className="text-gray-300">{children}</li>,
                                                                        code: ({ children }) => <code className="bg-gray-800 text-amber-300 px-1 py-0.5 rounded text-[11px] font-mono">{children}</code>,
                                                                        pre: ({ children }) => <pre className="bg-gray-800/80 p-2 rounded my-1.5 overflow-x-auto text-[11px] font-mono text-gray-200">{children}</pre>,
                                                                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{children}</a>,
                                                                        hr: () => <hr className="border-gray-800 my-2" />,
                                                                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                                                    }}
                                                                >
                                                                    {cleanMessageContent(msg.content)}
                                                                </ReactMarkdown>
                                                            </div>
                                                        ) : (
                                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                                        )}

                                                        {msg.isStreaming && !msg.content && (
                                                            <div className="flex items-center gap-1.5 py-1 text-gray-400">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                                                <span className="text-[11px] italic">Thinking...</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {msg.role === "user" && (
                                                        <div className="h-6 w-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                                                            <User size={13} className="text-gray-400" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}

                                        {/* Active Tool Badge */}
                                        {activeTool && (
                                            <div className="flex items-center gap-2 px-2 text-xs text-amber-400 animate-pulse">
                                                <Wrench size={12} />
                                                <span>Running tool: <code>{activeTool}</code>...</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Input Footer */}
                                    <div className="border-t border-gray-800 p-3">
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
                                                className="flex-1 rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                                            />
                                            <button
                                                type="submit"
                                                disabled={
                                                    !inputMessage.trim() ||
                                                    isChatThinking ||
                                                    (chatStatus !== null && !chatStatus.configured)
                                                }
                                                className="rounded-md bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Send size={13} />
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