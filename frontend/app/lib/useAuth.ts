"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useAuth() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.replace("/login");
  }, [router]);

  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("jobrocket_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { email: string; name: string };
  } catch {
    return null;
  }
}

export function logout(router: ReturnType<typeof useRouter>) {
  localStorage.removeItem("token");
  localStorage.removeItem("jobrocket_user");
  localStorage.removeItem("jobrocket_jobs");
  router.replace("/login");
}
