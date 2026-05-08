"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Zap, FileText, Bot, Users, BarChart2,
  Star, Shield, ArrowRight, Check, ChevronDown,
} from "lucide-react";
import { useState } from "react";

const FEATURES = [
  {
    icon: Bot,
    title: "Automated Applications",
    description: "The bot searches LinkedIn, Indeed, Glassdoor and more — applying only to jobs that match your profile and score threshold.",
  },
  {
    icon: FileText,
    title: "AI Resume Tailoring",
    description: "Every application gets a resume tailored to that specific job description using GPT-4, improving your match score.",
  },
  {
    icon: Star,
    title: "Smart Job Scoring",
    description: "Each job is scored 0–100 against your skills and preferences. Choose Balanced, Aggressive, or High-Quality mode.",
  },
  {
    icon: Users,
    title: "Recruiter Detection",
    description: "The bot finds recruiters posting hiring calls on LinkedIn and logs their contact info for direct outreach.",
  },
  {
    icon: BarChart2,
    title: "Application Tracking",
    description: "Every submitted application is logged with status, platform, and date. Update outcomes as responses arrive.",
  },
  {
    icon: Shield,
    title: "Cover Letter Generation",
    description: "GPT-4 writes a personalised cover letter for each applied job, stored alongside your application record.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Build your profile",
    description: "Upload your CV — AI extracts your skills, titles, and experience automatically. Adjust anything it missed.",
  },
  {
    n: "02",
    title: "Connect your platforms",
    description: "Link LinkedIn, Indeed, or Glassdoor via browser session. Your credentials are encrypted and never shared.",
  },
  {
    n: "03",
    title: "Automation takes over",
    description: "The bot runs your job search and submits applications around the clock. Track every result in your dashboard.",
  },
];

const FAQS = [
  {
    q: "Which job platforms does JobRocket support?",
    a: "Currently: LinkedIn (Easy Apply), Indeed, Glassdoor, Monster, and Google Jobs. More are added regularly.",
  },
  {
    q: "Does it really apply automatically without me?",
    a: "Yes. Once the bot is started, it searches for jobs matching your filters, scores each one, and submits applications on your behalf — including filling out forms.",
  },
  {
    q: "How are my platform credentials protected?",
    a: "Passwords are encrypted with Fernet (AES-128 CBC) before storage. They are only decrypted inside the bot worker at the moment of use — never logged or transmitted elsewhere.",
  },
  {
    q: "Can I control which jobs it applies to?",
    a: "Yes. You set your target titles, locations, job type, work mode, and scoring threshold. The bot only applies to jobs that pass your criteria.",
  },
  {
    q: "What happens if a platform asks for 2FA or a CAPTCHA?",
    a: "The bot uses your saved browser session (cookies), which avoids most 2FA prompts. If a session expires, you are notified to reconnect.",
  },
  {
    q: "Is there a free trial?",
    a: "All new accounts start with full Premium access for 30 days — no card required. After that, you can choose a plan.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[14px] font-medium text-slate-800">{q}</span>
        <ChevronDown
          size={16}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="text-[13.5px] text-slate-500 leading-relaxed pb-4">{a}</p>
      )}
    </div>
  );
}

const STARTER_PRICE = 899;
const ULTIMATE_PRICE = 2499;

