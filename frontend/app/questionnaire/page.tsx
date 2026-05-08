"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import { JOB_TYPES, WORK_MODES, EXP_LEVELS, DATE_POSTED, COMPANY_SIZES, DEFAULT_FILTERS } from "../lib/jobFilters";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const PLATFORMS = [
  { id: "linkedin",    label: "LinkedIn",    color: "bg-[#0077B5]", free: true,  icon: "in" },
  { id: "indeed",      label: "Indeed",      color: "bg-[#003A9B]", free: false, icon: "II" },
  { id: "google",      label: "Google Jobs", color: "bg-[#EA4335]", free: false, icon: "G"  },
  { id: "naukri",      label: "Naukri",      color: "bg-[#FF6633]", free: false, icon: "N"  },
  { id: "glassdoor",   label: "Glassdoor",   color: "bg-[#0CAA41]", free: false, icon: "gd" },
  { id: "internshala", label: "Internshala", color: "bg-[#009AFF]", free: false, icon: "IS" },
  { id: "wellfound",   label: "Wellfound",   color: "bg-[#1B1B1B]", free: false, icon: "W"  },
  { id: "shine",       label: "Shine",       color: "bg-[#E31837]", free: false, icon: "Sh" },
];

type FormData = {
  name: string; email: string; phone: string;
  summary: string; skills: string;
  targetTitles: string; targetLocations: string;
  platforms: string[];
  filters: typeof DEFAULT_FILTERS;
  cvFile: File | null;
};

const STEPS = [
  { label: "Personal" },
  { label: "About You" },
  { label: "Job Targets" },
  { label: "Filters" },
  { label: "Platforms" },
  { label: "Upload CV" },
];

