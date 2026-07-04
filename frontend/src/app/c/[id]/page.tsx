"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ImageSearch } from "@/components/ImageSearch";
import { Chat } from "@/components/Chat";
import { DocumentsPanel } from "@/components/DocumentsPanel";
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
  return (
    <main className="mx-auto flex h-[calc(100vh-53px)] max-w-6xl flex-col px-6 py-6">
      <div className="mb-4 flex items-baseline gap-4">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← collections
        </Link>
        <nav className="flex gap-1 text-sm">
          {(["chat", "images"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 capitalize ${
                tab === t ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t === "images" ? "image search" : t}
            </button>
          ))}
        </nav>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-6">
        <aside className="min-h-0 rounded-lg border border-neutral-800 p-3">
          <DocumentsPanel collectionId={id} />
        </aside>
        <section className="min-h-0">
          {tab === "chat" ? <Chat collectionId={id} /> : <ImageSearch collectionId={id} />}
        </section>
      </div>
    </main>
  );
}
