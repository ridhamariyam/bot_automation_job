"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed");
      localStorage.setItem("token", data.token);
      localStorage.setItem("jobrocket_user", JSON.stringify(data.user));
      router.push("/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      <nav className="flex-none border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="text-base font-bold tracking-tight">
            <span className="text-indigo-400">Job</span>Rocket
            <span className="text-white/40 font-normal">.ai</span>
          </Link>
          <p className="text-sm text-white/40">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition font-medium">
              Log in
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
            <h1 className="text-2xl font-bold text-white mb-1">Create your account</h1>
            <p className="text-sm text-white/40">Start applying to jobs on autopilot</p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 focus:bg-white/[0.07] transition"
              />
            </div>
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
              <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Min. 8 characters"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 focus:bg-white/[0.07] transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-900/30 text-sm mt-2"
            >
              {loading ? "Creating account…" : "Create account"}
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
