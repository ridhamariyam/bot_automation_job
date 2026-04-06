"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";

const API = "http://localhost:8000";

export default function OnboardingPage() {
  useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1); // 1: Profile, 2: LinkedIn, 3: CV, 4: Review
  const [userEmail, setUserEmail] = useState("");
  const [token, setToken] = useState("");

  // Step 1: Profile
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [titles, setTitles] = useState("");
  const [locations, setLocations] = useState("");
  const [skills, setSkills] = useState("");

  // Step 2: LinkedIn
  const [liEmail, setLiEmail] = useState("");
  const [liPassword, setLiPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [liVerified, setLiVerified] = useState(false);

  // Step 3: CV
  const [cvFile, setCvFile] = useState<File | null>(null);

  // General
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    const tok = localStorage.getItem("token") ?? "";
    if (!stored) {
      router.push("/login");
      return;
    }
    const u = JSON.parse(stored);
    setUserEmail(u.email);
    setToken(tok);
    setName(u.name ?? "");

    // Load existing profile
    fetch(`${API}/api/profile/${encodeURIComponent(u.email)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (!p) return;
        if (p.name) setName(p.name);
        if (p.phone) setPhone(p.phone);
        if (p.target_titles) setTitles(p.target_titles.join(", "));
        if (p.target_locations) setLocations(p.target_locations.join("\n"));
        if (p.skills) setSkills(p.skills.join(", "));
        if (p.linkedin_email) {
          setLiEmail(p.linkedin_email);
          setLiVerified(!!p.linkedin_verified);
        }
      })
      .catch(() => {});
  }, [router]);

  async function verifyLinkedIn() {
    if (!liEmail || !liPassword) {
      setVerifyMsg("Please enter both email and password");
      return;
    }

    setVerifying(true);
    setVerifyMsg("Connecting to LinkedIn...");

    try {
      const res = await fetch(`${API}/api/bot/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platform: "linkedin",
          email: liEmail,
          password: liPassword,
        }),
      });

      if (res.ok) {
        setVerifyMsg("✓ LinkedIn connected successfully!");
        setLiVerified(true);
        setVerifying(false);
      } else {
        const error = await res.text();
        setVerifyMsg(`✗ Failed to connect: ${error}`);
        setVerifying(false);
      }
    } catch (err) {
      setVerifyMsg(`✗ Connection error: ${err}`);
      setVerifying(false);
    }
  }



  async function saveAndContinue() {
    if (step === 1) {
      if (!name || !titles || !locations) {
        setError("Please fill in all fields");
        return;
      }
    }

    if (step === 2) {
      if (!liVerified) {
        setError("Please verify your LinkedIn credentials");
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      const token = localStorage.getItem("token") ?? "";

      // Step 1: Save profile info
      if (step === 1) {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("email", userEmail);
        formData.append("phone", phone);
        formData.append("skills", skills);
        formData.append("targetTitles", titles);
        formData.append("targetLocations", locations);

        const res = await fetch(`${API}/api/profile`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) throw new Error("Failed to save profile");
      }

      // Step 2: Save LinkedIn credentials
      if (step === 2) {
        const res = await fetch(
          `${API}/api/profile/${encodeURIComponent(userEmail)}/credentials`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              linkedin_email: liEmail,
              linkedin_password: liPassword,
            }),
          }
        );

        if (!res.ok) throw new Error("Failed to save credentials");
      }

      // Step 3: Upload CV with profile data
      if (step === 3) {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("email", userEmail);
        formData.append("phone", phone);
        formData.append("skills", skills);
        formData.append("targetTitles", titles);
        formData.append("targetLocations", locations);
        if (cvFile) {
          formData.append("cv", cvFile);
        }

        const res = await fetch(`${API}/api/profile`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) throw new Error("Failed to save CV");
      }

      setSaving(false);
      if (step < 4) {
        setStep(step + 1);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(`Error: ${err}`);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🚀 JobRocket</h1>
          <p className="text-lg text-gray-600">Setup your profile to start auto-applying to jobs</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-12 px-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                  s <= step
                    ? "bg-blue-600 text-white"
                    : "bg-gray-300 text-gray-600"
                }`}
              >
                {s === 1 && "👤"}
                {s === 2 && "🔗"}
                {s === 3 && "📄"}
                {s === 4 && "✓"}
              </div>
              {s < 4 && (
                <div
                  className={`h-1 flex-1 mx-2 ${
                    s < step ? "bg-blue-600" : "bg-gray-300"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          {/* Step 1: Profile */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Tell us about yourself
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Target Job Titles (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={titles}
                      onChange={(e) => setTitles(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Full Stack Developer, Backend Engineer, DevOps Engineer"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Target Locations (one per line)
                    </label>
                    <textarea
                      value={locations}
                      onChange={(e) => setLocations(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="London, UK&#10;Singapore&#10;Remote"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Key Skills (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Python, React, AWS, Docker"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: LinkedIn */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Connect your LinkedIn
                </h2>
                <p className="text-gray-600 mb-6">
                  We'll use your LinkedIn account to automatically apply to jobs. Your credentials are encrypted and never shared.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      LinkedIn Email
                    </label>
                    <input
                      type="email"
                      value={liEmail}
                      onChange={(e) => setLiEmail(e.target.value)}
                      disabled={liVerified}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                      placeholder="your.email@gmail.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      LinkedIn Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={liPassword}
                        onChange={(e) => setLiPassword(e.target.value)}
                        disabled={liVerified}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                        disabled={liVerified}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  {verifyMsg && (
                    <div
                      className={`p-4 rounded-lg ${
                        liVerified
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {verifyMsg}
                    </div>
                  )}

                  {!liVerified && (
                    <button
                      onClick={verifyLinkedIn}
                      disabled={verifying || !liEmail || !liPassword}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg transition"
                    >
                      {verifying ? "Connecting..." : "Verify & Connect"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: CV */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Upload your CV (optional)
                </h2>
                <p className="text-gray-600 mb-6">
                  Your CV helps us fill out applications more accurately. You can skip this for now.
                </p>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setCvFile(file);
                    }}
                    className="hidden"
                    id="cv-upload"
                  />
                  <label htmlFor="cv-upload" className="cursor-pointer">
                    <p className="text-2xl mb-2">📄</p>
                    <p className="font-semibold text-gray-900">
                      {cvFile ? cvFile.name : "Drag & drop your CV here"}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      or click to select (PDF, DOC)
                    </p>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  You're all set! 🎉
                </h2>

                <div className="space-y-4 bg-blue-50 rounded-lg p-6">
                  <div>
                    <p className="text-sm text-gray-600">Full Name</p>
                    <p className="font-semibold text-gray-900">{name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Target Titles</p>
                    <p className="font-semibold text-gray-900">{titles}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">LinkedIn Account</p>
                    <p className="font-semibold text-gray-900">{liEmail}</p>
                  </div>
                </div>

                <p className="text-gray-600 mt-6">
                  Click "Start Applying" to begin! The bot will automatically apply to jobs matching your criteria on LinkedIn.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-4">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-semibold py-3 px-6 rounded-lg transition"
            >
              Back
            </button>
          )}
          <button
            onClick={saveAndContinue}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            {saving
              ? "Saving..."
              : step === 4
                ? "Start Applying 🚀"
                : step === 3
                  ? "Next (Skip CV)"
                  : "Next"}
          </button>
        </div>

        <Link href="/login" className="text-center text-gray-600 hover:text-gray-900 mt-6 block">
          Back to Login
        </Link>
      </div>
    </div>
  );
}
