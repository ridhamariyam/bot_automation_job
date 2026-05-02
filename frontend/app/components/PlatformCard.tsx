"use client";

import { useState } from "react";

export type PlatformStatus = "ready" | "idle" | "coming_soon" | "verify_pending";

interface Props {
  id: string;
  name: string;
  tagline: string;
  abbr: string;
  brandColor: string;
  status: PlatformStatus;
  email?: string;
  onConnect: (id: string, email: string, password: string) => Promise<void>;
  onRetryVerify?: (id: string, email: string, password: string) => Promise<void>;
}

function PlatformIcon({ id, abbr }: { id: string; abbr: string }) {
  if (id === "linkedin")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    );

  if (id === "indeed")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M7.116 10.478C6.12 10.478 5.4 9.77 5.4 8.754c0-1.017.72-1.724 1.716-1.724.996 0 1.716.707 1.716 1.724 0 1.016-.72 1.724-1.716 1.724zM5.64 19.8V11.7H8.6V19.8H5.64zM10.06 11.7h2.88v1.1h.04c.4-.76 1.38-1.32 2.72-1.32 2.9 0 3.44 1.9 3.44 4.38V19.8h-2.96v-3.36c0-1.06 0-2.44-1.48-2.44s-1.72 1.56-1.72 2.36V19.8H10.06V11.7z" />
      </svg>
    );

  if (id === "bayt")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M12 3L4 9v12h5v-7h6v7h5V9L12 3zm0 2.5L19 11v8h-3v-7H8v7H5v-8l7-5.5z" />
      </svg>
    );

  if (id === "gmail")
    return (
      <svg width="20" height="15" viewBox="0 0 48 36" fill="white" aria-hidden="true">
        <path d="M0 4.5v27C0 33.99 2.01 36 4.5 36H9V18.75L24 30l15-11.25V36h4.5c2.49 0 4.5-2.01 4.5-4.5v-27c0-1.06-.37-2.04-.98-2.82L24 18 .98 1.68C.37 2.46 0 3.44 0 4.5zM0 4.5" />
      </svg>
    );

  if (id === "glassdoor")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 3c3.859 0 7 3.141 7 7H5c0-3.859 3.141-7 7-7zm7 9c0 3.859-3.141 7-7 7s-7-3.141-7-7h14z" />
      </svg>
    );

  if (id === "google_jobs")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
    );

  return <span className="text-[13px] font-bold text-white">{abbr}</span>;
}

