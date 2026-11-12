import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const projectService = {
  async getProjects(): Promise<Project[]> {
    const response = await api.get("/projects");
    return response.data;
  },

  async getProject(projectId: string): Promise<Project> {
    const response = await api.get(`/projects/${projectId}`);
    return response.data;
  },

  async createProject(
    title: string,
    description?: string,
  ): Promise<Project> {
    const response = await api.post("/projects", {
      title,
      description,
    });

    return response.data;
  },
  
  async updateProject(
    projectId: string,
    data: {
        title?: string;
        description?: string | null;
    },
    ): Promise<Project> {
    const response = await api.patch(`/projects/${projectId}`, data);
    return response.data;
  },

  async deleteProject(projectId: string): Promise<void> {
    await api.delete(`/projects/${projectId}`);
  },
};