export default function LandingPage() {
  const [yearly, setYearly] = useState(false);
  const discount = 0.2;
  const starterPrice = yearly ? Math.round(STARTER_PRICE * (1 - discount)) : STARTER_PRICE;
  const ultimatePrice = yearly ? Math.round(ULTIMATE_PRICE * (1 - discount)) : ULTIMATE_PRICE;

  return (
    <div className="bg-white text-slate-900">
      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Zap size={13} className="text-white" fill="white" />
            </div>
            <span className="text-[15px] font-semibold text-slate-900">JobRocket</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-24 px-5 text-center overflow-hidden landing-gradient">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-2xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[12px] font-semibold mb-6">
            <Zap size={11} fill="currentColor" />
            AI-powered job search automation
          </div>

          <h1 className="heading-display text-slate-900 mb-5">
            Automate your<br />
            <span className="text-indigo-600">job search</span> intelligently
          </h1>

          <p className="body-lg text-slate-500 max-w-xl mx-auto mb-8 leading-relaxed">
            JobRocket applies to matching jobs on LinkedIn, Indeed, Glassdoor and more — automatically.
            You focus on interviews. The bot handles everything else.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Start for free — 30 days Premium
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl text-[14px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors border border-slate-200"
            >
              Sign in to dashboard
            </Link>
          </div>

          <p className="text-[12px] text-slate-400 mt-4">
            No credit card required · Full access for 30 days
          </p>
        </motion.div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="caption text-indigo-600 mb-3">What it does</p>
            <h2 className="heading-2 text-slate-900">Everything your job search needs</h2>
            <p className="body text-slate-500 mt-3 max-w-md mx-auto">
              Real features backed by AI models and browser automation — not just dashboards.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="bg-white rounded-xl border border-slate-100 p-5"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mb-4">
                  <f.icon size={17} className="text-indigo-600" />
                </div>
                <h3 className="heading-4 text-slate-900 mb-1.5">{f.title}</h3>
                <p className="body-sm text-slate-500 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="caption text-indigo-600 mb-3">Simple to start</p>
            <h2 className="heading-2 text-slate-900">Up and running in minutes</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <div className="text-[11px] font-bold text-slate-300 mb-3 tracking-widest">{s.n}</div>
                <h3 className="heading-3 text-slate-900 mb-2">{s.title}</h3>
                <p className="body-sm text-slate-500 leading-relaxed">{s.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-slate-50" id="pricing">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="caption text-indigo-600 mb-3">Pricing</p>
            <h2 className="heading-2 text-slate-900">Simple, transparent pricing</h2>
            <p className="body text-slate-500 mt-3">Start free. Upgrade when you need more.</p>

            <div className="inline-flex items-center gap-1 mt-6 bg-white border border-slate-200 rounded-lg p-1">
              <button
                onClick={() => setYearly(false)}
                className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                  !yearly ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  yearly ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Yearly
                <span className={`text-[11px] font-bold ${yearly ? "text-emerald-400" : "text-emerald-600"}`}>–20%</span>
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-[13px] font-semibold text-slate-500 mb-1">Starter</p>
              <div className="flex items-end gap-1 mb-4">
                <span className="text-[32px] font-bold text-slate-900">₹{starterPrice.toLocaleString()}</span>
                <span className="text-slate-400 text-[13px] mb-1.5">/mo</span>
              </div>
              <p className="text-[13px] text-slate-500 mb-5">For individual job seekers getting started.</p>
              <ul className="space-y-2.5 mb-6">
                {["LinkedIn + Indeed automation", "Up to 50 applications/day", "Application tracking", "AI cover letters", "Resume builder"].map(f => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-slate-600">
                    <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block w-full py-2.5 rounded-lg text-[13px] font-semibold text-center border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Start free trial
              </Link>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Popular
              </div>
              <p className="text-[13px] font-semibold text-slate-400 mb-1">Ultimate</p>
              <div className="flex items-end gap-1 mb-4">
                <span className="text-[32px] font-bold text-white">₹{ultimatePrice.toLocaleString()}</span>
                <span className="text-slate-500 text-[13px] mb-1.5">/mo</span>
              </div>
              <p className="text-[13px] text-slate-400 mb-5">For serious job seekers using every advantage.</p>
              <ul className="space-y-2.5 mb-6">
                {["All platforms (5+ job boards)", "Unlimited applications", "AI resume tailoring per job", "Recruiter detection + WhatsApp", "Scoring engine + analytics", "Priority support"].map(f => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
                    <Check size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block w-full py-2.5 rounded-lg text-[13px] font-semibold text-center bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Start free trial
              </Link>
            </div>
          </div>

          <p className="text-center text-[12px] text-slate-400 mt-6">
            All plans start with a 30-day full Premium trial. No card needed.
          </p>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="caption text-indigo-600 mb-3">Questions</p>
            <h2 className="heading-2 text-slate-900">Frequently asked</h2>
          </div>
          <div className="rounded-xl border border-slate-100 overflow-hidden bg-white px-5">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} {...faq} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-slate-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="heading-2 text-slate-900 mb-4">
            Start your automated job search today
          </h2>
          <p className="body text-slate-500 mb-8">
            30 days of full Premium access — no card, no commitment.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Create free account
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8 px-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
              <Zap size={11} className="text-white" fill="white" />
            </div>
            <span className="text-[13px] font-semibold text-slate-700">JobRocket</span>
          </div>
          <p className="text-[12px] text-slate-400">
            Built for job seekers · ridhamariyam44@gmail.com
          </p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-[12px] text-slate-500 hover:text-slate-700 transition-colors">Sign in</Link>
            <Link href="/register" className="text-[12px] text-slate-500 hover:text-slate-700 transition-colors">Register</Link>
            <Link href="/#pricing" className="text-[12px] text-slate-500 hover:text-slate-700 transition-colors">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
