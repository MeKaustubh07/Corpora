import { API, authHeaders } from "./api";

export type SseEvent =
  | { event: "stage"; data: { name: string } }
  | { event: "token"; data: { content: string } }
  | { event: "retry"; data: Record<string, never> }
  | { event: "citations"; data: { items: import("./api").Citation[] } }
  | { event: "done"; data: { message_id: string } };

/** POST + parse the SSE response (EventSource only supports GET). */
export async function* streamMessage(
  chatId: string,
  content: string,
  signal?: AbortSignal
): AsyncGenerator<SseEvent> {
  const res = await fetch(`${API}/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) yield { event, data: JSON.parse(data) } as SseEvent;
    }
  }
}
