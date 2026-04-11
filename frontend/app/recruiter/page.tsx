"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";

type RecruiterContact = {
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

type Stats = {
  total: number;
  pending_call: number;
  whatsapp_sent: number;
  by_status: Record<string, number>;
};

const API = process.env.NEXT_PUBLIC_API_URL as string;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_call:  { label: "Call Pending",    color: "bg-amber-100 text-amber-700" },
  called:        { label: "Called",          color: "bg-blue-100 text-blue-700" },
  whatsapp_sent: { label: "WhatsApp Sent",   color: "bg-green-100 text-green-700" },
  replied:       { label: "Replied",         color: "bg-purple-100 text-purple-700" },
  ignored:       { label: "Ignored",         color: "bg-gray-100 text-gray-500" },
};

export default function RecruiterPage() {
  useAuth();

  const [email, setEmail]         = useState("");
  const [contacts, setContacts]   = useState<RecruiterContact[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [filter, setFilter]       = useState("pending_call");
  const [scanning, setScanning]   = useState(false);
  const [sending, setSending]     = useState<string | null>(null);
  const [scanMsg, setScanMsg]     = useState("");
  const [loading, setLoading]     = useState(true);

  const load = async (userEmail: string, statusFilter: string) => {
    try {
      const [contactsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/recruiter/${encodeURIComponent(userEmail)}?status=${statusFilter}`,
          { headers: authHeaders() }),
        fetch(`${API}/api/recruiter/${encodeURIComponent(userEmail)}/stats`,
          { headers: authHeaders() }),
      ]);
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (statsRes.ok)    setStats(await statsRes.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    if (!stored) return;
    const u = JSON.parse(stored);
    setEmail(u.email);
    load(u.email, filter);
  }, []);

  const handleFilterChange = (f: string) => {
    setFilter(f);
    if (email) load(email, f);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`${API}/api/recruiter/${id}`, {
      method:  "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    if (email) load(email, filter);
  };

  const sendWhatsApp = async (contact: RecruiterContact) => {
    setSending(contact.id);
    try {
      const res = await fetch(`${API}/api/recruiter/send-whatsapp`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ contact_id: contact.id, user_email: email }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`WhatsApp sent to ${contact.phone || contact.whatsapp}`);
        if (email) load(email, filter);
      } else {
        alert(`Failed: ${data.error || data.detail}`);
      }
    } finally {
      setSending(null);
    }
  };

  const scanFeed = async () => {
    setScanning(true);
    setScanMsg("");
    try {
      const res = await fetch(`${API}/api/recruiter/scan-feed`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ user_email: email, max_posts: 30 }),
      });
      const data = await res.json();
      setScanMsg(data.message || "Scan started.");
      // Reload after 15s
      setTimeout(() => email && load(email, filter), 15000);
    } catch {
      setScanMsg("Scan request failed.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recruiter Contacts</h1>
            <p className="text-sm text-gray-500">Hiring posts detected by the bot</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-900">Dashboard</Link>
            <Link href="/settings"  className="text-gray-500 hover:text-gray-900">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Found",     value: stats.total,         color: "text-blue-600" },
              { label: "Pending Call",    value: stats.pending_call,  color: "text-amber-600" },
              { label: "WhatsApp Sent",   value: stats.whatsapp_sent, color: "text-green-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 text-center">
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Scan + Filter toolbar */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3">
          <button
            onClick={scanFeed}
            disabled={scanning || !email}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
          >
            {scanning ? "Scanning…" : "Scan LinkedIn Feed"}
          </button>

          {scanMsg && (
            <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full">
              {scanMsg}
            </span>
          )}

          <div className="ml-auto flex gap-2">
            {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filter === key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => handleFilterChange("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === ""
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* Contact cards */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading contacts…</div>
        ) : contacts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-gray-500 text-lg mb-2">No recruiter contacts yet.</p>
            <p className="text-gray-400 text-sm mb-6">
              Run the bot or click "Scan LinkedIn Feed" to find hiring posts.
            </p>
            <button
              onClick={scanFeed}
              disabled={scanning || !email}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg text-sm"
            >
              Scan Now
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="bg-white rounded-xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-start gap-4"
              >
                {/* Left — recruiter info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900 truncate">
                      {contact.recruiter_name || "Unknown Recruiter"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_LABELS[contact.status]?.color || "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {STATUS_LABELS[contact.status]?.label || contact.status}
                    </span>
                  </div>

                  {contact.inferred_title && (
                    <p className="text-sm text-blue-700 font-medium mb-1">
                      {contact.inferred_title}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-blue-600">
                        <span>📞</span> {contact.phone}
                      </a>
                    )}
                    {contact.whatsapp && (
                      <a
                        href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-green-600"
                      >
                        <span>💬</span> WhatsApp
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-blue-600">
                        <span>✉️</span> {contact.email}
                      </a>
                    )}
                    {contact.post_url && (
                      <a
                        href={contact.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-blue-600"
                      >
                        <span>🔗</span> View Post
                      </a>
                    )}
                  </div>

                  {contact.post_text && (
                    <p className="text-xs text-gray-400 line-clamp-2">{contact.post_text}</p>
                  )}

                  <p className="text-xs text-gray-300 mt-1">
                    Found {new Date(contact.created_at).toLocaleDateString()}
                    {contact.whatsapp_sent_at &&
                      ` · WhatsApp sent ${new Date(contact.whatsapp_sent_at).toLocaleDateString()}`}
                  </p>
                </div>

                {/* Right — actions */}
                <div className="flex sm:flex-col gap-2 shrink-0">
                  {(contact.phone || contact.whatsapp) && contact.status !== "whatsapp_sent" && (
                    <button
                      onClick={() => sendWhatsApp(contact)}
                      disabled={sending === contact.id}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
                    >
                      {sending === contact.id ? "Sending…" : "Send WhatsApp"}
                    </button>
                  )}

                  {contact.status === "pending_call" && (
                    <button
                      onClick={() => updateStatus(contact.id, "called")}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
                    >
                      Mark Called
                    </button>
                  )}

                  {contact.status !== "ignored" && (
                    <button
                      onClick={() => updateStatus(contact.id, "ignored")}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold px-3 py-2 rounded-lg transition"
                    >
                      Ignore
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
