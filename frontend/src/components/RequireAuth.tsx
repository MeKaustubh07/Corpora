"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";

/** Gates children behind Clerk sign-in; shows a sign-in card when signed out. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <p className="px-6 py-12 text-sm text-neutral-500">Loading…</p>;
  }
  if (!isSignedIn) {
    return (
      <div className="mx-auto mt-24 max-w-sm rounded-lg border border-neutral-800 p-8 text-center">
        <h2 className="text-lg font-semibold">Sign in to Corpora</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Your collections and chats are private to your account.
        </p>
        <div className="mt-6">
          <SignInButton mode="modal">
            <button className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
