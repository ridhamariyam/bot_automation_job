"use client";
import { useState, useEffect } from "react";
import {
  AutoLoginStatus,
  AUTO_LOGIN_STATUS_MESSAGES,
} from "../lib/types";

export type { AutoLoginStatus };

type Tab = "cookies" | "autologin";

interface Props {
  open: boolean;
  platformName: string;
  platformId: string;
  autoLoginLoading: boolean;
  autoLoginStatus: AutoLoginStatus;
  autoLoginMessage: string;
  onAutoLogin: (email: string, password: string) => void;
  onCookieImport: (cookiesJson: string) => Promise<void>;
  onCancel: () => void;
}

const PLATFORM_LOGIN_URL: Record<string, string> = {
  linkedin: "https://www.linkedin.com/login",
  indeed:   "https://secure.indeed.com/account/login",
};

// Ordered list of in-progress steps to show in the step indicator
const LOGIN_STEPS: { key: AutoLoginStatus; label: string }[] = [
  { key: "starting",         label: "Starting browser" },
  { key: "typing_email",     label: "Entering email" },
  { key: "typing_password",  label: "Entering password" },
  { key: "submitting",       label: "Submitting credentials" },
  { key: "waiting_redirect", label: "Waiting for result" },
];

// Numeric rank for step progression
const STEP_RANK: Partial<Record<AutoLoginStatus, number>> = {
  idle:             0,
  starting:         1,
  browser_opened:   1,
  navigating:       1,
  logging_in:       1,
  typing_email:     2,
  typing_password:  3,
  submitting:       4,
  waiting_redirect: 5,
  success:          6,
  captcha:          6,
  failed:           6,
};

const IN_PROGRESS_STATUSES = new Set<AutoLoginStatus>([
  "starting", "browser_opened", "navigating", "logging_in",
  "typing_email", "typing_password", "submitting", "waiting_redirect",
]);

