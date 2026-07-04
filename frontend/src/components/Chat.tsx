"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type Citation } from "@/lib/api";
import { streamMessage } from "@/lib/sse";

type Draft = { content: string; stage: string; citations: Citation[] };

export function Chat({ collectionId }: { collectionId: string }) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listChats()
      .then(async (chats) => {
        const existing = chats.find((c) => c.collection_id === collectionId);
        const chat = existing ?? (await api.createChat(collectionId));
        setChatId(chat.id);
        setMessages(await api.listMessages(chat.id));
      })
      .catch((e) => setError(String(e)));
  }, [collectionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draft]);

  const send = async () => {
    const content = input.trim();
    if (!content || !chatId || busy) return;
    setInput("");
    setBusy(true);
    setError("");
    setMessages((m) => [...m, { id: "tmp-user", role: "user", content, citations: [] }]);
    setDraft({ content: "", stage: "planner", citations: [] });
    try {
      for await (const ev of streamMessage(chatId, content)) {
        if (ev.event === "stage") {
          setDraft((d) => d && { ...d, stage: ev.data.name });
        } else if (ev.event === "token") {
          setDraft((d) => d && { ...d, content: d.content + ev.data.content });
        } else if (ev.event === "retry") {
          setDraft((d) => d && { ...d, content: "", stage: "answer (retry)" });
        } else if (ev.event === "citations") {
          setDraft((d) => d && { ...d, citations: ev.data.items });
        }
      }
      const fresh = await api.listMessages(chatId);
      setMessages(fresh);
    } catch (e) {
      setError(String(e));
    } finally {
      setDraft(null);
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {draft && (
          <div className="rounded-lg bg-neutral-900 p-3">
            <p className="mb-1 text-xs text-blue-400">⋯ {draft.stage}</p>
            <p className="whitespace-pre-wrap text-sm">{draft.content}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="py-1 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={busy ? "Thinking…" : "Ask about this collection…"}
          disabled={busy || !chatId}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={busy || !chatId}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [open, setOpen] = useState<number | null>(null);
  if (msg.role === "user") {
    return (
      <div className="ml-12 rounded-lg bg-neutral-800 p-3">
        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
      </div>
    );
  }
  const cited = msg.citations.filter((c) => msg.content.includes(`[${c.n}]`));
  return (
    <div className="mr-6 rounded-lg bg-neutral-900 p-3">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
      {cited.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-neutral-800 pt-2">
          {cited.map((c) => (
            <button
              key={c.n}
              onClick={() => setOpen(open === c.n ? null : c.n)}
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700"
              title={c.document_name}
            >
              [{c.n}] {c.document_name}
            </button>
          ))}
        </div>
      )}
      {open !== null && (
        <blockquote className="mt-2 border-l-2 border-neutral-600 pl-2 text-xs text-neutral-400">
          {msg.citations.find((c) => c.n === open)?.text}
        </blockquote>
      )}
    </div>
  );
}
