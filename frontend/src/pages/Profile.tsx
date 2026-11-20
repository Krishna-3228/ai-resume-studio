import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { Save, RotateCcw, FileCode, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { profileService } from "../services/profileService";
import { configureStudioTheme } from "../utils/monacoTheme";
import { toast } from "../components/toast";

export default function Profile() {
    const [sections, setSections] = useState<string[]>([]);
    const [selectedSection, setSelectedSection] = useState<string | null>(null);

    const [content, setContent] = useState("");
    const [savedContent, setSavedContent] = useState("");

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const isDirty = content !== savedContent;

    useEffect(() => {
        async function loadSections() {
            try {
                const data = await profileService.getSections();
                setSections(data);

                if (data.length > 0) {
                    setSelectedSection(data[0]);
                }
            } catch {
                setError("Failed to load profile sections.");
                toast.error("Profile Error", "Failed to load profile sections.");
            }
        }

        loadSections();
    }, []);

    useEffect(() => {
        if (!selectedSection) return;

        async function loadSection() {
            setLoading(true);
            setError(null);
            setSuccess(null);

            try {
                if (!selectedSection) return;
                const data = await profileService.getSection(selectedSection);
                setContent(data.content);
                setSavedContent(data.content);
            } catch {
                setError(`Failed to load ${selectedSection}.yaml`);
                toast.error("Load Failed", `Failed to load ${selectedSection}.yaml`);
            } finally {
                setLoading(false);
            }
        }

        loadSection();
    }, [selectedSection]);

    const handleSectionChange = (section: string) => {
        if (section === selectedSection) return;

        if (isDirty) {
            const confirmed = window.confirm(
                "You have unsaved changes. Discard them and switch sections?"
            );

            if (!confirmed) return;
        }

        setSelectedSection(section);
    };

    const handleSave = async () => {
        if (!selectedSection || !isDirty) return;

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            await profileService.saveSection(selectedSection, content);
            setSavedContent(content);
            setSuccess("Profile section saved successfully.");
            toast.saved(formatName(selectedSection), `${selectedSection}.yaml saved successfully.`);
        } catch (err: unknown) {
            const axiosError = err as { response?: { data?: { detail?: string } } };
            const errorMsg = axiosError.response?.data?.detail ?? "Failed to save profile.";
            setError(errorMsg);
            toast.error("Save Failed", errorMsg);
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "s") {
                event.preventDefault();
                if (isDirty && !saving && !loading) {
                    handleSave();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isDirty, saving, loading, selectedSection, content]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (isDirty) {
                event.preventDefault();
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [isDirty]);

    const formatName = (section: string) =>
        section
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white">
                        Master Profile
                    </h1>
                    <p className="mt-1 text-sm text-[#bfecf3]">
                        Centralized profile data in YAML format used by the AI agent to tailor LaTeX resumes.
                    </p>
                </div>
            </div>

            {/* Editor Workspace Container with High Contrast */}
            <div className="flex min-h-[640px] overflow-hidden rounded-2xl border-2 border-[#15616d]/50 bg-[#000c15] shadow-2xl shadow-black">
                {/* Aside Section Nav */}
                <aside className="w-64 shrink-0 border-r border-[#15616d]/40 bg-[#00080e] p-4 flex flex-col">
                    <h2 className="mb-3 px-3 text-[11px] font-bold uppercase tracking-wider text-[#7ed9e7]">
                        Profile Sections
                    </h2>

                    <div className="space-y-1.5 flex-1 overflow-y-auto">
                        {sections.map((section) => (
                            <button
                                key={section}
                                onClick={() => handleSectionChange(section)}
                                className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-left text-xs font-semibold transition-all ${
                                    selectedSection === section
                                        ? "bg-[#001524] text-[#ff7d00] border-l-4 border-[#ff7d00] shadow-md font-bold"
                                        : "text-[#bfecf3] hover:bg-[#00111d] hover:text-white"
                                }`}
                            >
                                <span>{formatName(section)}</span>
                                <span className={`font-mono text-[10px] ${selectedSection === section ? "text-[#ff9633]" : "text-[#15616d]"}`}>
                                    .yaml
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="pt-3 border-t border-[#15616d]/30 text-[11px] text-[#7ed9e7] px-2 flex items-center gap-2">
                        <FileCode size={14} className="text-[#ff7d00]" />
                        <span className="font-semibold">YAML Master Format</span>
                    </div>
                </aside>

                {/* Main Editor Section */}
                <section className="flex min-w-0 flex-1 flex-col bg-[#000407]">
                    {/* Editor Toolbar */}
                    <div className="flex h-16 items-center justify-between border-b border-[#15616d]/50 bg-[#00111d] px-6">
                        <div className="flex items-center gap-3">
                            <div>
                                <h2 className="text-sm font-extrabold text-white">
                                    {selectedSection
                                        ? formatName(selectedSection)
                                        : "Select a section"}
                                </h2>

                                {selectedSection && (
                                    <p className="font-mono text-[11px] text-[#3ec5da] font-semibold">
                                        {selectedSection}.yaml
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-xs">
                                {isDirty ? (
                                    <span className="flex items-center gap-1.5 text-[#ff9f17] font-bold">
                                        <span className="h-2 w-2 rounded-full bg-[#ff9f17] animate-pulse" />
                                        Unsaved changes
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-[#7ed9e7] font-medium">
                                        <CheckCircle2 size={14} className="text-[#3ec5da]" />
                                        All changes saved
                                    </span>
                                )}
                            </span>

                            <button
                                onClick={() => {
                                    setContent(savedContent);
                                    setError(null);
                                    setSuccess(null);
                                    toast.reverted(
                                        selectedSection ? formatName(selectedSection) : "Profile Section",
                                        `Reverted ${selectedSection}.yaml to last saved state.`
                                    );
                                }}
                                disabled={!isDirty || saving || loading}
                                className="flex items-center gap-1.5 rounded-xl border border-[#15616d] bg-[#00080e] px-3.5 py-2 text-xs font-bold text-[#bfecf3] transition hover:bg-[#001524] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                                title="Revert to last saved content"
                            >
                                <RotateCcw size={13} />
                                <span>Revert</span>
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={!isDirty || saving || loading}
                                className="flex items-center gap-2 rounded-xl bg-[#ff7d00] hover:bg-[#ff9633] px-5 py-2 text-xs font-extrabold text-[#000407] shadow-md shadow-[#ff7d00]/25 transition disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={14} className="stroke-[3]" />
                                        <span>Save Section</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Alerts */}
                    {error && (
                        <div className="flex items-center gap-2 border-b border-[#78290f] bg-[#78290f]/30 px-6 py-2.5 text-xs text-[#ee9679] font-medium">
                            <AlertCircle size={14} className="shrink-0 text-[#e66235]" />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="flex items-center gap-2 border-b border-[#15616d] bg-[#15616d]/30 px-6 py-2.5 text-xs text-[#3ec5da] font-medium">
                            <CheckCircle2 size={14} className="shrink-0 text-[#3ec5da]" />
                            <span>{success}</span>
                        </div>
                    )}

                    {/* Editor Canvas */}
                    <div className="flex-1 min-h-[520px] bg-[#000407]">
                        {loading ? (
                            <div className="flex h-full items-center justify-center p-12 text-xs text-[#bfecf3] gap-2">
                                <Loader2 size={18} className="animate-spin text-[#ff7d00]" />
                                <span>Loading profile section...</span>
                            </div>
                        ) : (
                            <Editor
                                height="560px"
                                language="yaml"
                                theme="studio-dark"
                                beforeMount={configureStudioTheme}
                                value={content}
                                onChange={(value) => setContent(value ?? "")}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, monospace",
                                    wordWrap: "on",
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 2,
                                    padding: {
                                        top: 16,
                                        bottom: 16,
                                    },
                                    lineNumbers: "on",
                                }}
                            />
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
