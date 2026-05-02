"use client";

interface Props {
  open: boolean;
  platformName: string;
  loginUrl: string;
  loading?: boolean;
  error?: string;
  primaryLabel?: string;
  statusText?: string;
  onContinue: () => void;
  onCancel: () => void;
}

export function BrowserConnectModal({
  open,
  platformName,
  loginUrl,
  loading = false,
  error = "",
  primaryLabel = "Continue",
  statusText = "",
  onContinue,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(28,20,12,0.50)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (!loading && e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${platformName} via browser`}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.20)] overflow-hidden">
        <div className="border-b border-[#F0EAE2] px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#B9B1A8]">
            Browser Connect
          </p>
          <h2 className="mt-2 text-[18px] font-bold text-[#1A1714]">
            Connect {platformName}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#8E867E]">
            Use your normal browser login so OTP, CAPTCHA, and security checks work reliably.
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          {[
            "A browser window opened",
            "Complete login (OTP if asked)",
            "Wait until your homepage loads",
            "Return and click Continue",
          ].map((step, index) => (
            <div key={step} className="flex items-start gap-3 rounded-xl bg-[#FAF6F1] px-4 py-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1C1410] text-[11px] font-semibold text-white">
                {index + 1}
              </div>
              <p className="text-[13px] leading-relaxed text-[#4E4741]">{step}</p>
            </div>
          ))}

          {statusText && (
            <div className="whitespace-pre-wrap rounded-xl border border-[#E6D9C8] bg-[#FBF7F1] px-4 py-3 text-[13px] font-medium text-[#6C6258]">
              {statusText}
            </div>
          )}

          {error && (
            <div className="whitespace-pre-wrap rounded-xl border border-[#F7D7CE] bg-[#FEF5F2] px-4 py-3 text-[13px] leading-relaxed text-[#C0392B]">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-[#F0EAE2] px-6 py-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl border border-[#DDD7CF] px-4 py-3 text-[13px] font-semibold text-[#5F5751] transition hover:bg-[#F7F1EA] disabled:opacity-60"
            >
              Cancel
            </button>
            <a
              href={loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl border border-[#DDD7CF] px-4 py-3 text-center text-[13px] font-semibold text-[#5F5751] transition hover:bg-[#F7F1EA]"
            >
              Open {platformName}
            </a>
          </div>
          <button
            type="button"
            onClick={onContinue}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold text-white transition disabled:opacity-70"
            style={{ background: "linear-gradient(135deg, #1C1410 0%, #3E2416 100%)" }}
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            )}
            {loading ? "Checking session..." : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
