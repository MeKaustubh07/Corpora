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
    <div className="flex h-full flex-col">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Describe an image… e.g. 'diagram with arrows', 'sunset photo'"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          onClick={search}
          disabled={busy}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {busy ? "…" : "Search"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 grid flex-1 grid-cols-3 gap-3 overflow-y-auto content-start">
        {hits.map((h) => (
          <figure key={h.document_id} className="rounded-lg border border-neutral-800 p-2">
            {urls[h.document_id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob object URL
              <img
                src={urls[h.document_id]}
                alt={h.document_name}
                className="aspect-square w-full rounded object-cover"
              />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded bg-neutral-900" />
            )}
            <figcaption className="mt-1 truncate text-xs text-neutral-400">
              {h.document_name}{" "}
              <span className="text-neutral-600">{h.score.toFixed(2)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {searched && hits.length === 0 && !busy && (
        <p className="text-sm text-neutral-500">No matching images in this collection.</p>
      )}
    </div>
  );
}
