"use client";

import { use } from "react";
import Link from "next/link";
import { Chat } from "@/components/Chat";
import { DocumentsPanel } from "@/components/DocumentsPanel";

export default function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <main className="mx-auto flex h-screen max-w-6xl flex-col px-6 py-6">
      <div className="mb-4 flex items-baseline gap-3">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← collections
        </Link>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-6">
        <aside className="min-h-0 rounded-lg border border-neutral-800 p-3">
          <DocumentsPanel collectionId={id} />
        </aside>
        <section className="min-h-0">
          <Chat collectionId={id} />
        </section>
      </div>
    </main>
  );
}
