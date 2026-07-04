export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;

/** Registered once by AuthBridge so every request carries the Clerk JWT. */
export function setTokenGetter(fn: TokenGetter) {
  tokenGetter = fn;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = tokenGetter ? await tokenGetter() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Collection = {
  id: string;
  name: string;
  description: string;
  created_at: string;
};

export type Doc = {
  id: string;
  name: string;
  source_type: string;
  status: "pending" | "processing" | "ready" | "failed";
  error: string;
  chunk_count: number;
  created_at: string;
};

export type Citation = {
  n: number;
  document_id: string;
  document_name: string;
  chunk_index: number;
  text: string;
  score: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};

export type Chat = { id: string; collection_id: string; title: string };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeaders()), ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  listCollections: () => req<Collection[]>("/collections"),
  createCollection: (name: string, description = "") =>
    req<Collection>("/collections", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
  deleteCollection: (id: string) => req<void>(`/collections/${id}`, { method: "DELETE" }),

  listDocuments: (cid: string) => req<Doc[]>(`/collections/${cid}/documents`),
  deleteDocument: (cid: string, did: string) =>
    req<void>(`/collections/${cid}/documents/${did}`, { method: "DELETE" }),
  ingestUrl: (cid: string, url: string) =>
    req<Doc>(`/collections/${cid}/urls`, { method: "POST", body: JSON.stringify({ url }) }),
  uploadDocument: async (cid: string, file: File): Promise<Doc> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/collections/${cid}/documents`, {
      method: "POST",
      headers: await authHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },

  listChats: () => req<Chat[]>("/chats"),
  createChat: (collection_id: string, title = "New chat") =>
    req<Chat>("/chats", { method: "POST", body: JSON.stringify({ collection_id, title }) }),
  listMessages: (chatId: string) => req<ChatMessage[]>(`/chats/${chatId}/messages`),
};
