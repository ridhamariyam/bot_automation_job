"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "../lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL as string;

// Paddle Configuration
const PADDLE_CLIENT_TOKEN = "live_15d057265d1b7dc9d9335c7eb3a";
const PADDLE_PRICE_PRO = "pri_01knn4f6079a1nvpzzmf0g686m";
const PADDLE_PRICE_PREMIUM = "pri_01knn4g3kd8nzzqz6f66vvahtc";
const SUCCESS_URL = "https://jobrocket.aiviora.online/dashboard";

// Extend window to include Paddle
declare global {
  interface Window {
    Paddle?: any;
  }
}

interface Plan {
  name: string;
  price: number;
  limit: number;
  platforms: string[];
  features: string[];
  description: string;
  cta: string;
  popular?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  monster: "Monster",
  bayt: "Bayt.com",
  naukri: "Naukri",
  timesjobs: "Times Jobs",
  direct: "Direct Email",
};

const PLATFORMS_BY_TIER = {
  free: ["linkedin"],
  pro: ["linkedin", "indeed", "glassdoor"],
  premium: ["linkedin", "indeed", "glassdoor", "monster", "bayt", "naukri", "timesjobs", "direct"],
};

const ALL_PLATFORMS = ["linkedin", "indeed", "glassdoor", "monster", "bayt", "naukri", "timesjobs", "direct"];

const PLANS: Plan[] = [
  {
    name: "Free",
    price: 0,
    limit: 5,
    platforms: PLATFORMS_BY_TIER.free,
    features: [
      "5 applications per day",
      "LinkedIn Easy Apply only",
      "Basic job filters",
      "Email notifications",
      "7-day application history",
      "Forever free — no credit card needed",
    ],
    description: "Limited usage — get started free",
    cta: "Start Free",
  },
  {
    name: "Pro",
    price: 499,
    limit: 50,
    platforms: PLATFORMS_BY_TIER.pro,
    features: [
      "50 applications per day",
      "LinkedIn + Indeed + Glassdoor",
      "Advanced job filters",
      "Limited automation",
      "Application analytics",
      "30-day application history",
      "Email support",
    ],
    description: "Core features for serious job seekers",
    cta: "Upgrade to Pro",
    popular: true,
  },
  {
    name: "Premium",
    price: 2999,
    limit: 1000,
    platforms: PLATFORMS_BY_TIER.premium,
    features: [
      "1000+ applications per day",
      "All 8 job platforms",
      "Full automation enabled",
      "Advanced filtering & AI matching",
      "24/7 priority support",
      "Advanced analytics & insights",
      "Unlimited application history",
      "Custom workflows",
    ],
    description: "Full automation with priority support",
    cta: "Go Premium",
  },
];

const FAQ = [
  {
    q: "Is this a subscription or one-time payment?",
    a: "All new users get a FREE 7-day premium trial with all features unlocked. After the trial ends, you can upgrade to a monthly subscription (Pro or Premium) or stay on the Free plan with limited features.",
  },
  {
    q: "What happens when my trial ends?",
    a: "Your account automatically downgrades to the Free plan (5 apps/day, LinkedIn only) after 7 days. You can upgrade anytime to continue using premium features.",
  },
  {
    q: "How do daily limits work?",
    a: "Each tier has a daily application limit that resets at midnight IST. Unused applications don't roll over to the next day.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit/debit cards, UPI, and digital wallets via Paddle.",
  },
  {
    q: "Can I change my plan?",
    a: "Yes! You can upgrade or downgrade anytime. Changes take effect immediately. NOTE: There are NO REFUNDS and NO CREDITS given when downgrading your plan.",
  },
  {
    q: "Do you offer refunds?",
    a: "NO REFUNDS are provided for any subscription payments. This includes downgrading your plan. Monthly subscriptions auto-renew on your billing date.",
  },
  {
    q: "What's the difference between Pro and Premium?",
    a: `Pro gives you core features with limited automation (50 apps/day on 3 platforms: LinkedIn, Indeed, Glassdoor). Premium unlocks full automation with 1000+ apps/day across all 8 platforms and priority support.`,
  },
];

