"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Doc } from "@/lib/api";

const STATUS: Record<Doc["status"], { dot: string; label: string }> = {
  pending: { dot: "bg-amber-400", label: "queued" },
  processing: { dot: "bg-sky-400 animate-pulse", label: "processing" },
  ready: { dot: "bg-emerald-400", label: "" },
  failed: { dot: "bg-red-400", label: "failed" },
};

const TYPE_ICON: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  md: "📝",
  txt: "📃",
  url: "🔗",
  image: "🖼️",
};

export function DocumentsPanel({ collectionId }: { collectionId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    () =>
      api
        .listDocuments(collectionId)
        .then(setDocs)
        .catch((e) => setError(String(e))),
    [collectionId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!docs.some((d) => d.status === "pending" || d.status === "processing")) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [docs, refresh]);

  const upload = async (files: FileList | null) => {
    if (!files) return;
    setError("");
    for (const file of Array.from(files)) {
      try {
        await api.uploadDocument(collectionId, file);
      } catch (e) {
        setError(String(e));
      }
    }
    refresh();
  };

  const addUrl = async () => {
    if (!url.trim()) return;
    setError("");
    try {
      await api.ingestUrl(collectionId, url.trim());
      setUrl("");
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Knowledge
        </h3>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-5 text-center transition ${
          dragging
            ? "border-neutral-400 bg-neutral-800/60"
            : "border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-neutral-400">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xs font-medium text-neutral-300">Upload files</span>
        <span className="text-[10px] text-neutral-500">pdf · docx · md · txt · images</span>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.md,.txt,.png,.jpg,.jpeg,.webp"
          onChange={(e) => upload(e.target.files)}
        />
      </button>

      <div className="flex gap-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addUrl()}
          placeholder="Paste a URL…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs outline-none placeholder:text-neutral-600 focus:border-neutral-600"
        />
        <button
          onClick={addUrl}
          className="rounded-lg border border-neutral-800 px-2.5 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Add
        </button>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <ul className="-mx-1 flex-1 space-y-0.5 overflow-y-auto">
        {docs.map((d) => {
          const s = STATUS[d.status];
          return (
            <li
              key={d.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-neutral-900"
            >
              <span className="text-xs">{TYPE_ICON[d.source_type] ?? "📄"}</span>
              <span className="flex-1 truncate text-neutral-300" title={d.error || d.name}>
                {d.name}
              </span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
              <span className="w-14 shrink-0 text-right text-[10px] text-neutral-600">
                {d.status === "ready" ? `${d.chunk_count} chunks` : s.label}
              </span>
              <button
                onClick={() => api.deleteDocument(collectionId, d.id).then(refresh)}
                aria-label={`Delete ${d.name}`}
                className="hidden shrink-0 text-neutral-600 hover:text-red-400 group-hover:block"
              >
                ✕
              </button>
            </li>
          );
        })}
        {docs.length === 0 && (
          <li className="px-2 py-4 text-center text-[11px] text-neutral-600">
            No documents yet — upload to start.
          </li>
        )}
      </ul>
    </div>
  );
}
