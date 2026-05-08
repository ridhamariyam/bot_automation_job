"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || "Invalid credentials");
      localStorage.setItem("token", data.token);
      localStorage.setItem("jobrocket_user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await fetch(`${API}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSent(true);
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-100 px-5 h-14 flex items-center">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={13} className="text-white" fill="white" />
          </div>
          <span className="text-[15px] font-semibold text-slate-900">JobRocket</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">

          {!forgotMode ? (
            <>
              <div className="mb-7">
                <h1 className="text-[22px] font-semibold text-slate-900 mb-1">Welcome back</h1>
                <p className="text-[13.5px] text-slate-500">Sign in to your JobRocket account</p>
              </div>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-[13px] text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full h-10 px-3 pr-10 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-[12px] text-indigo-600 hover:text-indigo-700 transition"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 rounded-lg text-[13.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="text-center text-[13px] text-slate-500 mt-6">
                No account?{" "}
                <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium transition">
                  Create one free
                </Link>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => { setForgotMode(false); setForgotSent(false); }}
                className="text-[12px] text-slate-500 hover:text-slate-700 mb-6 flex items-center gap-1 transition"
              >
                ← Back to sign in
              </button>

              {forgotSent ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h2 className="text-[16px] font-semibold text-slate-900 mb-2">Check your email</h2>
                  <p className="text-[13px] text-slate-500 leading-relaxed">
                    If <strong>{forgotEmail}</strong> is registered, a reset link has been sent. Check your inbox.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-7">
                    <h1 className="text-[22px] font-semibold text-slate-900 mb-1">Reset password</h1>
                    <p className="text-[13.5px] text-slate-500">Enter your email and we will send a reset link.</p>
                  </div>
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full h-10 rounded-lg text-[13.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {forgotLoading ? "Sending…" : "Send reset link"}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
