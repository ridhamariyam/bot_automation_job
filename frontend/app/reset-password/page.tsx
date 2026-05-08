"use client";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Eye, EyeOff } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || "Reset failed");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {done ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold text-slate-900 mb-2">Password updated</h2>
          <p className="text-[13px] text-slate-500">Redirecting you to sign in…</p>
        </div>
      ) : (
        <>
          <div className="mb-7">
            <h1 className="text-[22px] font-semibold text-slate-900 mb-1">Set new password</h1>
            <p className="text-[13.5px] text-slate-500">Choose a strong password for your account.</p>
          </div>

          {!token && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-100 text-[13px] text-amber-700">
              Invalid or missing reset link. Please request a new one.
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-[13px] text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">New password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={!token}
                  placeholder="Min. 8 characters"
                  className="w-full h-10 px-3 pr-10 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full h-10 rounded-lg text-[13.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>

          <p className="text-center text-[13px] text-slate-500 mt-6">
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium transition">
              ← Back to sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-100 px-5 h-14 flex items-center">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={13} className="text-white" fill="white" />
          </div>
          <span className="text-[15px] font-semibold text-slate-900">JobRocket</span>
        </Link>
      </nav>
      <div className="flex-1 flex items-center justify-center px-5 py-12">
        <Suspense fallback={<div className="skeleton w-64 h-48" />}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
