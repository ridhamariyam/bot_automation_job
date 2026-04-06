"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "../lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL as string;

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
    a: "Pro and Premium are monthly subscriptions. Free is forever free with no card required. Cancel anytime from your account settings.",
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
    a: "Yes! You can upgrade or downgrade anytime. Changes take effect immediately. If you downgrade, you'll get a prorated credit.",
  },
  {
    q: "Do you offer refunds?",
    a: "We offer a 7-day money-back guarantee if you're not satisfied. After that, monthly subscriptions auto-renew on your billing date.",
  },
  {
    q: "What's the difference between Pro and Premium?",
    a: `Pro gives you core features with limited automation (50 apps/day on 3 platforms). Premium unlocks full automation with 1000+ apps/day across all 8 platforms and priority support.`,
  },
];

export default function BillingPage() {
  const user = useAuth();
  const email = user?.email;
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  useEffect(() => {
    if (email) {
      fetchCurrentPlan();
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

  const handleUpgrade = async (planName: string) => {
    if (!email) return;
    
    setUpgrading(planName);
    try {
      // Create checkout with Paddle
      const res = await fetch(`${API}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          plan: planName.toLowerCase(),
          name: email.split("@")[0],
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Payment setup failed: ${error.detail || "Unknown error"}`);
        setUpgrading(null);
        return;
      }

      const data = await res.json();
      
      // Redirect to Paddle checkout
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert("Could not create payment link. Please try again.");
        setUpgrading(null);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Payment processing failed. Please try again.");
      setUpgrading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 h-16 flex items-center px-6">
        <Link href="/dashboard" className="text-xl font-bold text-indigo-600">
          JobRocket<span className="text-gray-900">.ai</span>
        </Link>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-4 py-16">
        <div className="max-w-7xl mx-auto w-full">
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
            <p>
              Payment processed securely via Paddle. One-time payment, no recurring charges. 7-day money-back guarantee.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