export default function BillingPage() {
  const user = useAuth();
  const email = user?.email;
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [trialInfo, setTrialInfo] = useState<any>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paddleReady, setPaddleReady] = useState(false);

  // Initialize Paddle on mount
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      if (window.Paddle) {
        // Set to production environment
        window.Paddle.Environment.set("production");
        
        // Initialize with live token
        window.Paddle.Initialize({
          token: PADDLE_CLIENT_TOKEN,
        });
        setPaddleReady(true);
      }
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (email) {
      fetchCurrentPlan();
      fetchTrialStatus();
    }
    
    // Check for payment status from Paddle redirect
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const plan = params.get("plan");
    
    if (status === "success") {
      setPaymentStatus(`Payment successful! Upgrading to ${plan}...`);
      // Refresh plan after a moment to show updated plan
      setTimeout(() => {
        if (email) fetchCurrentPlan();
      }, 2000);
    } else if (status === "cancelled") {
      setPaymentStatus("Payment cancelled. No charges were made.");
    }
  }, [email]);

  const fetchCurrentPlan = async () => {
    try {
      const res = await fetch(`${API}/api/billing/plan/${email}`);
      const data = await res.json();
      setCurrentPlan(data.plan);
    } catch (err) {
      console.error("Failed to fetch current plan:", err);
    }
  };

  const fetchTrialStatus = async () => {
    try {
      const res = await fetch(`${API}/api/billing/trial-status/${email}`);
      const data = await res.json();
      setTrialInfo(data);
    } catch (err) {
      console.error("Failed to fetch trial status:", err);
    }
  };

  const handleUpgrade = (planName: string) => {
    if (!paddleReady || !window.Paddle) {
      alert("Payment system is loading. Please try again in a moment.");
      return;
    }

    if (!email) {
      alert("Please log in to upgrade your plan.");
      return;
    }

    // Determine price ID based on plan
    const priceId = planName.toLowerCase() === "pro" ? PADDLE_PRICE_PRO : PADDLE_PRICE_PREMIUM;

    setUpgrading(planName);

    // Use Paddle's client-side checkout
    window.Paddle.Checkout.open({
      items: [
        {
          priceId: priceId,
          quantity: 1,
        },
      ],
      customer: {
        email: email,
      },
      settings: {
        displayMode: "overlay",
        successUrl: SUCCESS_URL,
      },
    });

    setUpgrading(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 h-16 flex items-center px-6">
        <Link href="/dashboard" className="text-xl font-bold text-indigo-600">
          JobRocket
        </Link>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-4 py-16">
        <div className="max-w-7xl mx-auto w-full">
          {/* Trial Banner */}
          {trialInfo?.trial?.active && (
            <div className="mb-12 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v4h8v-4zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                <h2 className="text-2xl font-bold text-purple-900">
                  🎉 You're on the Premium Trial!
                </h2>
              </div>
              <p className="text-lg text-purple-700 mb-2">
                <span className="font-bold text-2xl">{trialInfo.trial.days_remaining}</span> days of unlimited access remaining
              </p>
              <p className="text-purple-600 text-sm">
                All 8 job platforms unlocked • 1000+ applications/day • Full automation enabled
              </p>
              {trialInfo.trial.days_remaining <= 3 && (
                <div className="mt-4 text-orange-700 font-semibold text-sm">
                  ⏰ Your trial is ending soon! Upgrade now to keep your momentum.
                </div>
              )}
            </div>
          )}

          {/* Upgrade Required Banner */}
          {trialInfo?.upgrade_required && (
            <div className="mb-12 bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <h2 className="text-2xl font-bold text-yellow-900">
                  Trial Expired - Upgrade to Continue
                </h2>
              </div>
              <p className="text-yellow-700 text-sm">
                Your 7-day premium trial has ended. Choose a plan below to keep using premium features.
              </p>
            </div>
          )}
          {/* Section: Plans */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Choose the perfect plan for your job search. Upgrade or downgrade anytime.
            </p>
            {currentPlan && (
              <p className="text-sm text-indigo-600 mt-4 font-semibold">
                Current Plan: <span className="capitalize">{currentPlan}</span>
              </p>
            )}
            
            {paymentStatus && (
              <div className={`mt-4 px-4 py-3 rounded-lg text-sm font-medium ${
                paymentStatus.includes("successful") 
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-yellow-50 text-yellow-700 border border-yellow-200"
              }`}>
                {paymentStatus}
              </div>
            )}
          </div>

          {/* Plans Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl transition-all ${
                  plan.popular
                    ? "ring-2 ring-indigo-600 shadow-2xl shadow-indigo-200 scale-105 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-8"
                    : "bg-white border border-gray-200 p-8 hover:shadow-lg"
                }`}
              >
                {plan.popular && (
                  <div className="mb-4 inline-block bg-indigo-500 text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}

                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className={`text-sm mb-4 ${plan.popular ? "text-indigo-100" : "text-gray-600"}`}>
                  {plan.description}
                </p>

                <div className="mb-4">
                  <span className="text-4xl font-extrabold">₹{plan.price}</span>
                  <span className={`text-sm ml-2 ${plan.popular ? "text-indigo-200" : "text-gray-500"}`}>
                    {plan.price > 0 ? "/month" : "forever"}
                  </span>
                </div>

                <div className={`text-sm font-semibold mb-6 ${plan.popular ? "text-indigo-100" : "text-gray-500"}`}>
                  Up to {plan.limit} applications/day
                </div>

                <button
                  onClick={() => handleUpgrade(plan.name)}
                  disabled={currentPlan === plan.name.toLowerCase() || upgrading === plan.name}
                  className={`w-full py-3 rounded-lg font-semibold mb-6 transition ${
                    currentPlan === plan.name.toLowerCase()
                      ? plan.popular
                        ? "bg-indigo-400 text-white cursor-default"
                        : "bg-gray-100 text-gray-400 cursor-default"
                      : plan.popular
                      ? "bg-white text-indigo-600 hover:bg-indigo-50"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {upgrading === plan.name
                    ? "Processing Payment..."
                    : currentPlan === plan.name.toLowerCase()
                    ? "✓ Current Plan"
                    : plan.cta}
                </button>

                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className={`flex items-start gap-2 text-sm ${plan.popular ? "text-indigo-100" : "text-gray-700"}`}>
                      <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${plan.popular ? "text-indigo-200" : "text-indigo-600"}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Section: Platform Comparison Matrix */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Platform Availability</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Platform</th>
                    {PLANS.map((plan) => (
                      <th key={plan.name} className="text-center py-3 px-4 font-semibold text-gray-900">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PLATFORMS.map((platform) => (
                    <tr key={platform} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 font-medium text-gray-900">
                        {PLATFORM_LABELS[platform]}
                      </td>
                      {PLANS.map((plan) => (
                        <td key={plan.name} className="text-center py-4 px-4">
                          {plan.platforms.includes(platform) ? (
                            <svg className="w-6 h-6 text-indigo-600 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6 text-gray-300 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: FAQ */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {FAQ.map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition font-semibold text-gray-900"
                  >
                    {item.q}
                    <svg
                      className={`w-5 h-5 text-indigo-600 transition-transform ${expandedFaq === i ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </button>
                  {expandedFaq === i && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-gray-700">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-16 text-center text-gray-600 text-sm">
            <p className="mb-4">
              Have questions? <a href="/dashboard" className="text-indigo-600 hover:underline">Contact support</a>
            </p>
            <p className="mb-4">
              Payment processed securely via Paddle.
            </p>
            
            {/* Policy Notice */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-8 text-red-900">
              <p className="font-semibold mb-2">⚠️ Important: Refund & Credit Policy</p>
              <ul className="text-left inline-block text-sm space-y-1">
                <li>✗ NO REFUNDS are given for any subscription payments</li>
                <li>✗ NO CREDITS are issued when downgrading your plan</li>
                <li>✓ All payments are final - ensure you choose the right plan before upgrading</li>
                <li>✓ Monthly subscriptions auto-renew. You can cancel from Settings anytime</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
