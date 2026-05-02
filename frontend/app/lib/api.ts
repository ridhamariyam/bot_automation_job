"use client";

const _apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!_apiUrl && typeof window !== "undefined") {
  console.error("[api] NEXT_PUBLIC_API_URL is not set — all API calls will fail");
}
export const API = _apiUrl ?? "";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") ?? "";
}

function _clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("jobrocket_user");
  localStorage.removeItem("jobrocket_jobs");
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Token expired or invalid — clear auth and redirect to login
    _clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login?session=expired";
    }
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    // Try to extract structured error from JSON response, fall back to text
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error ?? body?.detail ?? body?.message ?? message;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
