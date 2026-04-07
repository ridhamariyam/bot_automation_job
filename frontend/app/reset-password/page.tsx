"use client";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Reset failed");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative w-full max-w-sm">
      {done ? (
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-5 text-2xl">✓</div>
          <h1 className="text-xl font-bold text-white mb-2">Password updated</h1>
          <p className="text-sm text-white/40">Redirecting you to login…</p>
        </div>
      ) : (
        <>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">New password</h1>
            <p className="text-sm text-white/40">Choose a strong password</p>
          </div>

          {!token && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
              Invalid reset link. Please request a new one.
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
              {error}
              {error.toLowerCase().includes("register") && (
                <div className="mt-3">
                  <Link
                    href="/register"
                    className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
                  >
                    Create an account
                  </Link>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 focus:bg-white/[0.07] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 focus:bg-white/[0.07] transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !token}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-900/30 text-sm"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      <nav className="flex-none border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center">
          <Link href="/" className="text-base font-bold tracking-tight">
            <span className="text-indigo-400">Job</span>Rocket
            <span className="text-white/40 font-normal">.ai</span>
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[250px] bg-indigo-600/15 rounded-full blur-[100px]" />
        </div>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>

      <footer className="flex-none border-t border-white/5 py-4 px-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-white/20">
          <span><span className="text-indigo-400">Job</span>Rocket.ai</span>
          <span>© {new Date().getFullYear()} · Built with AI</span>
        </div>
      </footer>
    </div>
  );
}