export function PlatformCard({
  id,
  name,
  tagline,
  abbr,
  brandColor,
  status,
  email: initialEmail,
  onConnect,
  onRetryVerify,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [credEmail, setCredEmail] = useState(initialEmail || "");
  const [credPassword, setCredPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!credEmail || !credPassword) return;
    setLoading(true);
    setErr("");
    try {
      await onConnect(id, credEmail, credPassword);
      setShowForm(false);
      setCredEmail("");
      setCredPassword("");
    } catch (ex: unknown) {
      // Check if this is a "credentials saved but verify pending" error
      const msg = ex instanceof Error ? ex.message : "Connection failed";
      if (msg.includes("Credentials saved") || msg.includes("manual verification")) {
        setErr(msg);
        // Don't clear the form — keep credentials for retry
      } else {
        setErr(msg);
        // For other errors, clear form as it's a real issue
        if (!msg.includes("saved")) {
          setCredEmail("");
          setCredPassword("");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(e: React.FormEvent) {
    e.preventDefault();
    if (!credEmail || !credPassword) return;
    setLoading(true);
    setErr("");
    try {
      if (onRetryVerify) {
        await onRetryVerify(id, credEmail, credPassword);
      } else {
        await onConnect(id, credEmail, credPassword);
      }
      setShowForm(false);
      setCredEmail("");
      setCredPassword("");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Retry failed");
    } finally {
      setLoading(false);
    }
  }

  const isReady = status === "ready";
  const isPending = status === "verify_pending";

  return (
    <div
      className={[
        "group relative rounded-2xl px-5 py-4",
        "transition-all duration-200",
        isReady
          ? "bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-emerald-100"
          : isPending
          ? "bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-blue-100"
          : status === "coming_soon"
          ? "bg-[#F8F5F0] shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
          : "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Top row: icon + name + action */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Brand logo */}
        <div
          className={[
            "w-[40px] h-[40px] sm:w-[46px] sm:h-[46px] rounded-[11px] sm:rounded-[13px] flex items-center justify-center shrink-0",
            "shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
            status === "coming_soon" ? "opacity-40 grayscale" : "",
          ].join(" ")}
          style={{ backgroundColor: brandColor }}
        >
          <PlatformIcon id={id} abbr={abbr} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className={[
              "text-[13px] sm:text-[14px] font-semibold tracking-tight leading-snug",
              status === "coming_soon" ? "text-[#A89F97]" : "text-[#1A1714]",
            ].join(" ")}
          >
            {name}
          </p>
          <p className="text-[11px] sm:text-[12px] text-[#A89F97] mt-0.5 truncate leading-relaxed">
            {tagline}
          </p>
        </div>

        {/* Status / CTA */}
        <div className="shrink-0">
          {status === "coming_soon" && (
            <span className="text-[9px] sm:text-[10px] font-semibold text-[#C0B8AF] bg-[#EDE8E0] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full tracking-widest uppercase">
              Soon
            </span>
          )}

          {isReady && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
              <span className="text-[12px] sm:text-[13px] font-semibold text-emerald-700">Ready</span>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
              <span className="text-[12px] sm:text-[13px] font-semibold text-blue-700">Verify</span>
            </div>
          )}

          {status === "idle" && !showForm && (
            <button
              type="button"
              onClick={() => { setShowForm(true); setErr(""); }}
              className="flex items-center gap-1.5 text-[12px] sm:text-[13px] font-semibold text-white
                px-3 sm:px-4 py-2 rounded-full
                active:scale-95 transition-all duration-150
                shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}CC 100%)` }}
            >
              Connect
            </button>
          )}

          {status === "idle" && showForm && (
            <button
              type="button"
              onClick={() => { setShowForm(false); setErr(""); }}
              className="text-[11px] sm:text-[12px] text-[#A89F97] hover:text-[#1A1714] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Manual verification pending message */}
      {isPending && !showForm && (
        <div className="mt-4 pt-3 border-t border-blue-100">
          <div className="bg-blue-50 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed">
            <p className="font-semibold text-blue-800 mb-1">Manual verification needed</p>
            <p className="text-blue-700 text-[11px] mb-3 leading-relaxed">
              Your credentials are saved. Log in once on {name} in your browser to complete verification, then click Retry.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2 transition-colors"
            >
              Show form to retry →
            </button>
          </div>
        </div>
      )}

      {/* Inline credential form */}
      {status === "idle" && showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="h-px bg-[#F0EBE4]" />

          <div className="space-y-2.5">
            <input
              type="email"
              value={credEmail}
              onChange={e => setCredEmail(e.target.value)}
              required
              autoFocus
              placeholder={`${name} email`}
              className="w-full border border-[#EDE9E3] rounded-lg px-3 py-2.5 text-[13px]
                outline-none focus:border-[#1C1917] focus:shadow-[0_0_0_3px_rgba(28,25,23,0.07)]
                bg-[#FAFAF8] placeholder:text-[#C4BDB5] transition-all duration-150"
            />
            <input
              type="password"
              value={credPassword}
              onChange={e => setCredPassword(e.target.value)}
              required
              placeholder="Password"
              className="w-full border border-[#EDE9E3] rounded-lg px-3 py-2.5 text-[13px]
                outline-none focus:border-[#1C1917] focus:shadow-[0_0_0_3px_rgba(28,25,23,0.07)]
                bg-[#FAFAF8] placeholder:text-[#C4BDB5] transition-all duration-150"
            />
          </div>

          {err && (
            <div className={[
              "rounded-lg px-3 py-2 text-[12px] leading-snug",
              err.includes("manual") || err.includes("Credentials saved")
                ? "bg-blue-50 border border-blue-200 text-blue-700"
                : "bg-rose-50 border border-rose-200 text-rose-600"
            ].join(" ")}>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !credEmail || !credPassword}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white
              disabled:opacity-50 active:scale-[0.98] transition-all duration-150"
            style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}CC 100%)` }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying…
              </span>
            ) : (
              "Save & Connect"
            )}
          </button>
        </form>
      )}

      {/* Retry form for verify_pending state */}
      {isPending && showForm && (
        <form onSubmit={handleRetry} className="mt-4 space-y-3">
          <div className="h-px bg-[#F0EBE4]" />

          {err && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[12px] text-rose-600 leading-snug">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white
              disabled:opacity-50 active:scale-[0.98] transition-all duration-150"
            style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}CC 100%)` }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Retrying…
              </span>
            ) : (
              "Retry Verification"
            )}
          </button>

          <button
            type="button"
            onClick={() => { setShowForm(false); setErr(""); }}
            className="w-full py-2 rounded-lg text-[13px] font-semibold text-[#7C736C]
              border border-[#DDD7CF] hover:bg-[#F5EFE8] transition-all duration-150"
          >
            Later
          </button>
        </form>
      )}
    </div>
  );
}
