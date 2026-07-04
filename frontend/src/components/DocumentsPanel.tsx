"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Doc } from "@/lib/api";

const STATUS_COLOR: Record<Doc["status"], string> = {
  pending: "text-yellow-400",
  processing: "text-blue-400",
  ready: "text-green-400",
  failed: "text-red-400",
};

export function DocumentsPanel({ collectionId }: { collectionId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
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

  // poll while anything is still ingesting
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
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        className="cursor-pointer rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-400 hover:border-neutral-500"
      >
        Drop files or click — pdf, docx, md, txt, images
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.md,.txt,.png,.jpg,.jpeg,.webp"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addUrl()}
          placeholder="or paste a URL…"
          className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
        />
        <button
          onClick={addUrl}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Add
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <ul className="flex-1 space-y-1 overflow-y-auto">
        {docs.map((d) => (
          <li
            key={d.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-900"
          >
            <span className={`text-xs ${STATUS_COLOR[d.status]}`}>●</span>
            <span className="flex-1 truncate" title={d.error || d.name}>
              {d.name}
            </span>
            <span className="text-xs text-neutral-600">
              {d.status === "ready" ? `${d.chunk_count} chunks` : d.status}
            </span>
            <button
              onClick={() => api.deleteDocument(collectionId, d.id).then(refresh)}
              className="hidden text-xs text-neutral-500 hover:text-red-400 group-hover:block"
            >
              ✕
            </button>
          </li>
        ))}
        {docs.length === 0 && (
          <li className="px-2 py-4 text-xs text-neutral-600">No documents yet.</li>
        )}
      </ul>
    </div>
  );
}
