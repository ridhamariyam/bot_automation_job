"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";
import { JOB_TYPES, WORK_MODES, EXP_LEVELS, DATE_POSTED, COMPANY_SIZES, DEFAULT_FILTERS } from "../lib/jobFilters";
import { Check, Upload } from "lucide-react";

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

const INPUT = "w-full h-10 px-3.5 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition";
const LBL   = "block text-[13px] font-medium text-slate-700 mb-1.5";

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

  const progress = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="mb-8 text-[22px] font-bold text-slate-900 tracking-tight">
        Job<span className="text-indigo-600">Rocket</span>
      </Link>

      {/* Progress */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                i < step
                  ? "bg-indigo-600 text-white"
                  : i === step
                  ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                  : "bg-white border border-slate-200 text-slate-400"
              }`}>
                {i < step ? <Check size={11} strokeWidth={2.5} /> : i + 1}
              </div>
              <span className={`text-[10.5px] hidden sm:block font-medium ${
                i === step ? "text-indigo-600" : i < step ? "text-slate-500" : "text-slate-300"
              }`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <div className="relative h-1 bg-slate-200 rounded-full">
          <div
            className="absolute top-0 left-0 h-1 bg-indigo-600 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-[18px] font-bold text-slate-900">{STEPS[step].label}</h2>
          <p className="text-[13px] text-slate-400 mt-0.5">Step {step + 1} of {STEPS.length}</p>
        </div>

        {error && (
          <div className="mb-5 text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

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
              <textarea
                rows={4}
                value={form.summary}
                onChange={(e) => setField("summary", e.target.value)}
                placeholder="I'm a software engineer with 3 years of experience in React and Node.js…"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
              />
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
          <div className="space-y-5">
            <div>
              <p className={LBL}>Job type *</p>
              <div className="flex flex-wrap gap-2">
                {JOB_TYPES.map((t) => (
                  <Chip key={t.id} label={t.label} active={form.filters.jobTypes.includes(t.id)}
                    onClick={() => toggleFilter("jobTypes", t.id)} />
                ))}
              </div>
            </div>
            <div>
              <p className={LBL}>Work mode</p>
              <div className="flex flex-wrap gap-2">
                {WORK_MODES.map((m) => (
                  <Chip key={m.id} label={m.label} active={form.filters.workModes.includes(m.id)}
                    onClick={() => toggleFilter("workModes", m.id)} />
                ))}
              </div>
            </div>
            <div>
              <p className={LBL}>Experience level</p>
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
                <select value={form.filters.datePosted} onChange={(e) => setFilter("datePosted", e.target.value)}
                  className={INPUT}>
                  {DATE_POSTED.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </Field>
            </div>
            <div>
              <p className={LBL}>Company size</p>
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
            <p className="text-[13px] text-slate-500 mb-4">LinkedIn is free. All others require a Pro plan.</p>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((p) => {
                const selected = form.platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleArr("platforms", p.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                      selected ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${p.color} text-white text-[11px] font-bold flex items-center justify-center shrink-0`}>
                      {p.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${selected ? "text-indigo-800" : "text-slate-700"}`}>{p.label}</p>
                      <p className={`text-[11px] font-medium ${p.free ? "text-emerald-600" : "text-amber-500"}`}>
                        {p.free ? "Free" : "Pro only"}
                      </p>
                    </div>
                    {selected && <Check size={14} className="text-indigo-600 shrink-0" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
            {form.platforms.some((id) => PLATFORMS.find((p) => p.id === id && !p.free)) && (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-[12.5px] text-amber-700">
                Pro platforms will activate after upgrading your plan.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5: CV ── */}
        {step === 5 && (
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                form.cvFile
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
              }`}
            >
              {form.cvFile ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                    <Check size={22} className="text-indigo-600" strokeWidth={2.5} />
                  </div>
                  <p className="font-semibold text-indigo-700 text-[14px]">{form.cvFile.name}</p>
                  <p className="text-[12px] text-slate-400 mt-1">{(form.cvFile.size / 1024).toFixed(0)} KB · Click to change</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Upload size={20} className="text-slate-400" />
                  </div>
                  <p className="font-semibold text-slate-700 text-[14px]">Drop your CV here</p>
                  <p className="text-[12px] text-slate-400 mt-1">PDF or DOCX · Max 5 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => setForm((p) => ({ ...p, cvFile: e.target.files?.[0] ?? null }))}
            />
            <p className="mt-4 text-[12px] text-slate-400 text-center">
              No CV yet? You can upload later from the dashboard.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-[13px] text-slate-500 hover:text-slate-700 transition font-medium"
            >
              ← Back
            </button>
          ) : <span />}

          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="px-6 h-10 rounded-lg text-[13.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={loading}
              className="flex items-center gap-2 px-6 h-10 rounded-lg text-[13.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
              ) : (
                "Launch My Bot 🚀"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] border font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white border-indigo-600"
          : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
      }`}
    >
      {active && <Check size={11} strokeWidth={2.5} />}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