export function BrowserConnectModal({
  open,
  platformName,
  platformId,
  autoLoginLoading,
  autoLoginStatus,
  autoLoginMessage,
  onAutoLogin,
  onCookieImport,
  onCancel,
}: Props) {
  const [tab, setTab]                   = useState<Tab>("cookies");
  const [autoEmail, setAutoEmail]       = useState("");
  const [autoPw, setAutoPw]             = useState("");
  const [cookiesJson, setCookiesJson]   = useState("");
  const [cookieLoading, setCookieLoading] = useState(false);
  const [cookieError, setCookieError]   = useState("");

  useEffect(() => {
    if (autoLoginStatus === "captcha") setTab("cookies");
  }, [autoLoginStatus]);

  useEffect(() => {
    if (!open) {
      setTab("cookies");
      setAutoEmail("");
      setAutoPw("");
      setCookiesJson("");
      setCookieLoading(false);
      setCookieError("");
    }
  }, [open]);

  if (!open) return null;

  const loginUrl = PLATFORM_LOGIN_URL[platformId] ?? `https://www.${platformId}.com/login`;
  const busy = autoLoginLoading || cookieLoading;
  const currentRank = STEP_RANK[autoLoginStatus] ?? 0;

  async function handleCookieSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cookiesJson.trim()) return;
    setCookieLoading(true);
    setCookieError("");
    try {
      await onCookieImport(cookiesJson.trim());
    } catch (ex: unknown) {
      setCookieError(ex instanceof Error ? ex.message : "Import failed — check your cookies JSON.");
    } finally {
      setCookieLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(28,20,12,0.55)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (!busy && e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${platformName}`}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden">

        {/* Header */}
        <div className="border-b border-[#F0EAE2] px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#B9B1A8]">
            Connect Platform
          </p>
          <h2 className="mt-1.5 text-[17px] font-bold text-[#1A1714]">
            Connect {platformName}
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#F0EAE2] px-6 gap-5">
          {([
            { id: "cookies"   as Tab, label: "Cookie Import", badge: "Recommended" },
            { id: "autologin" as Tab, label: "Auto-login",    badge: "" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "relative py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "text-[#1A1714] border-[#1A1714]"
                  : "text-[#9E958E] border-transparent hover:text-[#1A1714]",
              ].join(" ")}
            >
              {t.label}
              {t.badge && (
                <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                  ✓ {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Cookie Import Tab ── */}
        {tab === "cookies" && (
          <form onSubmit={handleCookieSubmit}>
            <div className="px-6 py-5 space-y-3">
              {autoLoginStatus === "captcha" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 leading-relaxed">
                  <span className="font-semibold">CAPTCHA detected.</span>{" "}
                  Auto-login won&apos;t work from this server&apos;s IP. Import your browser cookies instead — it always works.
                </div>
              )}

              <p className="text-[13px] text-[#6C6258] leading-relaxed">
                Export cookies from your logged-in browser — bypasses CAPTCHA and IP blocks completely.
              </p>

              <ol className="space-y-2">
                {[
                  <span key="0">Open <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2">{platformName}</a> and log in with your account</span>,
                  <span key="1">Install the <strong>Cookie-Editor</strong> extension (Chrome or Firefox)</span>,
                  <span key="2">Click the Cookie-Editor icon → <strong>Export</strong> → <strong>Export as JSON</strong></span>,
                  <span key="3">Paste the copied JSON in the box below and click <strong>Import</strong></span>,
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl bg-[#FAF6F1] px-4 py-2.5 list-none">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1C1410] text-[10px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <span className="text-[12.5px] leading-relaxed text-[#4E4741]">{step}</span>
                  </li>
                ))}
              </ol>

              <textarea
                value={cookiesJson}
                onChange={(e) => setCookiesJson(e.target.value)}
                placeholder={`Paste your ${platformName} cookies JSON here…`}
                rows={5}
                disabled={cookieLoading}
                className="w-full rounded-lg border border-[#EDE9E3] bg-[#FAFAF8] px-3 py-2.5 font-mono text-[11.5px] text-[#4E4741] placeholder:text-[#C4BDB5] focus:border-[#1A1714] focus:outline-none resize-none disabled:opacity-60"
              />

              {cookieError && (
                <div className="rounded-xl border border-[#F7D7CE] bg-[#FEF5F2] px-4 py-3 text-[12.5px] leading-relaxed text-[#C0392B]">
                  {cookieError}
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-[#F0EAE2] px-6 py-4">
              <button
                type="button"
                onClick={onCancel}
                disabled={cookieLoading}
                className="flex-1 rounded-xl border border-[#DDD7CF] px-4 py-3 text-[13px] font-semibold text-[#5F5751] transition hover:bg-[#F7F1EA] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={cookieLoading || !cookiesJson.trim()}
                className="flex-1 rounded-xl px-4 py-3 text-[13px] font-semibold text-white transition disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1C1410 0%, #3E2416 100%)" }}
              >
                {cookieLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Importing…
                  </span>
                ) : "Import Cookies"}
              </button>
            </div>
          </form>
        )}

        {/* ── Auto-login Tab ── */}
        {tab === "autologin" && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-[13px] text-[#6C6258] leading-relaxed">
              The server attempts to log in with your credentials.{" "}
              <span className="text-amber-700 font-medium">
                May fail if {platformName} requires CAPTCHA from this server&apos;s IP.
              </span>
            </p>

            {/* Credential inputs — hidden while login is in progress or complete */}
            {!IN_PROGRESS_STATUSES.has(autoLoginStatus) && autoLoginStatus !== "success" && (
              <>
                <input
                  type="email"
                  value={autoEmail}
                  onChange={(e) => setAutoEmail(e.target.value)}
                  placeholder={`${platformName} email`}
                  disabled={autoLoginLoading}
                  className="w-full rounded-lg border border-[#EDE9E3] bg-[#FAFAF8] px-3 py-2.5 text-[13px] placeholder:text-[#C4BDB5] focus:border-[#1A1714] focus:outline-none disabled:opacity-60"
                />
                <input
                  type="password"
                  value={autoPw}
                  onChange={(e) => setAutoPw(e.target.value)}
                  placeholder={`${platformName} password`}
                  disabled={autoLoginLoading}
                  className="w-full rounded-lg border border-[#EDE9E3] bg-[#FAFAF8] px-3 py-2.5 text-[13px] placeholder:text-[#C4BDB5] focus:border-[#1A1714] focus:outline-none disabled:opacity-60"
                />
              </>
            )}

            {/* Step progress — shown while login is in progress */}
            {IN_PROGRESS_STATUSES.has(autoLoginStatus) && (
              <div className="rounded-xl border border-[#EDE9E3] bg-[#FAFAF8] px-4 py-4 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B9B1A8] mb-3">
                  Login Progress
                </p>
                {LOGIN_STEPS.map((step, i) => {
                  const stepRank = (i + 1) as number;
                  const isDone   = stepRank < currentRank;
                  const isActive = stepRank === currentRank ||
                    (currentRank === 1 && stepRank === 1);

                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <span className={[
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                        isDone   ? "bg-emerald-500 text-white"               :
                        isActive ? "bg-[#1C1410] text-white"                 :
                                   "bg-[#EDE9E3] text-[#B9B1A8]",
                      ].join(" ")}>
                        {isDone ? "✓" : isActive ? (
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white/30 border-t-white" />
                        ) : i + 1}
                      </span>
                      <span className={[
                        "text-[12.5px] font-medium transition-colors",
                        isDone   ? "text-emerald-700"  :
                        isActive ? "text-[#1A1714]"    :
                                   "text-[#C4BDB5]",
                      ].join(" ")}>
                        {step.label}
                        {isActive && (
                          <span className="ml-1.5 text-[11px] font-normal text-[#9E958E]">
                            {AUTO_LOGIN_STATUS_MESSAGES[autoLoginStatus]}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Terminal states */}
            {autoLoginStatus === "captcha" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 leading-relaxed">
                <p className="font-semibold mb-1">Verification required</p>
                <p className="mb-2">{autoLoginMessage || `${platformName} requires CAPTCHA or OTP from this server's IP.`}</p>
                <button
                  type="button"
                  onClick={() => setTab("cookies")}
                  className="font-semibold underline underline-offset-2 hover:text-amber-700"
                >
                  Switch to Cookie Import →
                </button>
              </div>
            )}

            {autoLoginStatus === "failed" && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700 leading-relaxed">
                {autoLoginMessage || "Login failed. Check your credentials, or use Cookie Import."}
              </div>
            )}

            {autoLoginStatus === "success" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-700 font-semibold">
                ✅ Logged in successfully!
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={IN_PROGRESS_STATUSES.has(autoLoginStatus)}
                className="flex-1 rounded-xl border border-[#DDD7CF] px-4 py-3 text-[13px] font-semibold text-[#5F5751] transition hover:bg-[#F7F1EA] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onAutoLogin(autoEmail, autoPw)}
                disabled={
                  autoLoginLoading ||
                  IN_PROGRESS_STATUSES.has(autoLoginStatus) ||
                  !autoEmail ||
                  !autoPw ||
                  autoLoginStatus === "success"
                }
                className="flex-1 rounded-xl px-4 py-3 text-[13px] font-semibold text-white transition disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1C1410 0%, #3E2416 100%)" }}
              >
                {IN_PROGRESS_STATUSES.has(autoLoginStatus) ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Logging in…
                  </span>
                ) : autoLoginStatus === "success" ? "Connected ✅" : "Try Auto-login"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
