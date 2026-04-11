"use client";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">

      {/* NAV */}
      <nav className="flex-none border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <span className="text-base font-bold tracking-tight">
            <span className="text-indigo-400">Job</span>Rocket

          </span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-white/50 hover:text-white transition">Log in</Link>
            <Link href="/register"
              className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO — fills remaining height */}
      <section className="flex-1 flex items-center justify-center px-5 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-indigo-400 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            AI-powered job application bot
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.08] tracking-tight mb-5">
            Land interviews
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              while you sleep.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto mb-8 leading-relaxed">
            Answer 5 questions, upload your CV. Our bot applies to 50+ matching jobs
            every day — with personalized cover notes for each one.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-10">
            <Link href="/register"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-7 py-3.5 rounded-xl font-semibold text-base transition shadow-lg shadow-indigo-900/40">
              Launch my job bot — free
            </Link>
            <Link href="/login"
              className="text-white/50 hover:text-white text-sm flex items-center gap-2 transition">
              <span className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-[10px]">→</span>
              Already have an account
            </Link>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-px bg-white/5 rounded-xl overflow-hidden max-w-sm mx-auto border border-white/5">
            {[["50+", "Jobs daily"], ["3 min", "Setup time"], ["10×", "More interviews"]].map(([v, l]) => (
              <div key={l} className="bg-[#0a0a0f] py-4 text-center">
                <div className="text-xl font-extrabold text-white">{v}</div>
                <div className="text-[11px] text-white/40 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="flex-none border-t border-white/5 py-4 px-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-white/20">
          <span><span className="text-indigo-400">Job</span>Rocket</span>
          <span>© {new Date().getFullYear()} · Build by Ridha Mariyam | Aiviora | CodeforSuree</span>
        </div>
      </footer>
    </div>
  );
}
