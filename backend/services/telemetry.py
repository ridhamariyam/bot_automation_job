"""
Structured telemetry — emits JSON log lines for auth/session events.

Each log line is a complete JSON object so it can be parsed by any log
aggregator (Papertrail, Datadog, Render log drains, etc.) without
post-processing.  Sensitive data (passwords, tokens, cookies) is never
included.
"""
import json
import logging
from datetime import datetime

_tel = logging.getLogger("jobrocket.auth")


def _rec(event: str, **fields) -> None:
    _tel.info(json.dumps({
        "event":     event,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        **fields,
    }))


# ── Public helpers ─────────────────────────────────────────────────────────────

def auth_session_started(user_email: str, platform: str, session_id: str) -> None:
    _rec("auth.session_started",
         user_id=user_email, platform=platform, session_id=session_id)


def auth_session_expired(user_email: str, platform: str, session_id: str) -> None:
    _rec("auth.session_expired",
         user_id=user_email, platform=platform, session_id=session_id)


def auth_session_cancelled(user_email: str, platform: str, session_id: str) -> None:
    _rec("auth.session_cancelled",
         user_id=user_email, platform=platform, session_id=session_id)


def auth_login_attempt(user_email: str, platform: str, session_id: str) -> None:
    _rec("auth.login_attempt",
         user_id=user_email, platform=platform, session_id=session_id)


def auth_captcha_detected(user_email: str, platform: str, session_id: str) -> None:
    _rec("auth.captcha_detected",
         user_id=user_email, platform=platform, session_id=session_id)


def auth_login_failed(user_email: str, platform: str, session_id: str, reason: str) -> None:
    _rec("auth.login_failed",
         user_id=user_email, platform=platform, session_id=session_id,
         reason=reason)


def auth_authenticated(user_email: str, platform: str, session_id: str) -> None:
    _rec("auth.authenticated",
         user_id=user_email, platform=platform, session_id=session_id)


def auth_cookie_import(user_email: str, platform: str, ok: bool, reason: str = "") -> None:
    _rec("auth.cookie_import",
         user_id=user_email, platform=platform, ok=ok,
         **({ "reason": reason } if reason else {}))


def session_persisted(user_email: str, platform: str) -> None:
    _rec("session.persisted", user_id=user_email, platform=platform)


def session_validated(user_email: str, platform: str, result: str) -> None:
    _rec("session.validated", user_id=user_email, platform=platform, result=result)
