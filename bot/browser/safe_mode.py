"""
Safe mode — enforces daily application caps and inter-application gaps.

Design:
- Per-user counters are stored in Redis (via ARQ pool) when available,
  with a file-based fallback for dev/subprocess mode.
- Daily counters reset at midnight (UTC).
- Between applications the bot waits a random gap (GAP_MIN–GAP_MAX seconds).
- Hard cap: 30–50 applications/day per user (configurable in SafeMode init).
"""
import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Default limits
DAILY_LIMIT_MIN = 30
DAILY_LIMIT_MAX = 50
GAP_MIN_S       = 90     # 1.5 minutes minimum between applications
GAP_MAX_S       = 480    # 8 minutes maximum


class SafeMode:
    """
    Rate limiter for job applications.

    Usage:
        safe = SafeMode(user_email="alice@example.com", daily_max=40)
        await safe.wait_before_apply()        # random gap since last application
        ... perform application ...
        safe.record()                         # mark one application done
        if safe.limit_reached():
            break
    """

    _FALLBACK_DIR = Path(__file__).parent.parent.parent / "bot" / "sessions"

    def __init__(
        self,
        user_email: str,
        daily_max:  Optional[int] = None,
        gap_min_s:  float = GAP_MIN_S,
        gap_max_s:  float = GAP_MAX_S,
    ):
        self.user_email = user_email
        self.daily_max  = daily_max or random.randint(DAILY_LIMIT_MIN, DAILY_LIMIT_MAX)
        self.gap_min_s  = gap_min_s
        self.gap_max_s  = gap_max_s

        self._count:      int   = 0
        self._last_apply: float = 0.0   # unix timestamp
        self._today:      str   = _today_key()

        self._load_state()

    # ── Public API ─────────────────────────────────────────────────────────────

    def limit_reached(self) -> bool:
        self._rollover_if_needed()
        return self._count >= self.daily_max

    @property
    def remaining(self) -> int:
        self._rollover_if_needed()
        return max(0, self.daily_max - self._count)

    @property
    def applied_today(self) -> int:
        self._rollover_if_needed()
        return self._count

    def record(self) -> None:
        """Call immediately after a successful application."""
        self._rollover_if_needed()
        self._count      += 1
        self._last_apply  = time.monotonic()
        self._save_state()
        logger.info(
            "[SafeMode] %s — applied %d/%d today",
            self.user_email, self._count, self.daily_max,
        )

    async def wait_before_apply(self) -> None:
        """
        Block until it's safe to apply again.
        First application in a session: no gap.
        Subsequent ones: random gap between GAP_MIN and GAP_MAX.
        Logs a human-readable countdown.
        """
        self._rollover_if_needed()
        if self._last_apply == 0.0:
            # First application — small warmup delay
            warmup = random.uniform(3.0, 10.0)
            logger.info("[SafeMode] Warmup %.0fs before first application", warmup)
            await asyncio.sleep(warmup)
            return

        gap = random.uniform(self.gap_min_s, self.gap_max_s)
        elapsed = time.monotonic() - self._last_apply
        remaining = max(0.0, gap - elapsed)

        if remaining > 0:
            logger.info(
                "[SafeMode] Waiting %.0fs before next application (%.0fs gap chosen)",
                remaining, gap,
            )
            # Sleep in chunks so we can log progress
            while remaining > 0:
                chunk = min(30.0, remaining)
                await asyncio.sleep(chunk)
                remaining -= chunk
                if remaining > 5:
                    logger.debug("[SafeMode] %.0fs remaining in gap", remaining)

    # ── Internal ───────────────────────────────────────────────────────────────

    def _rollover_if_needed(self) -> None:
        today = _today_key()
        if today != self._today:
            logger.info("[SafeMode] Day rolled over — resetting counter for %s", self.user_email)
            self._count      = 0
            self._last_apply = 0.0
            self._today      = today
            self._save_state()

    def _state_path(self) -> Path:
        self._FALLBACK_DIR.mkdir(parents=True, exist_ok=True)
        safe_email = self.user_email.replace("@", "_at_").replace(".", "_")
        return self._FALLBACK_DIR / f"safemode_{safe_email}.json"

    def _load_state(self) -> None:
        try:
            p = self._state_path()
            if p.exists():
                data = json.loads(p.read_text())
                if data.get("date") == _today_key():
                    self._count = int(data.get("count", 0))
                    # Don't restore _last_apply across process restarts —
                    # we want at least one gap when the worker restarts.
        except Exception as e:
            logger.debug("[SafeMode] Could not load state: %s", e)

    def _save_state(self) -> None:
        try:
            self._state_path().write_text(json.dumps({
                "date":  self._today,
                "count": self._count,
            }))
        except Exception as e:
            logger.debug("[SafeMode] Could not save state: %s", e)


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")
