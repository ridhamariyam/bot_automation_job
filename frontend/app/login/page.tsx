"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid credentials");
      localStorage.setItem("token", data.token);
      localStorage.setItem("jobrocket_user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (showForgot) return <ForgotPassword onBack={() => setShowForgot(false)} />;

  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      <nav className="flex-none border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="text-base font-bold tracking-tight">
            <span className="text-indigo-400">Job</span>Rocket
            <span className="text-white/40 font-normal">.ai</span>
          </Link>
          <p className="text-sm text-white/40">
            No account?{" "}
            <Link href="/register" className="text-indigo-400 hover:text-indigo-300 transition font-medium">
              Sign up free
            </Link>
          </p>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-indigo-600/15 rounded-full blur-[100px]" />
        </div>

        <div className="relative w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
            <p className="text-sm text-white/40">Log in to your JobRocket account</p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 focus:bg-white/[0.07] transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-white/50">Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition"
                >
                  Forgot?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 focus:bg-white/[0.07] transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-900/30 text-sm mt-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
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

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to send reset email");
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

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

        <div className="relative w-full max-w-sm">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-5 text-2xl">
                ✉️
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Check your inbox</h1>
              <p className="text-sm text-white/40 mb-6">
                We sent a password reset link to <span className="text-white/70">{email}</span>
              </p>
              <button
                onClick={onBack}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition"
              >
                ← Back to login
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-1">Reset password</h1>
                <p className="text-sm text-white/40">We&apos;ll send a reset link to your email</p>
              </div>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 focus:bg-white/[0.07] transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-900/30 text-sm"
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <button
                onClick={onBack}
                className="mt-5 w-full text-center text-sm text-white/30 hover:text-white/60 transition"
              >
                ← Back to login
              </button>
            </>
          )}
        </div>
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
