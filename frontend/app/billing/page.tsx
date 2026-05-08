"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Zap,
  Users,
  BarChart3,
  Headphones,
  Infinity,
  FolderOpen,
  BrainCircuit,
  ChevronLeft,
} from "lucide-react";

// ── Pricing data ───────────────────────────────────────────────────────────────

const STARTER_MONTHLY = 899;
const ULTIMATE_MONTHLY = 2499;
const DISCOUNT = 0.2;

type Feature = { icon: React.ElementType; text: string };

type Plan = {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  popular: boolean;
  features: Feature[];
  cta: string;
  ctaHref: string;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Everything you need to start landing interviews on autopilot.",
    monthlyPrice: STARTER_MONTHLY,
    popular: false,
    cta: "Get started free",
    ctaHref: "/register",
    features: [
      { icon: FolderOpen,   text: "5 Projects" },
      { icon: Zap,          text: "AI Automation" },
      { icon: Headphones,   text: "Email Support" },
      { icon: BarChart3,    text: "Basic Analytics" },
    ],
  },
  {
    id: "ultimate",
    name: "Ultimate",
    description: "For serious job seekers who want maximum coverage and results.",
    monthlyPrice: ULTIMATE_MONTHLY,
    popular: true,
    cta: "Start Ultimate",
    ctaHref: "/register",
    features: [
      { icon: Infinity,     text: "Unlimited Projects" },
      { icon: BrainCircuit, text: "Advanced AI Automation" },
      { icon: Users,        text: "Team Collaboration" },
      { icon: Headphones,   text: "Priority Support" },
      { icon: BarChart3,    text: "Advanced Analytics" },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(monthly: number, yearly: boolean): number {
  if (yearly) return Math.round(monthly * (1 - DISCOUNT));
  return monthly;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BillingToggle({
  yearly,
  onToggle,
}: {
  yearly: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 justify-center">
      <button
        onClick={() => onToggle(false)}
        className={`text-sm font-medium transition-colors duration-200 ${
          !yearly ? "text-white" : "text-white/40"
        }`}
      >
        Monthly
      </button>

      {/* Toggle pill */}
      <button
        onClick={() => onToggle(!yearly)}
        className="relative w-12 h-6 rounded-full bg-white/10 border border-white/15 transition-colors duration-200 hover:bg-white/15 focus:outline-none"
        aria-label="Toggle billing period"
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
          className="absolute top-0.5 w-5 h-5 rounded-full bg-indigo-500 shadow-md"
          style={{ left: yearly ? "calc(100% - 1.375rem)" : "0.125rem" }}
        />
      </button>

      <button
        onClick={() => onToggle(true)}
        className={`text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${
          yearly ? "text-white" : "text-white/40"
        }`}
      >
        Yearly
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-wide transition-all duration-300 ${
            yearly
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-white/5 text-white/25 border border-white/10"
          }`}
        >
          SAVE 20%
        </span>
      </button>
    </div>
  );
}

function PricingCard({
  plan,
  yearly,
  index,
}: {
  plan: Plan;
  yearly: boolean;
  index: number;
}) {
  const price = formatPrice(plan.monthlyPrice, yearly);
  const yearlyTotal = formatINR(price * 12);

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2, ease: "easeOut" } }}
      className="relative flex flex-col"
    >
      {/* Most popular badge */}
      {plan.popular && (
        <div className="absolute -top-3.5 right-6 z-10">
          <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase shadow-lg shadow-indigo-900/40">
            Most Popular
          </span>
        </div>
      )}

      {/* Card */}
      <div
        className={`relative flex flex-col flex-1 rounded-3xl overflow-hidden transition-all duration-300 ${
          plan.popular
            ? "bg-[#0f0f18] border border-indigo-500/40"
            : "bg-white/[0.03] border border-white/10"
        }`}
        style={
          plan.popular
            ? { boxShadow: "0 0 60px -12px rgba(99, 102, 241, 0.35), 0 8px 32px -8px rgba(0,0,0,0.5)" }
            : { boxShadow: "0 4px 24px -4px rgba(0,0,0,0.3)" }
        }
      >
        {/* Popular glow gradient top strip */}
        {plan.popular && (
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.8), transparent)" }}
          />
        )}

        {/* Ambient glow for popular */}
        {plan.popular && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)",
            }}
          />
        )}

        <div className="relative flex flex-col flex-1 p-8">
          {/* Plan header */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-white tracking-tight mb-1.5">
              {plan.name}
            </h3>
            <p className="text-[13px] text-white/40 leading-relaxed">
              {plan.description}
            </p>
          </div>

          {/* Price */}
          <div className="mb-7">
            <div className="flex items-end gap-1.5 mb-1">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={`${plan.id}-price-${yearly}`}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-5xl font-extrabold text-white tracking-tight tabular-nums"
                >
                  {formatINR(price)}
                </motion.span>
              </AnimatePresence>
              <span className="text-white/30 text-sm pb-2 font-medium">/mo</span>
            </div>

            <AnimatePresence mode="popLayout">
              <motion.p
                key={`${plan.id}-billing-${yearly}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="text-[12px] text-white/30"
              >
                {yearly
                  ? `Billed ${yearlyTotal}/year · 20% off`
                  : "Billed monthly · cancel anytime"}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Features */}
          <ul className="space-y-3.5 mb-8 flex-1">
            {plan.features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    plan.popular
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-white/8 text-white/50"
                  }`}
                >
                  <Check className="w-3 h-3" strokeWidth={2.5} />
                </span>
                <span className="text-[13px] text-white/65 leading-snug">{text}</span>
                <Icon className="w-3.5 h-3.5 text-white/20 ml-auto shrink-0" />
              </li>
            ))}
          </ul>

          {/* CTA */}
          {plan.popular ? (
            <motion.a
              href={plan.ctaHref}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white text-center block transition-all duration-200 focus:outline-none"
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                boxShadow: "0 4px 24px -4px rgba(99,102,241,0.55), 0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              {plan.cta}
            </motion.a>
          ) : (
            <motion.a
              href={plan.ctaHref}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white/70 text-center block border border-white/12 hover:border-white/25 hover:text-white transition-all duration-200 focus:outline-none"
            >
              {plan.cta}
            </motion.a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "Is there a free trial?",
    a: "Yes. All features are unlocked for free during our early access period — no credit card required.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. Upgrade or downgrade at any time. Changes take effect immediately.",
  },
  {
    q: "Which job platforms are supported?",
    a: "LinkedIn, Indeed, Glassdoor, Monster, Google Jobs, Naukri, Bayt, and TimesJobs.",
  },
  {
    q: "How does the AI tailoring work?",
    a: "Our AI rewrites your resume bullets and cover letter for each job description using GPT-4o, maximising your match score.",
  },
];

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className="border border-white/8 rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-white/[0.03] transition-colors duration-200 focus:outline-none"
      >
        <span className="text-[14px] font-semibold text-white/80">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/30 ml-4 shrink-0 text-xl leading-none"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <p className="px-6 pb-5 text-[13px] text-white/40 leading-relaxed border-t border-white/5 pt-4">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  useAuth();
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">

      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[500px] opacity-[0.07]"
          style={{
            background: "radial-gradient(ellipse at center, #6366f1 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] opacity-[0.04]"
          style={{
            background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative border-b border-white/[0.06] backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all duration-150"
              aria-label="Back to Dashboard"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <Link href="/" className="text-base font-bold tracking-tight">
              <span className="text-indigo-400">Job</span>Rocket
            </Link>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-white/40 hover:text-white transition-colors duration-150"
          >
            Dashboard
          </Link>
        </div>
      </nav>

      <main className="relative max-w-5xl mx-auto px-5 pt-20 pb-32">

        {/* ── Hero heading ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 text-xs font-semibold text-white/50 mb-6 bg-white/[0.03]">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            Pricing
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.08] text-white mb-5">
            Choose the Perfect Plan
          </h1>
          <p className="text-base text-white/40 max-w-md mx-auto leading-relaxed">
            Start free. Upgrade when you need more firepower.
            No hidden fees, no surprises.
          </p>
        </motion.div>

        {/* ── Toggle ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex justify-center mb-12"
        >
          <BillingToggle yearly={yearly} onToggle={setYearly} />
        </motion.div>

        {/* ── Pricing cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 items-stretch mb-20">
          {PLANS.map((plan, i) => (
            <PricingCard key={plan.id} plan={plan} yearly={yearly} index={i} />
          ))}
        </div>

        {/* ── Trust strip ── */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-6 mb-20"
        >
          {[
            "No credit card required",
            "Cancel anytime",
            "AES-256 encrypted credentials",
            "GDPR compliant",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-[12px] text-white/30">
              <Check className="w-3.5 h-3.5 text-emerald-500/70 shrink-0" strokeWidth={2.5} />
              {item}
            </div>
          ))}
        </motion.div>

        {/* ── FAQ ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto"
        >
          <h2 className="text-xl font-bold text-white text-center mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} index={i} />
            ))}
          </div>
        </motion.div>

        {/* ── Bottom CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mt-20"
        >
          <p className="text-white/30 text-sm mb-6">
            Already have an account?
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold text-white border border-white/12 hover:border-white/25 hover:bg-white/[0.04] transition-all duration-200"
          >
            Go to Dashboard
          </Link>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-white/[0.06] py-6 px-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-white/20">
          <span>
            <span className="text-indigo-400">Job</span>Rocket
          </span>
          <span>© {new Date().getFullYear()} · Built by Ridha Mariyam | Aiviora | CodeforSuree</span>
        </div>
      </footer>
    </div>
  );
}
