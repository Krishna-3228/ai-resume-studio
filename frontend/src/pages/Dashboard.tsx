import { useEffect, useState } from "react";
import { FileText, Loader2, Search, Plus, X, MoreVertical } from "lucide-react";

import {
    projectService,
    type Project,
} from "../services/projectService";

export default function Dashboard() {
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
        } catch {
            setCreateError("Unable to create project. Please try again.");
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

            setEditingProject(null);
            setEditMode(null);
        } catch {
            setEditError("Unable to update project. Please try again.");
        } finally {
            setSavingEdit(false);
        }
    }

    async function handleDeleteProject() {
        if (!projectToDelete) return;

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
        } catch {
            setDeleteError("Unable to delete project. Please try again.");
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold">All projects</h1>
                    <p className="mt-2 text-gray-500">
                        Manage your resume projects.
                    </p>
                </div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                    <Plus size={18} />
                    New Project
                </button>
            </div>

            {/* Search */}
            <div className="mt-8 max-w-xl">
                <div className="flex items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 focus-within:border-indigo-500">
                    <Search size={19} className="text-gray-400" />

                    <input
                        type="text"
                        placeholder="Search in all projects..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="w-full bg-transparent text-sm outline-none"
                    />
                </div>
            </div>

            {/* Project list */}
            <div className="mt-8 overflow-x-auto">
                {loading ? (
                    <div className="flex items-center gap-2 py-8 text-gray-500">
                        <Loader2 size={18} className="animate-spin" />
                        Loading projects...
                    </div>
                ) : error ? (
                    <div className="py-8 text-red-500">{error}</div>
                ) : filteredProjects.length === 0 ? (
                    <div className="py-12 text-center">
                        <FileText size={36} className="mx-auto text-gray-400" />

                        <h2 className="mt-4 font-medium">
                            {search ? "No matching projects" : "No projects yet"}
                        </h2>

                        <p className="mt-2 text-sm text-gray-500">
                            {search
                                ? "Try searching with a different name."
                                : "Create your first resume project to get started."}
                        </p>
                    </div>
                ) : (
                    <table className="w-full min-w-[600px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-gray-300 text-sm text-gray-500">
                                <th className="px-4 py-4 font-medium">Title</th>
                                <th className="px-4 py-4 font-medium">Status</th>
                                <th className="px-4 py-4 font-medium">
                                    Last modified ↓
                                </th>
                                <th className="px-4 py-4 text-right font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredProjects.map((project) => (
                                <tr
                                    key={project.id}
                                    className="border-b border-gray-200 transition hover:bg-gray-100"
                                >
                                    <td className="px-4 py-5">
                                        <div className="flex items-center gap-3">
                                            <FileText
                                                size={19}
                                                className="shrink-0 text-gray-500"
                                            />

                                            <div>
                                                <p className="font-medium text-gray-900">
                                                    {project.title}
                                                </p>

                                                {project.description && (
                                                    <p className="mt-1 text-sm text-gray-500">
                                                        {project.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-4 py-5">
                                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                                            {project.status}
                                        </span>
                                    </td>

                                    <td className="px-4 py-5 text-sm text-gray-500">
                                        {formatDate(project.updated_at)}
                                    </td>
                                    <td className="px-4 py-5 text-right">
                                        <div className="relative inline-block">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setActiveMenu(
                                                        activeMenu === project.id ? null : project.id,
                                                    );
                                                }}
                                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-200"
                                            >
                                                <MoreVertical size={19} />
                                            </button>

                                            {activeMenu === project.id && (
                                                <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg">
                                                    <button
                                                        onClick={() => openEditModal(project, "rename")}
                                                        className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                                                    >
                                                        Rename
                                                    </button>

                                                    <button
                                                        onClick={() => openEditModal(project, "description")}
                                                        className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                                                    >
                                                        Edit description
                                                    </button>

                                                    <div className="my-1 border-t border-gray-100" />

                                                    <button
                                                        onClick={() => {
                                                            setProjectToDelete(project);
                                                            setDeleteError("");
                                                            setActiveMenu(null);
                                                        }}
                                                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                                                    >
                                                        Delete project
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">

                        {/* Modal header */}
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">
                                Create New Project
                            </h2>

                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Project form */}
                        <form onSubmit={handleCreateProject} className="mt-6 space-y-5">

                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Project Title <span className="text-red-500">*</span>
                                </label>

                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(event) => setNewTitle(event.target.value)}
                                    placeholder="e.g. Backend Developer Resume"
                                    autoFocus
                                    maxLength={200}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Description
                                </label>

                                <textarea
                                    value={newDescription}
                                    onChange={(event) => setNewDescription(event.target.value)}
                                    placeholder="Describe the purpose of this resume..."
                                    rows={3}
                                    className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>

                            {createError && (
                                <p className="text-sm text-red-500">
                                    {createError}
                                </p>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {creating ? "Creating..." : "Create Project"}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
            {editingProject && editMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">
                                {editMode === "rename" ? "Rename Project" : "Edit Description"}
                            </h2>

                            <button
                                onClick={() => {
                                    setEditingProject(null);
                                    setEditMode(null);
                                }}
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleEditProject} className="mt-6">
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                {editMode === "rename" ? "Project Title" : "Description"}
                            </label>

                            {editMode === "rename" ? (
                                <input
                                    autoFocus
                                    maxLength={200}
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                                />
                            ) : (
                                <textarea
                                    autoFocus
                                    rows={4}
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                                />
                            )}

                            {editError && (
                                <p className="mt-2 text-sm text-red-500">{editError}</p>
                            )}

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingProject(null);
                                        setEditMode(null);
                                    }}
                                    className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={savingEdit}
                                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {savingEdit ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {projectToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Delete project?
                        </h2>

                        <p className="mt-3 text-sm leading-6 text-gray-600">
                            Are you sure you want to permanently delete{" "}
                            <strong>{projectToDelete.title}</strong>?
                            This will also delete its LaTeX source and generated PDF.
                            This action cannot be undone.
                        </p>

                        {deleteError && (
                            <p className="mt-3 text-sm text-red-500">
                                {deleteError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => setProjectToDelete(null)}
                                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                disabled={deleting}
                                onClick={handleDeleteProject}
                                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {deleting ? "Deleting..." : "Delete permanently"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}