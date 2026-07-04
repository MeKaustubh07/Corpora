"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { setTokenGetter } from "@/lib/api";

export function Header() {
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  return (
    <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-800 text-xs font-bold">
          C
        </span>
        Corpora
      </Link>
      {isSignedIn ? (
        <UserButton />
      ) : (
        <SignInButton mode="modal">
          <button className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200">
            Sign in
          </button>
        </SignInButton>
      )}
    </header>
  );
}
