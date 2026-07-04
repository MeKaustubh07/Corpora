"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Collection } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";

export default function Home() {
  return (
    <RequireAuth>
      <Collections />
    </RequireAuth>
  );
}

function Collections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const refresh = () =>
    api
      .listCollections()
      .then(setCollections)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    await api.createCollection(name.trim());
    setName("");
    refresh();
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Corpora</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Multimodal agentic RAG — upload knowledge, chat with citations.
      </p>

      <div className="mt-8 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New collection name…"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          onClick={create}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          Create
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <ul className="mt-6 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
        {collections.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3">
            <Link href={`/c/${c.id}`} className="flex-1 hover:underline">
              <span className="font-medium">{c.name}</span>
              {c.description && (
                <span className="ml-2 text-sm text-neutral-500">{c.description}</span>
              )}
            </Link>
            <button
              onClick={() => api.deleteCollection(c.id).then(refresh)}
              className="text-sm text-neutral-500 hover:text-red-400"
            >
              delete
            </button>
          </li>
        ))}
        {collections.length === 0 && !error && (
          <li className="px-4 py-6 text-sm text-neutral-500">
            No collections yet — create one above.
          </li>
        )}
      </ul>
    </main>
  );
}
