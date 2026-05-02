"use client";

import { useState, useEffect, useCallback } from "react";

type Permission = "default" | "granted" | "denied";

function postToSW(data: Record<string, unknown>) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage(data);
}

function msUntilTomorrow9am(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.getTime() - now.getTime();
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export type NotificationsAPI = {
  permission: Permission;
  supported: boolean;
  requestPermission: () => Promise<void>;
  scheduleDailyReminder: () => void;
  showMissedPlanAlert: (applied: number, target: number) => void;
  showHighScoreAlert: (jobTitle: string, score: number) => void;
  cancelAll: () => void;
};

export function useNotifications(): NotificationsAPI {
  const [permission, setPermission] = useState<Permission>("default");
  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator;

  useEffect(() => {
    if (supported) setPermission(Notification.permission as Permission);
  }, [supported]);

  // Register service worker once
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {/* silent */});
  }, [supported]);

  const requestPermission = useCallback(async () => {
    if (!supported) return;
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
  }, [supported]);

  const scheduleDailyReminder = useCallback(() => {
    if (permission !== "granted") return;
    postToSW({
      type:  "SCHEDULE",
      id:    "daily-reminder",
      title: "Time to apply! 🚀",
      body:  "Your daily job application goal is waiting.",
      delay: msUntilTomorrow9am(),
    });
  }, [permission]);

  const showMissedPlanAlert = useCallback((applied: number, target: number) => {
    if (permission !== "granted") return;
    const remaining = target - applied;
    if (remaining <= 0) return;
    const now = new Date();
    if (now.getHours() < 18) return; // only fire after 6 pm
    postToSW({
      type:  "SHOW_NOW",
      id:    "missed-plan",
      title: "Don't break your streak! 🔥",
      body:  `You're ${remaining} application${remaining !== 1 ? "s" : ""} away from today's goal.`,
    });
  }, [permission]);

  const showHighScoreAlert = useCallback((jobTitle: string, score: number) => {
    if (permission !== "granted") return;
    postToSW({
      type:  "SHOW_NOW",
      id:    "high-score",
      title: `Strong match found: ${score}/100`,
      body:  jobTitle,
    });
  }, [permission]);

  const cancelAll = useCallback(() => {
    ["daily-reminder", "missed-plan", "high-score"].forEach((id) =>
      postToSW({ type: "CANCEL", id })
    );
  }, []);

  return {
    permission,
    supported,
    requestPermission,
    scheduleDailyReminder,
    showMissedPlanAlert,
    showHighScoreAlert,
    cancelAll,
  };
}
