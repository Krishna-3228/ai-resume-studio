import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { Save } from "lucide-react";
import { profileService } from "../services/profileService";

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
                const data = await profileService.getSection(selectedSection);
                setContent(data.content);
                setSavedContent(data.content);
            } catch {
                setError(`Failed to load ${selectedSection}.yaml`);
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
            setSuccess("Changes saved successfully.");
        } catch (err: any) {
            setError(
                err.response?.data?.detail ?? "Failed to save profile."
            );
        } finally {
            setSaving(false);
        }
    };

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
            <div>
                <h1 className="text-2xl font-semibold">Profile</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Manage the information used to generate your resumes.
                </p>
            </div>

            <div className="flex min-h-[600px] overflow-hidden rounded-xl border border-gray-200 bg-white">
                <aside className="w-64 shrink-0 border-r border-gray-200 p-4">
                    <h2 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Profile Sections
                    </h2>

                    <div className="space-y-1">
                        {sections.map((section) => (
                            <button
                                key={section}
                                onClick={() => handleSectionChange(section)}
                                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${selectedSection === section
                                        ? "bg-indigo-50 font-medium text-indigo-700"
                                        : "text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                {formatName(section)}
                            </button>
                        ))}
                    </div>
                </aside>

                <section className="flex min-w-0 flex-1 flex-col">
                    <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
                        <div>
                            <h2 className="text-sm font-semibold">
                                {selectedSection
                                    ? formatName(selectedSection)
                                    : "Select a section"}
                            </h2>

                            {selectedSection && (
                                <p className="text-xs text-gray-400">
                                    {selectedSection}.yaml
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-500">
                                {isDirty ? "Unsaved changes" : "All changes saved"}
                            </span>
                            <button
                                onClick={() => {
                                    setContent(savedContent);
                                    setError(null);
                                    setSuccess(null);
                                }}
                                disabled={!isDirty || saving || loading}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Restore
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!isDirty || saving || loading}
                                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Save className="h-4 w-4" />
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="border-b border-green-200 bg-green-50 px-5 py-3 text-sm text-green-700">
                            {success}
                        </div>
                    )}

                    <div className="flex-1">
                        {loading ? (
                            <div className="p-6 text-sm text-gray-500">
                                Loading profile...
                            </div>
                        ) : (
                            <Editor
                                height="540px"
                                language="yaml"
                                theme="vs"
                                value={content}
                                onChange={(value) => setContent(value ?? "")}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    wordWrap: "on",
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 2,
                                }}
                            />
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}