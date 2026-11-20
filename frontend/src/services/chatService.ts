import axios from "axios";

const api = axios.create({
    baseURL: "/api",
});

export interface ChatStatus {
    configured: boolean;
    provider: string | null;
    model: string | null;
    message: string;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolsUsed?: string[];
    isStreaming?: boolean;
}

export const chatService = {
    async getStatus(): Promise<ChatStatus> {
        const response = await api.get("/chat/status");
        return response.data;
    },

    async getHistory(projectId: string): Promise<ChatMessage[]> {
        const response = await api.get(`/projects/${projectId}/chat/history`);
        return (response.data.messages || []).map((m: { role: "user" | "assistant"; content: string }, idx: number) => ({
            id: `history-${idx}`,
            role: m.role,
            content: m.content,
        }));
    },

    async clearHistory(projectId: string): Promise<void> {
        await api.delete(`/projects/${projectId}/chat/history`);
    },
};

export async function streamChat(
    projectId: string,
    message: string,
    onChunk: (chunk: string) => void,
    onToolStart: (toolName: string) => void,
    onToolEnd: (toolName: string) => void,
    onDone: (fullReply: string) => void,
    onError: (errorMsg: string) => void
): Promise<void> {
    const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Request failed with status ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body available");

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let completed = false;

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(trimmed.slice(6));
                        if (data.type === "chunk") {
                            onChunk(data.content);
                        } else if (data.type === "tool_start") {
                            onToolStart(data.tool);
                        } else if (data.type === "tool_end") {
                            onToolEnd(data.tool);
                        } else if (data.type === "done") {
                            completed = true;
                            onDone(data.reply);
                        } else if (data.type === "error") {
                            completed = true;
                            onError(data.message);
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        }
    } finally {
        if (!completed) {
            onDone("");
        }
    }
}
