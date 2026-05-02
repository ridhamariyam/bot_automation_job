"use client";

import { useNotifications } from "../hooks/useNotifications";

type Props = {
  appliedToday: number;
  targetToday: number;
};

export function NotificationSettings({ appliedToday, targetToday }: Props) {
  const notifs = useNotifications();

  if (!notifs.supported) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
        Push notifications are not supported in this browser.
      </div>
    );
  }

  const statusDot =
    notifs.permission === "granted" ? "bg-emerald-400" :
    notifs.permission === "denied"  ? "bg-red-400"    : "bg-amber-400";

  const statusLabel =
    notifs.permission === "granted" ? "Enabled" :
    notifs.permission === "denied"  ? "Blocked by browser" : "Not yet enabled";

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full inline-block ${statusDot}`} />
          <span className="text-sm font-medium text-gray-700">{statusLabel}</span>
        </div>
        {notifs.permission !== "granted" && notifs.permission !== "denied" && (
          <button
            onClick={notifs.requestPermission}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors"
          >
            Enable notifications
          </button>
        )}
      </div>

      {notifs.permission === "denied" && (
        <p className="text-xs text-gray-500">
          Notifications are blocked. Allow them in your browser settings, then reload.
        </p>
      )}

      {/* Notification types */}
      <div className="space-y-2">
        {[
          { icon: "🌅", label: "Daily reminder",     desc: "9 am reminder to hit your daily goal" },
          { icon: "🔥", label: "Missed plan alert",  desc: "After 6 pm if you're under 50% of target" },
          { icon: "🎯", label: "High score alerts",  desc: "When a strong match job is found" },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-lg leading-none mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
            <span className={`text-xs font-semibold mt-0.5 ${notifs.permission === "granted" ? "text-emerald-600" : "text-gray-300"}`}>
              {notifs.permission === "granted" ? "On" : "Off"}
            </span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {notifs.permission === "granted" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={notifs.scheduleDailyReminder}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Re-schedule daily reminder
          </button>
          <button
            onClick={() => notifs.showMissedPlanAlert(appliedToday, targetToday)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Test missed plan alert
          </button>
          <button
            onClick={notifs.cancelAll}
            className="px-3 py-1.5 rounded-lg border border-red-100 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            Cancel all
          </button>
        </div>
      )}
    </div>
  );
}
