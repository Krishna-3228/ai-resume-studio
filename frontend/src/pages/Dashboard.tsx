import { useEffect, useState } from "react";
import { FileText, Loader2, Search, Plus, X, MoreVertical, Trash2, Edit3, ArrowRight, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
    projectService,
    type Project,
} from "../services/projectService";
import { toast } from "../components/toast";

export default function Dashboard() {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState("");

    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [editMode, setEditMode] = useState<"rename" | "description" | null>(null);

    const [editValue, setEditValue] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState("");

    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

    useEffect(() => {
        loadProjects();
    }, []);

    async function loadProjects() {
        try {
            setLoading(true);
            setError("");

            const data = await projectService.getProjects();
            setProjects(data);
        } catch {
            setError("Unable to load projects. Please try again.");
            toast.error("Loading Error", "Unable to load resume projects. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    const filteredProjects = projects.filter((project) =>
        project.title.toLowerCase().includes(search.toLowerCase())
    );

    function formatDate(date: string) {
        return new Date(date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    }

    async function handleCreateProject(event: React.FormEvent) {
        event.preventDefault();

        if (!newTitle.trim()) {
            setCreateError("Project title is required.");
            return;
        }

        try {
            setCreating(true);
            setCreateError("");

            const project = await projectService.createProject(
                newTitle.trim(),
                newDescription.trim() || undefined,
            );

            setProjects((previous) => [project, ...previous]);

            setShowCreateModal(false);
            setNewTitle("");
            setNewDescription("");
            toast.created("Project", `"${project.title}" created successfully.`);
        } catch {
            setCreateError("Unable to create project. Please try again.");
            toast.error("Create Project Failed", "Unable to create project. Please try again.");
        } finally {
            setCreating(false);
        }
    }

    function openEditModal(
        project: Project,
        mode: "rename" | "description",
    ) {
        setEditingProject(project);
        setEditMode(mode);
        setEditValue(
            mode === "rename"
                ? project.title
                : project.description || "",
        );
        setEditError("");
        setActiveMenu(null);
    }

    async function handleEditProject(event: React.FormEvent) {
        event.preventDefault();

        if (!editingProject || !editMode) return;

        if (editMode === "rename" && !editValue.trim()) {
            setEditError("Project title cannot be empty.");
            return;
        }

        try {
            setSavingEdit(true);
            setEditError("");

            const updatedProject = await projectService.updateProject(
                editingProject.id,
                editMode === "rename"
                    ? { title: editValue.trim() }
                    : { description: editValue.trim() || null },
            );

            setProjects((previous) =>
                previous.map((project) =>
                    project.id === updatedProject.id
                        ? updatedProject
                        : project,
                ),
            );

            const isRename = editMode === "rename";
            setEditingProject(null);
            setEditMode(null);

            if (isRename) {
                toast.updated("Project", `Renamed to "${updatedProject.title}".`);
            } else {
                toast.updated("Project Description", `Updated description for "${updatedProject.title}".`);
            }
        } catch {
            setEditError("Unable to update project. Please try again.");
            toast.error("Update Failed", "Unable to update project. Please try again.");
        } finally {
            setSavingEdit(false);
        }
    }

    async function handleDeleteProject() {
        if (!projectToDelete) return;

        const deletedTitle = projectToDelete.title;

        try {
            setDeleting(true);
            setDeleteError("");

            await projectService.deleteProject(projectToDelete.id);

            setProjects((previous) =>
                previous.filter(
                    (project) => project.id !== projectToDelete.id,
                ),
            );

            setProjectToDelete(null);
            toast.deleted("Project", `"${deletedTitle}" has been permanently deleted.`);
        } catch {
            setDeleteError("Unable to delete project. Please try again.");
            toast.error("Delete Failed", "Unable to delete project. Please try again.");
        } finally {
            setDeleting(false);
        }
    }

    async function handleDuplicateProject(project: Project) {
        try {
            setDuplicatingId(project.id);
            setActiveMenu(null);

            const duplicated = await projectService.duplicateProject(project.id);
            setProjects((previous) => [duplicated, ...previous]);
            toast.created("Project", `"${project.title}" duplicated successfully.`);
        } catch {
            toast.error("Duplicate Failed", "Unable to duplicate project. Please try again.");
        } finally {
            setDuplicatingId(null);
        }
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white">
                        All Projects
                    </h1>
                    <p className="mt-1 text-sm text-[#bfecf3]">
                        Manage and compile tailored LaTeX resumes with real-time AI assistance.
                    </p>
                </div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#ff7d00] hover:bg-[#ff9633] px-5 py-2.5 text-sm font-bold text-[#000407] shadow-lg shadow-[#ff7d00]/25 transition-all cursor-pointer active:scale-95"
                >
                    <Plus size={18} className="stroke-[3]" />
                    <span>New Project</span>
                </button>
            </div>

            {/* Search and Filters Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <div className="flex items-center gap-3 rounded-xl border border-[#15616d]/70 bg-[#000c15] px-4 py-2.5 focus-within:border-[#ff7d00] focus-within:ring-2 focus-within:ring-[#ff7d00]/20 transition-all shadow-inner">
                        <Search size={18} className="text-[#3ec5da] shrink-0" />
                        <input
                            type="text"
                            placeholder="Search projects by title..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="w-full bg-transparent text-sm text-[#ffecd1] placeholder-[#7ed9e7]/60 outline-none font-medium"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="text-[#bfecf3] hover:text-white transition-colors"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="text-xs text-[#bfecf3] flex items-center gap-2">
                    <span className="font-medium">Total:</span>
                    <span className="font-bold text-[#ffecd1] px-2.5 py-0.5 rounded-md bg-[#00111d] border border-[#15616d]/60">
                        {filteredProjects.length}
                    </span>
                    <span>{filteredProjects.length === 1 ? "project" : "projects"}</span>
                </div>
            </div>

            {/* Project List / Table Container */}
            <div className="rounded-2xl border border-[#15616d]/50 bg-[#000c15] overflow-hidden shadow-2xl shadow-black">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-[#bfecf3] gap-3">
                        <Loader2 size={26} className="animate-spin text-[#ff7d00]" />
                        <span className="text-sm font-semibold text-white">Loading resume projects...</span>
                    </div>
                ) : error ? (
                    <div className="py-16 text-center text-[#ee9679]">
                        <p className="font-semibold">{error}</p>
                        <button
                            onClick={loadProjects}
                            className="mt-3 text-xs text-[#ff7d00] hover:underline font-bold"
                        >
                            Retry Loading
                        </button>
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <div className="h-14 w-14 rounded-2xl bg-[#001524] border border-[#15616d]/70 flex items-center justify-center mx-auto text-[#ff7d00] shadow-inner">
                            <FileText size={28} />
                        </div>

                        <h2 className="mt-4 text-base font-bold text-white">
                            {search ? "No matching projects" : "No resume projects yet"}
                        </h2>

                        <p className="mt-1.5 text-sm text-[#bfecf3] max-w-sm mx-auto">
                            {search
                                ? "No resume project titles matched your search query. Try another keyword."
                                : "Create your first tailored resume project to begin drafting."}
                        </p>

                        {!search && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#ff7d00]/20 border border-[#ff7d00]/50 px-4 py-2 text-xs font-bold text-[#ff7d00] hover:bg-[#ff7d00]/30 transition-all"
                            >
                                <Plus size={14} className="stroke-[3]" />
                                Create New Project
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[650px] border-collapse text-left">
                            <thead>
                                <tr className="border-b border-[#15616d]/50 bg-[#00111d] text-xs font-bold tracking-wider text-[#bfecf3] uppercase">
                                    <th className="px-6 py-4">Title & Details</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Last Modified</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-[#15616d]/20">
                                {filteredProjects.map((project) => (
                                    <tr
                                        key={project.id}
                                        onClick={() => navigate(`/projects/${project.id}`)}
                                        className="group transition-colors hover:bg-[#001524] cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3.5">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00111d] border border-[#15616d]/70 text-[#ff7d00] group-hover:border-[#ff7d00] group-hover:text-[#ff9633] transition-colors shadow-sm">
                                                    <FileText size={20} />
                                                </div>

                                                <div>
                                                    <p className="font-bold text-white group-hover:text-[#ff7d00] transition-colors flex items-center gap-2 text-sm">
                                                        <span>{project.title}</span>
                                                        <ArrowRight
                                                            size={14}
                                                            className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#ff7d00]"
                                                        />
                                                    </p>

                                                    {project.description ? (
                                                        <p className="mt-0.5 text-xs text-[#ffecd1]/80 line-clamp-1">
                                                            {project.description}
                                                        </p>
                                                    ) : (
                                                        <p className="mt-0.5 text-[11px] italic text-[#bfecf3]/60">
                                                            No description provided
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#15616d]/25 px-3 py-1 text-xs font-semibold text-[#3ec5da] border border-[#15616d]/60">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[#3ec5da]" />
                                                <span className="capitalize">{project.status}</span>
                                            </span>
                                        </td>

                                        <td className="px-6 py-4 text-xs font-medium text-[#bfecf3]">
                                            {formatDate(project.updated_at)}
                                        </td>

                                        <td className="px-6 py-4 text-right">
                                            <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveMenu(activeMenu === project.id ? null : project.id)}
                                                    className="rounded-lg p-2 text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors"
                                                    title="More actions"
                                                >
                                                    <MoreVertical size={18} />
                                                </button>

                                                {activeMenu === project.id && (
                                                    <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-[#15616d] bg-[#00111d] p-1.5 text-left shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                                                        <button
                                                            onClick={() => openEditModal(project, "rename")}
                                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#ffecd1] hover:bg-[#001524] hover:text-[#ff7d00] transition-colors"
                                                        >
                                                            <Edit3 size={14} className="text-[#ff7d00]" />
                                                            <span>Rename Project</span>
                                                        </button>

                                                        <button
                                                            onClick={() => openEditModal(project, "description")}
                                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#ffecd1] hover:bg-[#001524] hover:text-[#ff7d00] transition-colors"
                                                        >
                                                            <FileText size={14} className="text-[#ff7d00]" />
                                                            <span>Edit Description</span>
                                                        </button>

                                                        <button
                                                            onClick={() => handleDuplicateProject(project)}
                                                            disabled={duplicatingId === project.id}
                                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#ffecd1] hover:bg-[#001524] hover:text-[#ff7d00] transition-colors disabled:opacity-50"
                                                        >
                                                            {duplicatingId === project.id ? (
                                                                <Loader2 size={14} className="animate-spin text-[#ff7d00]" />
                                                            ) : (
                                                                <Copy size={14} className="text-[#ff7d00]" />
                                                            )}
                                                            <span>Duplicate Project</span>
                                                        </button>

                                                        <div className="my-1 border-t border-[#15616d]/40" />

                                                        <button
                                                            onClick={() => {
                                                                setProjectToDelete(project);
                                                                setDeleteError("");
                                                                setActiveMenu(null);
                                                            }}
                                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#ee9679] hover:bg-[#78290f]/30 hover:text-[#f7cbbc] transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                            <span>Delete Project</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Project Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-2xl border-2 border-[#15616d]/70 bg-[#000c15] p-6 shadow-2xl text-white">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-[#15616d]/40">
                            <div>
                                <h2 className="text-lg font-extrabold text-white">
                                    Create New Resume Project
                                </h2>
                                <p className="text-xs text-[#bfecf3] mt-0.5">
                                    Give your resume workspace a descriptive title and purpose.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="rounded-lg p-1.5 text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Project Form */}
                        <form onSubmit={handleCreateProject} className="mt-5 space-y-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#ffecd1]">
                                    Project Title <span className="text-[#ff7d00]">*</span>
                                </label>

                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(event) => setNewTitle(event.target.value)}
                                    placeholder="e.g. Senior Backend Engineer Resume"
                                    autoFocus
                                    maxLength={200}
                                    className="w-full rounded-xl border border-[#15616d] bg-[#000407] px-4 py-2.5 text-sm text-[#ffecd1] placeholder-[#7ed9e7]/50 outline-none focus:border-[#ff7d00] focus:ring-2 focus:ring-[#ff7d00]/30 transition-all font-medium"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#ffecd1]">
                                    Description <span className="text-[11px] font-normal normal-case text-[#bfecf3]">(Optional)</span>
                                </label>

                                <textarea
                                    value={newDescription}
                                    onChange={(event) => setNewDescription(event.target.value)}
                                    placeholder="Target role, specific industry, or focus areas..."
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-[#15616d] bg-[#000407] px-4 py-2.5 text-sm text-[#ffecd1] placeholder-[#7ed9e7]/50 outline-none focus:border-[#ff7d00] focus:ring-2 focus:ring-[#ff7d00]/30 transition-all font-medium"
                                />
                            </div>

                            {createError && (
                                <p className="text-xs text-[#ee9679] bg-[#78290f]/30 border border-[#78290f] rounded-lg p-2.5 font-medium">
                                    {createError}
                                </p>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-3 border-t border-[#15616d]/40">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="rounded-xl border border-[#15616d] px-4 py-2 text-xs font-bold text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="rounded-xl bg-[#ff7d00] hover:bg-[#ff9633] px-5 py-2 text-xs font-bold text-[#000407] shadow-md shadow-[#ff7d00]/25 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {creating ? "Creating..." : "Create Project"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit / Rename Modal */}
            {editingProject && editMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-2xl border-2 border-[#15616d]/70 bg-[#000c15] p-6 shadow-2xl text-white">
                        <div className="flex items-center justify-between pb-4 border-b border-[#15616d]/40">
                            <h2 className="text-base font-extrabold text-white">
                                {editMode === "rename" ? "Rename Project" : "Edit Description"}
                            </h2>

                            <button
                                onClick={() => {
                                    setEditingProject(null);
                                    setEditMode(null);
                                }}
                                className="rounded-lg p-1.5 text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleEditProject} className="mt-4 space-y-4">
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#ffecd1]">
                                {editMode === "rename" ? "Project Title" : "Description"}
                            </label>

                            {editMode === "rename" ? (
                                <input
                                    autoFocus
                                    maxLength={200}
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    className="w-full rounded-xl border border-[#15616d] bg-[#000407] px-4 py-2.5 text-sm text-[#ffecd1] placeholder-[#7ed9e7]/50 outline-none focus:border-[#ff7d00] focus:ring-2 focus:ring-[#ff7d00]/30 transition-all font-medium"
                                />
                            ) : (
                                <textarea
                                    autoFocus
                                    rows={4}
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    className="w-full resize-none rounded-xl border border-[#15616d] bg-[#000407] px-4 py-2.5 text-sm text-[#ffecd1] placeholder-[#7ed9e7]/50 outline-none focus:border-[#ff7d00] focus:ring-2 focus:ring-[#ff7d00]/30 transition-all font-medium"
                                />
                            )}

                            {editError && (
                                <p className="text-xs text-[#ee9679] bg-[#78290f]/30 border border-[#78290f] rounded-lg p-2.5 font-medium">
                                    {editError}
                                </p>
                            )}

                            <div className="flex justify-end gap-3 pt-3 border-t border-[#15616d]/40">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingProject(null);
                                        setEditMode(null);
                                    }}
                                    className="rounded-xl border border-[#15616d] px-4 py-2 text-xs font-bold text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={savingEdit}
                                    className="rounded-xl bg-[#ff7d00] hover:bg-[#ff9633] px-5 py-2 text-xs font-bold text-[#000407] shadow-md shadow-[#ff7d00]/25 transition-all disabled:opacity-50"
                                >
                                    {savingEdit ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {projectToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-2xl border-2 border-[#78290f] bg-[#000c15] p-6 shadow-2xl text-white">
                        <div className="flex items-center gap-3 text-[#ee9679] pb-3 border-b border-[#15616d]/40">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#78290f]/30 border border-[#78290f]">
                                <Trash2 size={20} />
                            </div>
                            <h2 className="text-base font-extrabold text-white">
                                Delete Project?
                            </h2>
                        </div>

                        <p className="mt-4 text-xs leading-5 text-[#ffecd1]">
                            Are you sure you want to permanently delete{" "}
                            <strong className="text-white font-bold">{projectToDelete.title}</strong>?
                            This will erase the project source, LaTeX file, and compiled PDF. This action cannot be undone.
                        </p>

                        {deleteError && (
                            <p className="mt-3 text-xs text-[#ee9679] bg-[#78290f]/30 border border-[#78290f] rounded-lg p-2.5 font-medium">
                                {deleteError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-[#15616d]/40">
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => setProjectToDelete(null)}
                                className="rounded-xl border border-[#15616d] px-4 py-2 text-xs font-bold text-[#bfecf3] hover:bg-[#001524] hover:text-white transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                disabled={deleting}
                                onClick={handleDeleteProject}
                                className="rounded-xl bg-[#b93f17] hover:bg-[#e66235] px-5 py-2 text-xs font-bold text-white shadow-md shadow-[#b93f17]/25 transition-all disabled:opacity-50"
                            >
                                {deleting ? "Deleting..." : "Delete Permanently"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
