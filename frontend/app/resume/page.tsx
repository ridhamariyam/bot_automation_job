"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";

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
  const [tab, setTab]             = useState<"info"|"summary"|"skills"|"experience"|"projects"|"education">("info");
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
      const data = await r.json();
      setList(Array.isArray(data) ? data : []);
    } catch {}
  };

  const loadResume = async (id: string) => {
    try {
      const r = await fetch(`${API}/api/resume/${encodeURIComponent(email)}/${id}`, { headers: headers() });
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
    const ext     = type === "pdf" ? "pdf" : "xlsx";
    const mime    = type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const url     = `${API}/api/resume/${encodeURIComponent(email)}/${activeId}/${type}`;
    const r       = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { flash("Download failed", false); return; }
    const blob    = await r.blob();
    const a       = document.createElement("a");
    a.href        = URL.createObjectURL(blob);
    a.download    = `resume.${ext}`;
    a.click();
  };

  const uploadPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    flash("Parsing CV with AI...", true);
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
    setResume(r => { const a = [...r.experiences]; (a[i] as any)[field] = val; return { ...r, experiences: a }; });

  const addProj    = () => setResume(r => ({ ...r, projects: [...r.projects, blankProj()] }));
  const removeProj = (i: number) => setResume(r => ({ ...r, projects: r.projects.filter((_,j)=>j!==i) }));
  const setProj    = (i: number, field: keyof Project, val: unknown) =>
    setResume(r => { const a = [...r.projects]; (a[i] as any)[field] = val; return { ...r, projects: a }; });

  const addSkill    = () => setResume(r => ({ ...r, skills: [...r.skills, blankSkill()] }));
  const removeSkill = (i: number) => setResume(r => ({ ...r, skills: r.skills.filter((_,j)=>j!==i) }));
  const setSkill    = (i: number, field: keyof Skill, val: string) =>
    setResume(r => { const a = [...r.skills]; (a[i] as any)[field] = val; return { ...r, skills: a }; });

  const addEdu    = () => setResume(r => ({ ...r, educations: [...r.educations, blankEdu()] }));
  const removeEdu = (i: number) => setResume(r => ({ ...r, educations: r.educations.filter((_,j)=>j!==i) }));
  const setEdu    = (i: number, field: keyof Education, val: unknown) =>
    setResume(r => { const a = [...r.educations]; (a[i] as any)[field] = val; return { ...r, educations: a }; });

  const TABS = [
    { id:"info",       label:"Personal Info" },
    { id:"summary",    label:"Summary" },
    { id:"skills",     label:"Skills" },
    { id:"experience", label:"Experience" },
    { id:"projects",   label:"Projects" },
    { id:"education",  label:"Education" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Resume Builder</h1>
            <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Build, tailor, and export your professional resume</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Link href="/dashboard" className="text-sm text-blue-600 hover:underline shrink-0">← Dashboard</Link>
            <button onClick={() => fileRef.current?.click()}
              className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium transition shrink-0">
              Import CV
            </button>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={uploadPDF} />
            <button onClick={() => setOptimizeOpen(true)}
              className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium transition shrink-0">
              AI Tailor
            </button>
            <button onClick={() => downloadFile("pdf")}
              className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium transition shrink-0">
              PDF
            </button>
            <button onClick={() => downloadFile("excel")}
              className="hidden sm:block text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition shrink-0">
              Excel
            </button>
            <button onClick={save} disabled={saving}
              className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-1.5 rounded-lg font-semibold transition shrink-0">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </header>

      {msg && (
        <div className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium
          ${msg.ok ? "bg-green-600" : "bg-red-600"}`}>
          {msg.text}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 sm:gap-6">
        {/* Sidebar: resume list */}
        <aside>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">My Resumes</h2>
              <button onClick={newResume}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-md font-medium transition">
                + New
              </button>
            </div>
            <div className="space-y-2">
              {list.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No resumes yet. Create one or import a CV.</p>
              )}
              {list.map(r => (
                <div key={r.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition
                    ${activeId === r.id ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50 border border-transparent"}`}
                  onClick={() => loadResume(r.id)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                    {r.is_default && <span className="text-xs text-blue-600">Default</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteResume(r.id); }}
                    className="text-gray-400 hover:text-red-500 text-xs ml-2 shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Editor */}
        <main className="space-y-4">
          {/* Resume title + default toggle */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex gap-4 items-center">
            <input value={resume.title} onChange={e => set("title", e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Resume title (e.g. Software Engineer Resume)" />
            <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
              <input type="checkbox" checked={resume.is_default}
                onChange={e => set("is_default", e.target.checked)}
                className="rounded" />
              Set as default
            </label>
          </div>

          {/* Tab bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition
                    ${tab === t.id ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-4">

              {/* Personal Info */}
              {tab === "info" && (
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ["full_name","Full Name","text"],["email","Email","email"],
                    ["phone","Phone","tel"],["location","Location / City","text"],
                    ["linkedin_url","LinkedIn URL","url"],["github_url","GitHub URL","url"],
                    ["website_url","Portfolio / Website","url"],
                  ] as [keyof ResumeData, string, string][]).map(([field, label, type]) => (
                    <div key={field}>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{label}</label>
                      <input type={type} value={(resume[field] as string) || ""}
                        onChange={e => set(field, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={label} />
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {tab === "summary" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Professional Summary</label>
                  <textarea value={resume.professional_summary || ""}
                    onChange={e => set("professional_summary", e.target.value)}
                    rows={6}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Write a 2–3 sentence professional summary highlighting your expertise and goals..." />
                  <p className="text-xs text-gray-400 mt-1">{(resume.professional_summary || "").length} chars</p>
                </div>
              )}

              {/* Skills */}
              {tab === "skills" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm text-gray-600">Add your technical skills grouped by category.</p>
                    <button onClick={addSkill}
                      className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">
                      + Add Skill
                    </button>
                  </div>
                  <div className="space-y-2">
                    {resume.skills.map((sk, i) => (
                      <div key={i} className="flex gap-3 items-center bg-gray-50 rounded-lg p-2">
                        <input value={sk.skill} onChange={e => setSkill(i,"skill",e.target.value)}
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Skill name" />
                        <select value={sk.category || ""} onChange={e => setSkill(i,"category",e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                          {["Languages","Frameworks","Tools","Databases","Cloud","DevOps","Other"].map(c=>(
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <select value={sk.proficiency || ""} onChange={e => setSkill(i,"proficiency",e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                          {["Expert","Intermediate","Beginner"].map(p=>(
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <button onClick={() => removeSkill(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                      </div>
                    ))}
                    {resume.skills.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">No skills added. Click "+ Add Skill".</p>
                    )}
                  </div>
                </div>
              )}

              {/* Experience */}
              {tab === "experience" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm text-gray-600">List your professional experience, most recent first.</p>
                    <button onClick={addExp}
                      className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">
                      + Add Experience
                    </button>
                  </div>
                  <div className="space-y-4">
                    {resume.experiences.map((exp, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between">
                          <h3 className="font-medium text-gray-800 text-sm">{exp.title || exp.company || `Experience ${i+1}`}</h3>
                          <button onClick={() => removeExp(i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {([["title","Job Title"],["company","Company"],["location","Location"],["start_date","Start (e.g. Jan 2022)"],["end_date","End (leave blank if current)"]] as [keyof Experience,string][]).map(([f,lbl])=>(
                            <div key={f}>
                              <label className="block text-xs text-gray-500 mb-0.5">{lbl}</label>
                              <input value={(exp[f] as string)||""} onChange={e=>setExp(i,f,e.target.value)}
                                disabled={f==="end_date" && exp.current}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                placeholder={lbl} />
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-4">
                            <input type="checkbox" id={`cur${i}`} checked={exp.current} onChange={e=>setExp(i,"current",e.target.checked)} />
                            <label htmlFor={`cur${i}`} className="text-sm text-gray-600">Currently working here</label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Bullet Points (one per line)</label>
                          <textarea value={(exp.bullets||[]).join("\n")}
                            onChange={e=>setExp(i,"bullets",e.target.value.split("\n").filter(Boolean))}
                            rows={4} placeholder={"• Built X that improved Y by Z%\n• Led a team of N engineers...\n• Reduced latency by 40% through..."}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                        </div>
                      </div>
                    ))}
                    {resume.experiences.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">No experience added yet.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Projects */}
              {tab === "projects" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm text-gray-600">Highlight your key projects.</p>
                    <button onClick={addProj}
                      className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">
                      + Add Project
                    </button>
                  </div>
                  <div className="space-y-4">
                    {resume.projects.map((proj, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between">
                          <h3 className="font-medium text-gray-800 text-sm">{proj.name || `Project ${i+1}`}</h3>
                          <button onClick={() => removeProj(i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {([["name","Project Name"],["tech_stack","Tech Stack"],["url","Project URL"]] as [keyof Project,string][]).map(([f,lbl])=>(
                            <div key={f}>
                              <label className="block text-xs text-gray-500 mb-0.5">{lbl}</label>
                              <input value={(proj[f] as string)||""} onChange={e=>setProj(i,f,e.target.value)}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder={lbl} />
                            </div>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Bullet Points (one per line)</label>
                          <textarea value={(proj.bullets||[]).join("\n")}
                            onChange={e=>setProj(i,"bullets",e.target.value.split("\n").filter(Boolean))}
                            rows={3} placeholder={"• Developed X using React and FastAPI\n• Achieved Y users within Z months"}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                        </div>
                      </div>
                    ))}
                    {resume.projects.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">No projects added yet.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Education */}
              {tab === "education" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm text-gray-600">Add your educational background.</p>
                    <button onClick={addEdu}
                      className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">
                      + Add Education
                    </button>
                  </div>
                  <div className="space-y-4">
                    {resume.educations.map((edu, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex justify-between mb-3">
                          <h3 className="font-medium text-gray-800 text-sm">{edu.institution || `Education ${i+1}`}</h3>
                          <button onClick={() => removeEdu(i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            ["institution","University / School"],["degree","Degree (B.Sc., M.Tech, etc.)"],
                            ["field","Field of Study"],["start_year","Start Year"],
                            ["end_year","End Year"],["gpa","GPA (optional)"],
                          ] as [keyof Education,string][]).map(([f,lbl])=>(
                            <div key={f}>
                              <label className="block text-xs text-gray-500 mb-0.5">{lbl}</label>
                              <input value={(edu[f] as string)||""} onChange={e=>setEdu(i,f,e.target.value)}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder={lbl} />
                            </div>
                          ))}
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-0.5">Achievements (optional)</label>
                            <input value={edu.achievements||""} onChange={e=>setEdu(i,"achievements",e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Dean's List, scholarship, thesis title, etc." />
                          </div>
                        </div>
                      </div>
                    ))}
                    {resume.educations.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">No education added yet.</p>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </main>
      </div>

      {/* AI Tailor Modal */}
      {optimizeOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">AI-Tailor Resume for a Job</h2>
            <p className="text-sm text-gray-500">
              Paste the job description and GPT-4o will rewrite your bullets and summary to match it.
              A new resume version is created — your original is kept.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Job Title</label>
              <input value={jobForm.job_title} onChange={e=>setJobForm(f=>({...f,job_title:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="e.g. Senior Software Engineer" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Company</label>
              <input value={jobForm.company} onChange={e=>setJobForm(f=>({...f,company:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="e.g. Google" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Job Description</label>
              <textarea value={jobForm.job_description} onChange={e=>setJobForm(f=>({...f,job_description:e.target.value}))}
                rows={6} placeholder="Paste the full job description here..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setOptimizeOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">
                Cancel
              </button>
              <button onClick={optimizeResume} disabled={optimizing || !jobForm.job_title || !jobForm.job_description}
                className="px-5 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition">
                {optimizing ? "Tailoring..." : "Tailor Resume"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
