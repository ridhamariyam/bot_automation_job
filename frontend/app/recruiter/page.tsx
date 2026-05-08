"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";
import { apiFetch } from "../lib/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { Users, Phone, MessageCircle, Mail, ExternalLink, CheckCircle } from "lucide-react";

type Recruiter = {
  id: string;
  recruiter_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  post_url: string | null;
  post_text: string | null;
  inferred_title: string | null;
  platform: string;
  status: string;
  whatsapp_sent_at: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending_call:   "Pending",
  called:         "Called",
  whatsapp_sent:  "WhatsApp Sent",
  replied:        "Replied",
  ignored:        "Ignored",
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "info"> = {
  pending_call:  "warning",
  called:        "info",
  whatsapp_sent: "info",
  replied:       "success",
  ignored:       "muted",
};

export default function RecruiterPage() {
  useAuth();
  const router = useRouter();
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [sendingWa, setSendingWa] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    if (!stored) { router.push("/login"); return; }
    const u = JSON.parse(stored);
    setEmail(u.email);
    apiFetch<Recruiter[]>(`/api/recruiter/list?email=${encodeURIComponent(u.email)}`)
      .then(d => setRecruiters(Array.isArray(d) ? d : []))
      .catch(() => setRecruiters([]))
      .finally(() => setLoading(false));
  }, [router]);

  async function sendWhatsApp(r: Recruiter) {
    const user = JSON.parse(localStorage.getItem("jobrocket_user") ?? "{}");
    const phone = r.whatsapp || r.phone;
    if (!phone) { showToast("No phone number available for this recruiter.", false); return; }
    setSendingWa(r.id);
    try {
      const res = await apiFetch(`/api/recruiter/whatsapp`, {
        method: "POST",
        body: JSON.stringify({
          user_email: email,
          recruiter_id: r.id,
          phone,
          recruiter_name: r.recruiter_name,
          user_name: user.name,
        }),
      }) as { success?: boolean; message?: string };
      if (res.success) {
        showToast("WhatsApp message sent.", true);
        setRecruiters(prev => prev.map(x =>
          x.id === r.id ? { ...x, status: "whatsapp_sent", whatsapp_sent_at: new Date().toISOString() } : x
        ));
      } else {
        showToast(res.message ?? "Failed to send message.", false);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to send message.", false);
    } finally {
      setSendingWa(null);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await apiFetch(`/api/recruiter/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setRecruiters(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {
      showToast("Failed to update status.", false);
    }
  }

  return (
    <DashboardLayout title="Recruiters">
      <div className="mb-5">
        <p className="text-[13.5px] text-slate-500">
          Recruiters detected from LinkedIn hiring posts. Contact them directly to accelerate your search.
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : recruiters.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="No recruiters found yet"
          description="The bot detects recruiters from LinkedIn hiring posts as it runs. Start the bot to collect contacts."
          action={
            <a href="/scoring" className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              Go to Automation
            </a>
          }
        />
      ) : (
        <>
          <p className="text-[12.5px] text-slate-400 mb-4">{recruiters.length} recruiter{recruiters.length !== 1 ? "s" : ""} found</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {recruiters.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-100 p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-slate-900 truncate">
                      {r.recruiter_name || "Unknown Recruiter"}
                    </p>
                    {r.inferred_title && (
                      <p className="text-[12px] text-slate-500 truncate mt-0.5">{r.inferred_title}</p>
                    )}
                    <p className="text-[11.5px] text-slate-400 mt-0.5 capitalize">{r.platform.replace("_", " ")}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "default"}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </div>

                {/* Contact info */}
                <div className="space-y-1.5 mb-4">
                  {(r.whatsapp || r.phone) && (
                    <div className="flex items-center gap-2 text-[13px] text-slate-600">
                      <Phone size={13} className="text-slate-400 shrink-0" />
                      {r.whatsapp || r.phone}
                    </div>
                  )}
                  {r.email && (
                    <div className="flex items-center gap-2 text-[13px] text-slate-600">
                      <Mail size={13} className="text-slate-400 shrink-0" />
                      {r.email}
                    </div>
                  )}
                </div>

                {/* Post snippet */}
                {r.post_text && (
                  <div className="bg-slate-50 rounded-lg px-3 py-2.5 mb-4">
                    <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{r.post_text}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {(r.whatsapp || r.phone) && (
                    <button
                      onClick={() => sendWhatsApp(r)}
                      disabled={sendingWa === r.id || r.status === "whatsapp_sent"}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {r.status === "whatsapp_sent" ? (
                        <><CheckCircle size={13} /> Sent</>
                      ) : (
                        <><MessageCircle size={13} /> {sendingWa === r.id ? "Sending…" : "WhatsApp"}</>
                      )}
                    </button>
                  )}
                  {r.post_url && (
                    <a
                      href={r.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <ExternalLink size={12} /> View post
                    </a>
                  )}
                  <select
                    value={r.status}
                    onChange={e => updateStatus(r.id, e.target.value)}
                    className="ml-auto text-[11.5px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition cursor-pointer"
                  >
                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                {r.whatsapp_sent_at && (
                  <p className="text-[11px] text-slate-400 mt-3">
                    Sent {new Date(r.whatsapp_sent_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-[13.5px] font-medium text-white transition-all ${
          toast.ok ? "bg-emerald-600" : "bg-red-600"
        }`}>
          {toast.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
  );
}

function AlertCircle({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
