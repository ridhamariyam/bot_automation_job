"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../lib/useAuth";

const PLATFORMS = [
  { id: "linkedin",   label: "LinkedIn",    subtitle: "Easy Apply jobs" },
  { id: "indeed",     label: "Indeed",      subtitle: "Easily Apply jobs" },
  { id: "glassdoor",  label: "Glassdoor",   subtitle: "Easy Apply jobs" },
  { id: "monster",    label: "Monster",     subtitle: "Apply via Monster" },
  { id: "google_jobs",label: "Google Jobs", subtitle: "Redirects to ATS" },
  { id: "naukri",     label: "Naukri",      subtitle: "Indian job board" },
  { id: "bayt",       label: "Bayt",        subtitle: "Middle East jobs" },
  { id: "timesjobs",  label: "TimesJobs",   subtitle: "India job board" },
];

const FEATURES = [
  "1000+ applications per day",
  "All 8 job platforms",
  "Full automation enabled",
  "AI cover letter generation",
  "AI resume tailoring per job",
  "Recruiter contact detection",
  "WhatsApp recruiter outreach",
  "Resume builder with PDF export",
  "Real-time bot activity logs",
  "Application analytics",
];

const FAQ = [
  {
    q: "Do I need to enter payment details?",
    a: "No. All features are completely free — no credit card required.",
  },
  {
    q: "How many jobs can the bot apply to per day?",
    a: "Up to 1000 applications per day across all enabled platforms.",
  },
  {
    q: "Which platforms are supported?",
    a: "LinkedIn, Indeed, Glassdoor, Monster, Google Jobs, Naukri, Bayt, and TimesJobs.",
  },
  {
    q: "How do I get started?",
    a: "Go to Settings, add and verify your platform credentials, then hit 'Start Applying' on the Dashboard.",
  },
];

export default function BillingPage() {
  useAuth();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      <nav className="bg-white border-b border-gray-200 h-16 flex items-center px-6">
        <Link href="/dashboard" className="text-xl font-bold text-indigo-600">
          JobRocket
        </Link>
      </nav>

      <main className="flex-1 px-4 py-16">
        <div className="max-w-4xl mx-auto space-y-12">

          {/* Hero */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 text-sm font-semibold px-4 py-2 rounded-full mb-6">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              All features unlocked
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Everything included, free</h1>
            <p className="text-lg text-gray-600">
              No plans, no payments, no limits. Every feature is available to all users.
            </p>
          </div>

          {/* Features grid */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">What you get</h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-gray-700">
                  <svg className="w-5 h-5 flex-shrink-0 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Platform list */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Supported platforms</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {PLATFORMS.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
                  <svg className="w-5 h-5 flex-shrink-0 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.label}</p>
                    <p className="text-xs text-gray-500">{p.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">FAQ</h2>
            <div className="space-y-3">
              {FAQ.map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition font-semibold text-gray-900 text-left"
                  >
                    {item.q}
                    <svg
                      className={`w-5 h-5 flex-shrink-0 text-indigo-600 transition-transform ${expandedFaq === i ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedFaq === i && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-700">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/dashboard"
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-xl transition"
            >
              Go to Dashboard
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}
