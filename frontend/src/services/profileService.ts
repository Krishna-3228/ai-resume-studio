import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

export interface ProfileSection {
  section: string;
  content: string;
}

export const profileService = {
  async getSections(): Promise<string[]> {
    const response = await api.get("/profile");
    return response.data.sections;
  },

  async getSection(section: string): Promise<ProfileSection> {
    const response = await api.get(`/profile/${section}`);
    return response.data;
  },

  async saveSection(section: string, content: string): Promise<void> {
    await api.put(`/profile/${section}`, { content });
  },
};