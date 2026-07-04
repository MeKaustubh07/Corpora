"use client";

import { useEffect, useState } from "react";
import { API, authHeaders } from "@/lib/api";

type ImageHit = { score: number; document_id: string; document_name: string };

export function ImageSearch({ collectionId }: { collectionId: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ImageHit[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  // revoke object URLs on unmount / new search
  useEffect(() => {
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [urls]);

  const search = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `${API}/collections/${collectionId}/images/search?q=${encodeURIComponent(q.trim())}`,
        { headers }
      );
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json();
      const found: ImageHit[] = data.hits;
      setHits(found);
      setSearched(true);
      // images need auth headers — fetch blobs, render via object URLs
      const entries = await Promise.all(
        found.map(async (h) => {
          const r = await fetch(
            `${API}/collections/${collectionId}/documents/${h.document_id}/file`,
            { headers }
          );
          return [h.document_id, r.ok ? URL.createObjectURL(await r.blob()) : ""] as const;
        })
      );
      setUrls(Object.fromEntries(entries.filter(([, u]) => u)));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-5">
      <div className="flex items-end gap-2 rounded-2xl border border-neutral-700/80 bg-neutral-900 p-2 focus-within:border-neutral-500">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Describe an image… e.g. 'architecture diagram', 'red logo'"
          className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-neutral-500"
        />
        <button
          onClick={search}
          disabled={busy || !q.trim()}
          className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black transition hover:bg-neutral-300 disabled:bg-neutral-700 disabled:text-neutral-400"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-neutral-600">
        CLIP text-to-image search over this collection&apos;s uploaded images.
      </p>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-5 grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {hits.map((h) => (
          <figure
            key={h.document_id}
            className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 transition hover:border-neutral-600"
          >
            {urls[h.document_id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob object URL
              <img
                src={urls[h.document_id]}
                alt={h.document_name}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="aspect-square w-full animate-pulse bg-neutral-900" />
            )}
            <figcaption className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
              <span className="truncate text-[11px] text-neutral-400">{h.document_name}</span>
              <span className="shrink-0 font-mono text-[10px] text-neutral-600">
                {h.score.toFixed(2)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {searched && hits.length === 0 && !busy && (
        <p className="pb-6 text-center text-sm text-neutral-600">
          No matching images in this collection.
        </p>
      )}
    </div>
  );
}
