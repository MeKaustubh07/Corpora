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
  const [loading, setLoading] = useState(true);

  const refresh = () =>
    api
      .listCollections()
      .then(setCollections)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

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
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-2xl font-bold">
          C
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Corpora</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
          Turn documents, links, and images into a knowledge base you can talk to —
          every answer cites its sources.
        </p>
      </div>

      <div className="mx-auto mt-10 flex max-w-lg gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Name a new collection…"
          className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-500 focus:border-neutral-500"
        />
        <button
          onClick={create}
          disabled={!name.trim()}
          className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-300 disabled:opacity-40"
        >
          Create
        </button>
      </div>

      {error && <p className="mt-6 text-center text-sm text-red-400">{error}</p>}

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => (
          <div
            key={c.id}
            className="group relative rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-600 hover:bg-neutral-900"
          >
            <Link href={`/c/${c.id}`} className="block">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-sm">
                📚
              </div>
              <h3 className="mt-3 truncate font-medium text-neutral-200">{c.name}</h3>
              <p className="mt-1 text-xs text-neutral-500">
                {new Date(c.created_at).toLocaleDateString()}
              </p>
            </Link>
            <button
              onClick={() => api.deleteCollection(c.id).then(refresh)}
              aria-label={`Delete ${c.name}`}
              className="absolute right-3 top-3 hidden text-xs text-neutral-600 hover:text-red-400 group-hover:block"
            >
              ✕
            </button>
          </div>
        ))}
        {!loading && collections.length === 0 && !error && (
          <p className="col-span-full py-8 text-center text-sm text-neutral-600">
            No collections yet — create your first one above.
          </p>
        )}
      </div>
    </main>
  );
}
