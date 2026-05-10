export type AutoLoginStatus =
  | "idle"
  | "starting"
  | "browser_opened"
  | "navigating"
  | "typing_email"
  | "typing_password"
  | "submitting"
  | "waiting_redirect"
  | "logging_in"
  | "captcha"
  | "failed"
  | "success";

export type LoginEventType =
  | "connected"
  | "typing_email"
  | "typing_password"
  | "submitting"
  | "waiting_redirect"
  | "captcha_detected"
  | "authenticated"
  | "failed"
  | "session_expired";

export interface LoginEvent {
  type: LoginEventType;
  ts?: number;
  message?: string;
  session_id?: string;
}

export const AUTO_LOGIN_STATUS_MESSAGES: Record<AutoLoginStatus, string> = {
  idle:             "",
  starting:         "Starting secure browser…",
  browser_opened:   "Browser opened, loading login page…",
  navigating:       "Navigating to login page…",
  typing_email:     "Entering email address…",
  typing_password:  "Entering password…",
  submitting:       "Submitting credentials…",
  waiting_redirect: "Waiting for login to complete…",
  logging_in:       "Logging in…",
  captcha:          "Security check detected — please use Cookie Import instead.",
  failed:           "Login failed — check your credentials and try again.",
  success:          "Logged in successfully!",
};

export function loginEventToStatus(event: LoginEvent): AutoLoginStatus | null {
  switch (event.type) {
    case "typing_email":     return "typing_email";
    case "typing_password":  return "typing_password";
    case "submitting":       return "submitting";
    case "waiting_redirect": return "waiting_redirect";
    case "captcha_detected": return "captcha";
    case "authenticated":    return "success";
    case "failed":           return "failed";
    case "session_expired":  return "failed";
    default:                 return null;
  }
}
