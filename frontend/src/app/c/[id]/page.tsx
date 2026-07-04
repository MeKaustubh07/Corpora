"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { FiChevronLeft, FiFolder, FiX } from "react-icons/fi";
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
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    api
      .listCollections()
      .then((cs) => setName(cs.find((c) => c.id === id)?.name ?? ""))
      .catch(() => {});
  }, [id]);

  return (
    <div className="flex h-[calc(100dvh-49px)]">
      {/* desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40 p-3 md:flex">
        <Link
          href="/"
          className="mb-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-200"
        >
          <FiChevronLeft size={13} />
          All collections
        </Link>
        <div className="min-h-0 flex-1">
          <DocumentsPanel collectionId={id} />
        </div>
      </aside>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close panel"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col border-r border-neutral-800 bg-neutral-950 p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-400"
              >
                <FiChevronLeft size={13} />
                All collections
              </Link>
              <button
                onClick={() => setDrawer(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-900"
              >
                <FiX size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <DocumentsPanel collectionId={id} />
            </div>
          </div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2.5 sm:px-4">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open knowledge panel"
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-neutral-300 md:hidden"
          >
            <FiFolder size={15} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-200">
            {name || "…"}
          </h1>
          <nav className="flex shrink-0 rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
            {(["chat", "images"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1 transition sm:px-3 ${
                  tab === t
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t === "images" ? "Images" : "Chat"}
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
