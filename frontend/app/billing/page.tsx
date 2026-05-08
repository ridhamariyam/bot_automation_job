"use client";

import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import { DashboardLayout } from "../components/layout/DashboardLayout";
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
  ChevronDown,
} from "lucide-react";

// ── Pricing data ───────────────────────────────────────────────────────────────

const STARTER_MONTHLY  = 899;
const ULTIMATE_MONTHLY = 2499;
const DISCOUNT         = 0.2;

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
      { icon: FolderOpen, text: "5 Projects" },
      { icon: Zap,        text: "AI Automation" },
      { icon: Headphones, text: "Email Support" },
      { icon: BarChart3,  text: "Basic Analytics" },
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
  return yearly ? Math.round(monthly * (1 - DISCOUNT)) : monthly;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

// ── Billing toggle ─────────────────────────────────────────────────────────────

function BillingToggle({ yearly, onToggle }: { yearly: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onToggle(false)}
        className={`text-[13.5px] font-semibold transition-colors ${!yearly ? "text-slate-900" : "text-slate-400"}`}
      >
        Monthly
      </button>

      <button
        onClick={() => onToggle(!yearly)}
        className="relative w-11 h-6 rounded-full bg-slate-200 transition-colors hover:bg-slate-300 focus:outline-none"
        aria-label="Toggle billing period"
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
          style={{ left: yearly ? "calc(100% - 1.375rem)" : "0.125rem" }}
        />
      </button>

      <button
        onClick={() => onToggle(true)}
        className={`flex items-center gap-2 text-[13.5px] font-semibold transition-colors ${yearly ? "text-slate-900" : "text-slate-400"}`}
      >
        Yearly
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-wide transition-all ${
          yearly
            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
            : "bg-slate-100 text-slate-400"
        }`}>
          SAVE 20%
        </span>
      </button>
    </div>
  );
}

// ── Pricing card ───────────────────────────────────────────────────────────────

function PricingCard({ plan, yearly, index }: { plan: Plan; yearly: boolean; index: number }) {
  const price       = formatPrice(plan.monthlyPrice, yearly);
  const yearlyTotal = formatINR(price * 12);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col"
    >
      {plan.popular && (
        <div className="absolute -top-3.5 right-6 z-10">
          <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase shadow-md">
            Most Popular
          </span>
        </div>
      )}

      <div className={`relative flex flex-col flex-1 rounded-2xl border overflow-hidden transition-all ${
        plan.popular
          ? "border-indigo-300 bg-indigo-50 shadow-lg shadow-indigo-100/60"
          : "border-slate-200 bg-white shadow-sm"
      }`}>
        {plan.popular && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-400" />
        )}

        <div className="flex flex-col flex-1 p-7">
          {/* Header */}
          <div className="mb-5">
            <h3 className={`text-[17px] font-bold tracking-tight mb-1 ${plan.popular ? "text-indigo-900" : "text-slate-900"}`}>
              {plan.name}
            </h3>
            <p className="text-[13px] text-slate-500 leading-relaxed">{plan.description}</p>
          </div>

          {/* Price */}
          <div className="mb-6">
            <div className="flex items-end gap-1.5 mb-1">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={`${plan.id}-price-${yearly}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                  className={`text-4xl font-extrabold tracking-tight tabular-nums ${plan.popular ? "text-indigo-900" : "text-slate-900"}`}
                >
                  {formatINR(price)}
                </motion.span>
              </AnimatePresence>
              <span className="text-slate-400 text-[13px] pb-1.5 font-medium">/mo</span>
            </div>
            <AnimatePresence mode="popLayout">
              <motion.p
                key={`${plan.id}-billing-${yearly}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="text-[12px] text-slate-400"
              >
                {yearly
                  ? `Billed ${yearlyTotal}/year · 20% off`
                  : "Billed monthly · cancel anytime"}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Features */}
          <ul className="space-y-3 mb-7 flex-1">
            {plan.features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 ${
                  plan.popular ? "text-indigo-600" : "text-slate-400"
                }`}>
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                </span>
                <span className="text-[13px] text-slate-700 leading-snug flex-1">{text}</span>
                <Icon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              </li>
            ))}
          </ul>

          {/* CTA */}
          <motion.a
            href={plan.ctaHref}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full py-3 rounded-xl text-[13.5px] font-semibold text-center block transition-colors focus:outline-none ${
              plan.popular
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200"
                : "bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {plan.cta}
          </motion.a>
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
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className="border border-slate-200 rounded-xl overflow-hidden bg-white"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors focus:outline-none"
      >
        <span className="text-[14px] font-semibold text-slate-800">{q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-4 shrink-0 text-slate-400"
        >
          <ChevronDown size={16} />
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
            <p className="px-5 pb-4 text-[13px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
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
    <DashboardLayout title="Billing">
      <div className="max-w-3xl mx-auto">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-1.5 border border-indigo-200 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold text-indigo-600 mb-5 bg-indigo-50">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Pricing
          </div>
          <h1 className="text-[28px] sm:text-[32px] font-extrabold tracking-tight text-slate-900 mb-3">
            Choose the Perfect Plan
          </h1>
          <p className="text-[14px] text-slate-500 max-w-sm mx-auto leading-relaxed">
            Start free. Upgrade when you need more firepower. No hidden fees.
          </p>
        </motion.div>

        {/* Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="flex justify-center mb-8"
        >
          <BillingToggle yearly={yearly} onToggle={setYearly} />
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-12">
          {PLANS.map((plan, i) => (
            <PricingCard key={plan.id} plan={plan} yearly={yearly} index={i} />
          ))}
        </div>

        {/* Trust strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="flex flex-wrap items-center justify-center gap-5 mb-12 py-5 border-y border-slate-100"
        >
          {[
            "No credit card required",
            "Cancel anytime",
            "AES-256 encrypted credentials",
            "GDPR compliant",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-[12.5px] text-slate-500">
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2.5} />
              {item}
            </div>
          ))}
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-[18px] font-bold text-slate-900 text-center mb-5">
            Frequently asked questions
          </h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} index={i} />
            ))}
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
}
