"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { EmptyState } from "../components/ui/EmptyState";
import { FileText, Upload, Sparkles, Download, Trash2, Plus, CheckCircle, AlertCircle, X } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL as string;

// ── Types ──────────────────────────────────────────────────────────────────────
type Experience = {
  id?: string; company: string; title: string; location?: string;
  start_date?: string; end_date?: string; current: boolean;
  description?: string; bullets: string[]; sort_order: number;
};
type Project = {
  id?: string; name: string; description?: string;
  tech_stack?: string; url?: string; bullets: string[]; sort_order: number;
};
type Skill = { id?: string; skill: string; category?: string; proficiency?: string; };
type Education = {
  id?: string; institution: string; degree?: string; field?: string;
  start_year?: string; end_year?: string; gpa?: string;
  achievements?: string; sort_order: number;
};
type ResumeData = {
  id?: string; title: string; full_name?: string; email?: string; phone?: string;
  location?: string; linkedin_url?: string; github_url?: string; website_url?: string;
  professional_summary?: string; is_default: boolean;
  experiences: Experience[]; projects: Project[]; skills: Skill[]; educations: Education[];
};
type ResumeListItem = { id: string; title: string; is_default: boolean; updated_at?: string; };

// ── Blank state ────────────────────────────────────────────────────────────────
const blankResume = (): ResumeData => ({
  title: "My Resume", full_name: "", email: "", phone: "", location: "",
  linkedin_url: "", github_url: "", website_url: "",
  professional_summary: "", is_default: false,
  experiences: [], projects: [], skills: [], educations: [],
});

const blankExp  = (): Experience  => ({ company:"", title:"", location:"", start_date:"", end_date:"", current:false, description:"", bullets:[], sort_order:0 });
const blankProj = (): Project     => ({ name:"", description:"", tech_stack:"", url:"", bullets:[], sort_order:0 });
const blankSkill= (): Skill       => ({ skill:"", category:"Languages", proficiency:"Intermediate" });
const blankEdu  = (): Education   => ({ institution:"", degree:"", field:"", start_year:"", end_year:"", gpa:"", achievements:"", sort_order:0 });

const INPUT    = "w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition";
const TEXTAREA = "w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none";
const LBL      = "block text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5";
const SELECT   = "border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 transition";

