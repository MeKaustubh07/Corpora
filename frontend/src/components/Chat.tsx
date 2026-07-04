"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ChatMessage, type Citation } from "@/lib/api";
import { streamMessage } from "@/lib/sse";

type Draft = { content: string; stage: string; citations: Citation[] };

const STAGE_LABEL: Record<string, string> = {
  planner: "Planning queries",
  retrieve: "Searching knowledge",
  rerank: "Ranking sources",
  answer: "Writing answer",
  "answer (retry)": "Revising answer",
  verify: "Checking grounding",
};

export function Chat({ collectionId }: { collectionId: string }) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    if (inputRef.current) inputRef.current.style.height = "auto";
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
      setMessages(await api.listMessages(chatId));
    } catch (e) {
      setError(String(e));
    } finally {
      setDraft(null);
      setBusy(false);
    }
  };

  const empty = messages.length === 0 && !draft;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {empty && (
            <div className="mt-24 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-800 text-lg font-semibold">
                C
              </div>
              <h2 className="mt-4 text-xl font-semibold text-neutral-200">
                Ask anything about this collection
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Answers cite their sources. Upload documents in the left panel first.
              </p>
            </div>
          )}
          <div className="space-y-6">
            {messages.map((m) => (
              <MessageRow key={m.id} msg={m} />
            ))}
            {draft && <DraftRow draft={draft} />}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-5">
        {error && (
          <p className="mb-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-neutral-700/80 bg-neutral-900 p-2 shadow-lg focus-within:border-neutral-500">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about this collection…"
            disabled={!chatId}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-neutral-500 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={busy || !chatId || !input.trim()}
            aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black transition hover:bg-neutral-300 disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-neutral-600">
          Answers are generated from your documents and cite sources inline.
        </p>
      </div>
    </div>
  );
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-neutral-800 px-4 py-2.5 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }
  return <AssistantBubble content={msg.content} citations={msg.citations} />;
}

function DraftRow({ draft }: { draft: Draft }) {
  return (
    <div className="flex gap-3">
      <Avatar pulse />
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {STAGE_LABEL[draft.stage] ?? draft.stage}
        </p>
        {draft.content && <Markdown content={draft.content} />}
      </div>
    </div>
  );
}

function AssistantBubble({ content, citations }: { content: string; citations: Citation[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const cited = citations.filter((c) => content.includes(`[${c.n}]`));
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1">
        <Markdown content={content} />
        {cited.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {cited.map((c) => (
              <button
                key={c.n}
                onClick={() => setOpen(open === c.n ? null : c.n)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  open === c.n
                    ? "border-neutral-500 bg-neutral-800 text-neutral-200"
                    : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-600"
                }`}
              >
                <span className="font-mono">[{c.n}]</span> {c.document_name}
              </button>
            ))}
          </div>
        )}
        {open !== null && (
          <blockquote className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs leading-relaxed text-neutral-400">
            {citations.find((c) => c.n === open)?.text}
          </blockquote>
        )}
      </div>
    </div>
  );
}

function Avatar({ pulse = false }: { pulse?: boolean }) {
  return (
    <div
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-xs font-semibold text-neutral-300 ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      C
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-invert max-w-none text-sm leading-relaxed text-neutral-200 [&_a]:underline [&_code]:rounded [&_code]:bg-neutral-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-neutral-800 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-neutral-800 [&_th]:bg-neutral-900 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