export default function QuestionnairePage() {
  useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({
    name: "", email: "", phone: "",
    summary: "", skills: "",
    targetTitles: "", targetLocations: "",
    platforms: ["linkedin"],
    filters: { ...DEFAULT_FILTERS },
    cvFile: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const setField = (key: keyof FormData, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const toggleArr = (key: "platforms", id: string) =>
    setForm((p) => ({
      ...p,
      [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id],
    }));

  const setFilter = (key: keyof typeof DEFAULT_FILTERS, value: string | string[]) =>
    setForm((p) => ({ ...p, filters: { ...p.filters, [key]: value } }));

  const toggleFilter = (key: "jobTypes" | "workModes" | "companySizes", id: string) => {
    const cur = form.filters[key] as string[];
    setFilter(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const next = () => {
    setError("");
    if (step === 0 && (!form.name || !form.email)) { setError("Name and email are required."); return; }
    if (step === 1 && !form.summary) { setError("Please write a short summary."); return; }
    if (step === 2 && !form.targetTitles) { setError("Enter at least one target job title."); return; }
    if (step === 3 && !form.filters.jobTypes.length) { setError("Select at least one job type."); return; }
    if (step === 4 && !form.platforms.length) { setError("Select at least one platform."); return; }
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (!form.cvFile) { setError("Please upload your CV."); return; }
    setLoading(true); setError("");
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "cvFile" || v == null) return;
        if (Array.isArray(v)) body.append(k, v.join(","));
        else if (typeof v === "object") body.append(k, JSON.stringify(v));
        else body.append(k, v as string);
      });
      body.append("cv", form.cvFile);
      const res = await fetch(`${API}/api/profile`, { method: "POST", body });
      if (!res.ok) throw new Error();
      const data = await res.json();
      localStorage.setItem("jobrocket_user", JSON.stringify(data));
      router.push("/dashboard");
    } catch {
      const profile = {
        id: Date.now().toString(),
        name: form.name, email: form.email, phone: form.phone,
        summary: form.summary,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        targetTitles: form.targetTitles.split(",").map((s) => s.trim()).filter(Boolean),
        targetLocations: form.targetLocations.split(",").map((s) => s.trim()).filter(Boolean),
        platforms: form.platforms,
        filters: form.filters,
        plan: "free", botActive: false,
      };
      localStorage.setItem("jobrocket_user", JSON.stringify(profile));
      router.push("/dashboard");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-bold text-indigo-600 tracking-tight">
        JobRocket
      </Link>

      {/* Progress */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition
                ${i < step ? "bg-indigo-600 text-white" : i === step ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : "bg-gray-200 text-gray-400"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? "text-indigo-600 font-medium" : "text-gray-400"}`}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="relative h-1 bg-gray-200 rounded-full mt-1">
          <div className="absolute top-0 left-0 h-1 bg-indigo-600 rounded-full transition-all"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
        </div>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h2 className="text-xl font-bold mb-1">{STEPS[step].label}</h2>
        <p className="text-sm text-gray-400 mb-6">Step {step + 1} of {STEPS.length}</p>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>}

        {/* ── STEP 0: Personal ── */}
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Full Name *">
              <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Your full name" className={INPUT} />
            </Field>
            <Field label="Email *">
              <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="you@email.com" className={INPUT} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="+91 99999 99999" className={INPUT} />
            </Field>
          </div>
        )}

        {/* ── STEP 1: About ── */}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Tell me about yourself *">
              <textarea rows={4} value={form.summary} onChange={(e) => setField("summary", e.target.value)}
                placeholder="I'm a software engineer with 3 years of experience in React and Node.js..." className={`${INPUT} resize-none`} />
            </Field>
            <Field label="Your skills (comma-separated)">
              <input type="text" value={form.skills} onChange={(e) => setField("skills", e.target.value)}
                placeholder="React, TypeScript, Node.js, AWS" className={INPUT} />
            </Field>
          </div>
        )}

        {/* ── STEP 2: Job Targets ── */}
        {step === 2 && (
          <div className="space-y-4">
            <Field label="Target job titles *">
              <input type="text" value={form.targetTitles} onChange={(e) => setField("targetTitles", e.target.value)}
                placeholder="Frontend Engineer, React Developer, Full Stack" className={INPUT} />
            </Field>
            <Field label="Preferred locations">
              <input type="text" value={form.targetLocations} onChange={(e) => setField("targetLocations", e.target.value)}
                placeholder="Bangalore, Remote, Mumbai" className={INPUT} />
            </Field>
          </div>
        )}

        {/* ── STEP 3: Filters ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Job type *</p>
              <div className="flex flex-wrap gap-2">
                {JOB_TYPES.map((t) => (
                  <Chip key={t.id} label={t.label} active={form.filters.jobTypes.includes(t.id)}
                    onClick={() => toggleFilter("jobTypes", t.id)} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Work mode</p>
              <div className="flex flex-wrap gap-2">
                {WORK_MODES.map((m) => (
                  <Chip key={m.id} label={m.label} active={form.filters.workModes.includes(m.id)}
                    onClick={() => toggleFilter("workModes", m.id)} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Experience level</p>
              <div className="flex flex-wrap gap-2">
                {EXP_LEVELS.map((l) => (
                  <Chip key={l.id} label={l.label}
                    active={form.filters.experienceLevel === l.id}
                    onClick={() => setFilter("experienceLevel", l.id)} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min salary (LPA)">
                <input type="number" value={form.filters.minSalary} onChange={(e) => setFilter("minSalary", e.target.value)}
                  placeholder="e.g. 15" className={INPUT} min={0} />
              </Field>
              <Field label="Date posted">
                <select value={form.filters.datePosted} onChange={(e) => setFilter("datePosted", e.target.value)} className={INPUT}>
                  {DATE_POSTED.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </Field>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Company size</p>
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZES.map((s) => (
                  <Chip key={s.id} label={s.label} active={form.filters.companySizes.includes(s.id)}
                    onClick={() => toggleFilter("companySizes", s.id)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Platforms ── */}
        {step === 4 && (
          <div>
            <p className="text-sm text-gray-500 mb-4">Free plan: LinkedIn only. Upgrade for all platforms.</p>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((p) => {
                const selected = form.platforms.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggleArr("platforms", p.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition
                      ${selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                    <div className={`w-8 h-8 rounded-lg ${p.color} text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>
                      {p.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${selected ? "text-indigo-700" : "text-gray-700"}`}>{p.label}</p>
                      <p className={`text-xs ${p.free ? "text-green-600" : "text-amber-500"}`}>{p.free ? "Free ✓" : "Pro only"}</p>
                    </div>
                    {selected && <span className="text-indigo-600 text-sm">✓</span>}
                  </button>
                );
              })}
            </div>
            {form.platforms.some((id) => PLATFORMS.find((p) => p.id === id && !p.free)) && (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                Pro platforms will activate after upgrading.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5: CV ── */}
        {step === 5 && (
          <div>
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
                ${form.cvFile ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 bg-gray-50"}`}>
              {form.cvFile ? (
                <>
                  <div className="text-3xl mb-2">✅</div>
                  <p className="font-medium text-indigo-600">{form.cvFile.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(form.cvFile.size / 1024).toFixed(0)} KB · Click to change</p>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">📄</div>
                  <p className="font-medium text-gray-700">Drop your CV here</p>
                  <p className="text-xs text-gray-400 mt-1">PDF or DOCX · Max 5MB</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden"
              onChange={(e) => setForm((p) => ({ ...p, cvFile: e.target.files?.[0] ?? null }))} />
            <p className="mt-4 text-xs text-gray-400 text-center">No CV yet? Upload later from the dashboard.</p>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button onClick={() => setStep((s) => s - 1)} className="text-sm text-gray-500 hover:text-gray-700 transition">← Back</button>
          ) : <span />}
          {step < STEPS.length - 1 ? (
            <button onClick={next} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition">
              Continue →
            </button>
          ) : (
            <button onClick={submit} disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-60 flex items-center gap-2">
              {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Processing...</> : "Launch My Bot 🚀"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-sm border transition font-medium
        ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const INPUT = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-gray-50";
