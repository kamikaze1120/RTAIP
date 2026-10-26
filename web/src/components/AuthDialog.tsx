"use client";

import { Loader2, Mail, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { buttonClass } from "./ui";

export function AuthDialog() {
  const { dialogOpen, closeSignIn, requestAccess, verifyCode, user } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dialogOpen) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSignIn();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, step, closeSignIn]);

  if (!dialogOpen || user) return null;

  const close = () => {
    closeSignIn();
    setStep("email");
    setCode("");
    setError(null);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestAccess(email);
    setBusy(false);
    if (res.ok) setStep("code");
    else setError(res.error);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await verifyCode(email, code);
    setBusy(false);
    if (res.ok) close();
    else setError(res.error);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-title" className="text-lg font-semibold">{step === "email" ? "Continue with your email" : "Check your inbox"}</h2>
            <p className="mt-1 text-sm text-dim">
              {step === "email"
                ? "No password and no account form. We email you a one time link. Your private workspace is created the first time you use an address."
                : `We sent a sign in link to ${email}. Open it on this device, or type the code from the same email.`}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-dim hover:bg-panel2 hover:text-ink">
            <X size={16} />
          </button>
        </div>

        {step === "email" ? (
          <form onSubmit={send} className="mt-5 space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wider text-dim" htmlFor="auth-email">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                id="auth-email"
                ref={input}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-line bg-bg py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-faint focus:border-accent"
              />
            </div>
            {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
            <button type="submit" disabled={busy || !email.trim()} className={`${buttonClass("primary")} w-full justify-center`}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Email me a link
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wider text-dim" htmlFor="auth-code">Code from the email</label>
            <input
              id="auth-code"
              ref={input}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none placeholder:text-faint focus:border-accent"
            />
            {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
            <button type="submit" disabled={busy || code.replace(/\s+/g, "").length < 6} className={`${buttonClass("primary")} w-full justify-center`}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Sign in
            </button>
            <button type="button" onClick={() => { setStep("email"); setError(null); }} className="w-full text-center text-xs text-dim hover:text-ink">
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
