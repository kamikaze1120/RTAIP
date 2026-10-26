"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const failure = params.get("error_description");
    if (failure) {
      queueMicrotask(() => setError(failure));
      return;
    }
    if (!code) {
      window.location.replace("/cases");
      return;
    }
    void supabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error: err }) => {
        if (err) setError("This link has expired or was opened on a different device. Request a new one and use the code from the email.");
        else window.location.replace("/cases");
      });
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold">Could not sign you in</h1>
          <p className="mt-2 text-sm text-dim">{error}</p>
          <Link href="/" className="mt-6 inline-block text-sm text-accent hover:underline">Back to the app</Link>
        </>
      ) : (
        <p className="text-sm text-dim">Signing you in</p>
      )}
    </div>
  );
}