const TABS = [
  { id:"info",       label:"Personal Info" },
  { id:"summary",    label:"Summary" },
  { id:"skills",     label:"Skills" },
  { id:"experience", label:"Experience" },
  { id:"projects",   label:"Projects" },
  { id:"education",  label:"Education" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function ResumePage() {
  useAuth();
  const router = useRouter();
  const [email, setEmail]         = useState("");
  const [token, setToken]         = useState("");
  const [list, setList]           = useState<ResumeListItem[]>([]);
  const [resume, setResume]       = useState<ResumeData>(blankResume());
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState<{text:string;ok:boolean}|null>(null);
  const [tab, setTab]             = useState<TabId>("info");
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [jobForm, setJobForm]     = useState({ job_title:"", company:"", job_description:"" });
  const [optimizing, setOptimizing]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const flash = (text: string, ok = true) => { setMsg({text, ok}); setTimeout(()=>setMsg(null), 4000); };

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    const tok    = localStorage.getItem("token") || "";
    if (!stored) { router.push("/login"); return; }
    const u = JSON.parse(stored);
    setEmail(u.email);
    setToken(tok);
    fetchList(u.email, tok);
  }, [router]);

  const fetchList = async (e: string, t: string) => {
    try {
      const r = await fetch(`${API}/api/resume/${encodeURIComponent(e)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      setList(Array.isArray(data) ? data : []);
    } catch {}
  };

  const loadResume = async (id: string) => {
    try {
      const r = await fetch(`${API}/api/resume/${encodeURIComponent(email)}/${id}`, { headers: headers() });
      if (!r.ok) throw new Error("Failed to load resume");
      const data = await r.json();
      setResume(data);
      setActiveId(id);
    } catch { flash("Failed to load resume", false); }
  };

  const newResume = () => { setResume(blankResume()); setActiveId(null); };

  const save = async () => {
    setSaving(true);
    try {
      const url    = activeId
        ? `${API}/api/resume/${encodeURIComponent(email)}/${activeId}`
        : `${API}/api/resume/${encodeURIComponent(email)}`;
      const method = activeId ? "PUT" : "POST";
      const r      = await fetch(url, { method, headers: headers(), body: JSON.stringify(resume) });
      const data   = await r.json();
      if (!r.ok) throw new Error(data.detail || data.error || "Save failed");
      setActiveId(data.id);
      setResume(data);
      flash("Resume saved!");
      fetchList(email, token);
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Save failed", false);
    } finally { setSaving(false); }
  };

  const deleteResume = async (id: string) => {
    if (!confirm("Delete this resume?")) return;
    await fetch(`${API}/api/resume/${encodeURIComponent(email)}/${id}`, { method: "DELETE", headers: headers() });
    flash("Deleted");
    if (activeId === id) { setActiveId(null); setResume(blankResume()); }
    fetchList(email, token);
  };

  const downloadFile = async (type: "pdf" | "excel") => {
    if (!activeId) { flash("Save the resume first", false); return; }
    const ext  = type === "pdf" ? "pdf" : "xlsx";
    const url  = `${API}/api/resume/${encodeURIComponent(email)}/${activeId}/${type}`;
    const r    = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { flash("Download failed", false); return; }
    const blob = await r.blob();
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `resume.${ext}`;
    a.click();
  };

  const uploadPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    flash("Parsing CV with AI…", true);
    try {
      const r = await fetch(`${API}/api/resume/${encodeURIComponent(email)}/parse`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Parse failed");
      setResume(data);
      setActiveId(data.id);
      flash("CV parsed and imported!");
      fetchList(email, token);
    } catch (ex: unknown) {
      flash(ex instanceof Error ? ex.message : "Parse failed", false);
    }
  };

  const optimizeResume = async () => {
    if (!activeId) { flash("Save resume first", false); return; }
    setOptimizing(true);
    try {
      const r = await fetch(`${API}/api/resume/${encodeURIComponent(email)}/${activeId}/optimize`, {
        method: "POST", headers: headers(), body: JSON.stringify(jobForm),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Optimization failed");
      setResume(data);
      setActiveId(data.id);
      setOptimizeOpen(false);
      flash("New tailored resume created!");
      fetchList(email, token);
    } catch (ex: unknown) {
      flash(ex instanceof Error ? ex.message : "Optimization failed", false);
    } finally { setOptimizing(false); }
  };

  // ── Field helpers ────────────────────────────────────────────────────────────
  const set = (field: keyof ResumeData, val: unknown) =>
    setResume(r => ({ ...r, [field]: val }));

  const addExp    = () => setResume(r => ({ ...r, experiences: [...r.experiences, blankExp()] }));
  const removeExp = (i: number) => setResume(r => ({ ...r, experiences: r.experiences.filter((_,j)=>j!==i) }));
  const setExp    = (i: number, field: keyof Experience, val: unknown) =>
    setResume(r => { const a = [...r.experiences]; (a[i] as Record<string, unknown>)[field] = val; return { ...r, experiences: a }; });

  const addProj    = () => setResume(r => ({ ...r, projects: [...r.projects, blankProj()] }));
  const removeProj = (i: number) => setResume(r => ({ ...r, projects: r.projects.filter((_,j)=>j!==i) }));
  const setProj    = (i: number, field: keyof Project, val: unknown) =>
    setResume(r => { const a = [...r.projects]; (a[i] as Record<string, unknown>)[field] = val; return { ...r, projects: a }; });

  const addSkill    = () => setResume(r => ({ ...r, skills: [...r.skills, blankSkill()] }));
  const removeSkill = (i: number) => setResume(r => ({ ...r, skills: r.skills.filter((_,j)=>j!==i) }));
  const setSkill    = (i: number, field: keyof Skill, val: string) =>
    setResume(r => { const a = [...r.skills]; (a[i] as Record<string, string>)[field] = val; return { ...r, skills: a }; });

  const addEdu    = () => setResume(r => ({ ...r, educations: [...r.educations, blankEdu()] }));
  const removeEdu = (i: number) => setResume(r => ({ ...r, educations: r.educations.filter((_,j)=>j!==i) }));
  const setEdu    = (i: number, field: keyof Education, val: unknown) =>
    setResume(r => { const a = [...r.educations]; (a[i] as Record<string, unknown>)[field] = val; return { ...r, educations: a }; });

  return (
    <>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={uploadPDF} />

      <DashboardLayout
        title="Resume Lab"
        actions={
          <button
            onClick={save}
            disabled={saving}
            className="px-4 h-8 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : "Save resume"}
          </button>
        }
      >
        <div className="grid lg:grid-cols-[220px_1fr] gap-4">

          {/* Left: resume list */}
          <aside className="lg:sticky lg:top-0">
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-slate-900">My Resumes</p>
                <button
                  onClick={newResume}
                  className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 transition"
                >
                  <Plus size={13} /> New
                </button>
              </div>

              {list.length === 0 ? (
                <p className="text-[12px] text-slate-400 text-center py-6 leading-relaxed">
                  No resumes yet. Create one or import a CV.
                </p>
              ) : (
                <div className="space-y-1">
                  {list.map(r => (
                    <div
                      key={r.id}
                      onClick={() => loadResume(r.id)}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                        activeId === r.id
                          ? "bg-indigo-50 border border-indigo-200"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-medium truncate ${activeId === r.id ? "text-indigo-900" : "text-slate-800"}`}>
                          {r.title}
                        </p>
                        {r.is_default && (
                          <span className="text-[11px] text-indigo-500 font-medium">Default</span>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteResume(r.id); }}
                        className="ml-2 text-slate-300 hover:text-red-400 transition shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Secondary actions */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 h-8 rounded-lg text-[12.5px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <Upload size={12} /> Import CV
                </button>
                <button
                  onClick={() => setOptimizeOpen(true)}
                  disabled={!activeId}
                  className="w-full flex items-center justify-center gap-2 h-8 rounded-lg text-[12.5px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 transition-colors"
                >
                  <Sparkles size={12} /> AI Tailor
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadFile("pdf")}
                    disabled={!activeId}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <Download size={11} /> PDF
                  </button>
                  <button
                    onClick={() => downloadFile("excel")}
                    disabled={!activeId}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <Download size={11} /> Excel
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Right: editor */}
          <main className="space-y-4 min-w-0">
            {/* Resume title + default toggle */}
            <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <input
                value={resume.title}
                onChange={e => set("title", e.target.value)}
                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 bg-white text-[14px] font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="Resume title (e.g. Software Engineer Resume)"
              />
              <label className="flex items-center gap-2 text-[13px] text-slate-600 cursor-pointer whitespace-nowrap shrink-0">
                <input
                  type="checkbox"
                  checked={resume.is_default}
                  onChange={e => set("is_default", e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-600"
                />
                Set as default
              </label>
            </div>

            {/* Tab bar + content */}
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              {/* Tab bar */}
              <div className="flex gap-1 p-1.5 border-b border-slate-100 overflow-x-auto shrink-0">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                      tab === t.id
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-5 space-y-4">

                {/* Personal Info */}
                {tab === "info" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {([
                      ["full_name","Full Name","text"],["email","Email","email"],
                      ["phone","Phone","tel"],["location","Location / City","text"],
                      ["linkedin_url","LinkedIn URL","url"],["github_url","GitHub URL","url"],
                      ["website_url","Portfolio / Website","url"],
                    ] as [keyof ResumeData, string, string][]).map(([field, label, type]) => (
                      <div key={field}>
                        <label className={LBL}>{label}</label>
                        <input
                          type={type}
                          value={(resume[field] as string) || ""}
                          onChange={e => set(field, e.target.value)}
                          className={INPUT}
                          placeholder={label}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary */}
                {tab === "summary" && (
                  <div>
                    <label className={LBL}>Professional Summary</label>
                    <textarea
                      value={resume.professional_summary || ""}
                      onChange={e => set("professional_summary", e.target.value)}
                      rows={7}
                      className={TEXTAREA}
                      placeholder="Write a 2–3 sentence professional summary highlighting your expertise and goals…"
                    />
                    <p className="text-[11.5px] text-slate-400 mt-1.5">
                      {(resume.professional_summary || "").length} characters
                    </p>
                  </div>
                )}

                {/* Skills */}
                {tab === "skills" && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] text-slate-500">Group your skills by category.</p>
                      <button
                        onClick={addSkill}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      >
                        <Plus size={13} /> Add Skill
                      </button>
                    </div>
                    {resume.skills.length === 0 ? (
                      <EmptyState
                        icon={<FileText size={18} />}
                        title="No skills added"
                        description="Click Add Skill to start building your skills list."
                      />
                    ) : (
                      <div className="space-y-2">
                        {resume.skills.map((sk, i) => (
                          <div key={i} className="flex gap-3 items-center bg-slate-50 rounded-lg p-2.5">
                            <input
                              value={sk.skill}
                              onChange={e => setSkill(i,"skill",e.target.value)}
                              className={`flex-1 ${INPUT}`}
                              placeholder="Skill name"
                            />
                            <select
                              value={sk.category || ""}
                              onChange={e => setSkill(i,"category",e.target.value)}
                              className={SELECT}
                            >
                              {["Languages","Frameworks","Tools","Databases","Cloud","DevOps","Other"].map(c=>(
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <select
                              value={sk.proficiency || ""}
                              onChange={e => setSkill(i,"proficiency",e.target.value)}
                              className={SELECT}
                            >
                              {["Expert","Intermediate","Beginner"].map(p=>(
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeSkill(i)}
                              className="text-slate-300 hover:text-red-400 transition shrink-0"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Experience */}
                {tab === "experience" && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] text-slate-500">Most recent first.</p>
                      <button
                        onClick={addExp}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      >
                        <Plus size={13} /> Add Experience
                      </button>
                    </div>
                    {resume.experiences.length === 0 ? (
                      <EmptyState
                        icon={<FileText size={18} />}
                        title="No experience added"
                        description="Click Add Experience to get started."
                      />
                    ) : (
                      <div className="space-y-4">
                        {resume.experiences.map((exp, i) => (
                          <div key={i} className="border border-slate-100 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[13.5px] font-semibold text-slate-800">
                                {exp.title || exp.company || `Experience ${i+1}`}
                              </p>
                              <button
                                onClick={() => removeExp(i)}
                                className="text-[12px] text-slate-400 hover:text-red-500 transition"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {([
                                ["title","Job Title"],["company","Company"],
                                ["location","Location"],["start_date","Start (e.g. Jan 2022)"],
                                ["end_date","End (leave blank if current)"]
                              ] as [keyof Experience,string][]).map(([f,lbl])=>(
                                <div key={f}>
                                  <label className={LBL}>{lbl}</label>
                                  <input
                                    value={(exp[f] as string)||""}
                                    onChange={e=>setExp(i,f,e.target.value)}
                                    disabled={f==="end_date" && exp.current}
                                    className={`${INPUT} disabled:bg-slate-50 disabled:text-slate-400`}
                                    placeholder={lbl}
                                  />
                                </div>
                              ))}
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="checkbox"
                                  id={`cur${i}`}
                                  checked={exp.current}
                                  onChange={e=>setExp(i,"current",e.target.checked)}
                                  className="w-4 h-4 rounded accent-indigo-600"
                                />
                                <label htmlFor={`cur${i}`} className="text-[13px] text-slate-600 cursor-pointer">
                                  Currently working here
                                </label>
                              </div>
                            </div>
                            <div>
                              <label className={LBL}>Bullet Points (one per line)</label>
                              <textarea
                                value={(exp.bullets||[]).join("\n")}
                                onChange={e=>setExp(i,"bullets",e.target.value.split("\n").filter(Boolean))}
                                rows={4}
                                className={TEXTAREA}
                                placeholder={"• Built X that improved Y by Z%\n• Led a team of N engineers…\n• Reduced latency by 40% through…"}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Projects */}
                {tab === "projects" && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] text-slate-500">Highlight your key projects.</p>
                      <button
                        onClick={addProj}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      >
                        <Plus size={13} /> Add Project
                      </button>
                    </div>
                    {resume.projects.length === 0 ? (
                      <EmptyState
                        icon={<FileText size={18} />}
                        title="No projects added"
                        description="Click Add Project to showcase your work."
                      />
                    ) : (
                      <div className="space-y-4">
                        {resume.projects.map((proj, i) => (
                          <div key={i} className="border border-slate-100 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[13.5px] font-semibold text-slate-800">{proj.name || `Project ${i+1}`}</p>
                              <button onClick={() => removeProj(i)} className="text-[12px] text-slate-400 hover:text-red-500 transition">
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {([["name","Project Name"],["tech_stack","Tech Stack"],["url","Project URL"]] as [keyof Project,string][]).map(([f,lbl])=>(
                                <div key={f}>
                                  <label className={LBL}>{lbl}</label>
                                  <input
                                    value={(proj[f] as string)||""}
                                    onChange={e=>setProj(i,f,e.target.value)}
                                    className={INPUT}
                                    placeholder={lbl}
                                  />
                                </div>
                              ))}
                            </div>
                            <div>
                              <label className={LBL}>Bullet Points (one per line)</label>
                              <textarea
                                value={(proj.bullets||[]).join("\n")}
                                onChange={e=>setProj(i,"bullets",e.target.value.split("\n").filter(Boolean))}
                                rows={3}
                                className={TEXTAREA}
                                placeholder={"• Developed X using React and FastAPI\n• Achieved Y users within Z months"}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Education */}
                {tab === "education" && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] text-slate-500">Add your educational background.</p>
                      <button
                        onClick={addEdu}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      >
                        <Plus size={13} /> Add Education
                      </button>
                    </div>
                    {resume.educations.length === 0 ? (
                      <EmptyState
                        icon={<FileText size={18} />}
                        title="No education added"
                        description="Click Add Education to add your qualifications."
                      />
                    ) : (
                      <div className="space-y-4">
                        {resume.educations.map((edu, i) => (
                          <div key={i} className="border border-slate-100 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[13.5px] font-semibold text-slate-800">
                                {edu.institution || `Education ${i+1}`}
                              </p>
                              <button onClick={() => removeEdu(i)} className="text-[12px] text-slate-400 hover:text-red-500 transition">
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {([
                                ["institution","University / School"],["degree","Degree (B.Sc., M.Tech, etc.)"],
                                ["field","Field of Study"],["start_year","Start Year"],
                                ["end_year","End Year"],["gpa","GPA (optional)"],
                              ] as [keyof Education,string][]).map(([f,lbl])=>(
                                <div key={f}>
                                  <label className={LBL}>{lbl}</label>
                                  <input
                                    value={(edu[f] as string)||""}
                                    onChange={e=>setEdu(i,f,e.target.value)}
                                    className={INPUT}
                                    placeholder={lbl}
                                  />
                                </div>
                              ))}
                              <div className="col-span-1 sm:col-span-2">
                                <label className={LBL}>Achievements (optional)</label>
                                <input
                                  value={edu.achievements||""}
                                  onChange={e=>setEdu(i,"achievements",e.target.value)}
                                  className={INPUT}
                                  placeholder="Dean's List, scholarship, thesis title, etc."
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </main>
        </div>

        {/* Toast */}
        {msg && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-[13.5px] font-medium text-white transition-all ${
            msg.ok ? "bg-emerald-600" : "bg-red-600"
          }`}>
            {msg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            {msg.text}
          </div>
        )}
      </DashboardLayout>

      {/* AI Tailor Modal */}
      {optimizeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setOptimizeOpen(false); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900">AI Tailor Resume</h2>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  Paste a job description — AI rewrites your bullets to match it. Your original is kept.
                </p>
              </div>
              <button
                onClick={() => setOptimizeOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={LBL}>Job Title</label>
                <input
                  value={jobForm.job_title}
                  onChange={e=>setJobForm(f=>({...f,job_title:e.target.value}))}
                  className={INPUT}
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>
              <div>
                <label className={LBL}>Company</label>
                <input
                  value={jobForm.company}
                  onChange={e=>setJobForm(f=>({...f,company:e.target.value}))}
                  className={INPUT}
                  placeholder="e.g. Google"
                />
              </div>
              <div>
                <label className={LBL}>Job Description</label>
                <textarea
                  value={jobForm.job_description}
                  onChange={e=>setJobForm(f=>({...f,job_description:e.target.value}))}
                  rows={7}
                  className={TEXTAREA}
                  placeholder="Paste the full job description here…"
                />
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <button
                  onClick={() => setOptimizeOpen(false)}
                  className="px-4 h-9 text-[13px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={optimizeResume}
                  disabled={optimizing || !jobForm.job_title || !jobForm.job_description}
                  className="flex items-center gap-2 px-5 h-9 text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {optimizing ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Tailoring…</>
                  ) : (
                    <><Sparkles size={13} /> Tailor Resume</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
