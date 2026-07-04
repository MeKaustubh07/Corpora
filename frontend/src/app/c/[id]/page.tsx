"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Chat } from "@/components/Chat";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { ImageSearch } from "@/components/ImageSearch";
import { RequireAuth } from "@/components/RequireAuth";

export default function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAuth>
      <Workspace id={id} />
    </RequireAuth>
  );
}

function Workspace({ id }: { id: string }) {
  const [tab, setTab] = useState<"chat" | "images">("chat");
  const [name, setName] = useState("");

  useEffect(() => {
    api
      .listCollections()
      .then((cs) => setName(cs.find((c) => c.id === id)?.name ?? ""))
      .catch(() => {});
  }, [id]);

  return (
    <div className="flex h-[calc(100vh-53px)]">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40 p-3 md:flex">
        <Link
          href="/"
          className="mb-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-200"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All collections
        </Link>
        <div className="min-h-0 flex-1">
          <DocumentsPanel collectionId={id} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
          <h1 className="truncate text-sm font-medium text-neutral-200">{name || "…"}</h1>
          <nav className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
            {(["chat", "images"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 capitalize transition ${
                  tab === t
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t === "images" ? "Image search" : "Chat"}
              </button>
            ))}
          </nav>
        </div>
        <div className="min-h-0 flex-1">
          {tab === "chat" ? <Chat collectionId={id} /> : <ImageSearch collectionId={id} />}
        </div>
      </section>
    </div>
  );
}
