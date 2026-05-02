"""
Application Decision Engine.

Answers one question: "Should the bot apply to this job right now?"

Three layers of logic, applied in order:
  1. Platform daily limit — hard cap per platform (LinkedIn=20, Indeed=40, …)
  2. Score threshold — derived from user's chosen mode + adaptive adjustment
  3. Result: (should_apply, reason)

Adaptive threshold:
  - Tracks success rate (replies+interviews) / applications over 30 days
  - Increases threshold by up to +15 pts when success rate < 5% with ≥20 apps
  - Decreases by up to -5 pts when success rate > 15% with ≥10 apps
  - User can disable adaptation or set a manual override
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


# ── Mode definitions ───────────────────────────────────────────────────────────

class Mode(str, Enum):
    AGGRESSIVE   = "aggressive"    # cast wide net — many applications
    BALANCED     = "balanced"      # default for most users
    HIGH_QUALITY = "high_quality"  # only strong matches


BASE_THRESHOLDS: dict[Mode, int] = {
    Mode.AGGRESSIVE:   50,
    Mode.BALANCED:     65,
    Mode.HIGH_QUALITY: 80,
}


# ── Per-platform daily caps ────────────────────────────────────────────────────

DEFAULT_PLATFORM_LIMITS: dict[str, int] = {
    "linkedin":   20,
    "indeed":     40,
    "glassdoor":  30,
    "monster":    25,
    "google_jobs": 15,
    "naukri":     50,
    "bayt":       20,
    "timesjobs":  30,
}


# ── Data structures ────────────────────────────────────────────────────────────

@dataclass
class ApplicationDecisionResult:
    should_apply:      bool
    reason:            str
    score:             int
    effective_threshold: int
    platform:          str


@dataclass
class AdaptiveStats:
    applied_30d:       int
    replied_30d:       int
    interviewed_30d:   int
    success_rate:      float    # (replies + interviews) / applications
    threshold_adjustment: int   # computed shift applied to base threshold
    direction:         str      # "increasing" | "decreasing" | "stable"


# ── DecisionEngine ─────────────────────────────────────────────────────────────

class DecisionEngine:
    """
    Stateless decision engine — instantiated per application attempt.

    Usage:
        engine = DecisionEngine.for_user(user_email, platform)
        result = engine.decide(score_result)
        if result.should_apply:
            await apply()
    """

    def __init__(
        self,
        mode:               Mode = Mode.BALANCED,
        threshold_override: Optional[int] = None,
        adaptive_enabled:   bool = True,
        threshold_adjustment: int = 0,
        platform:           str = "",
        platform_limit:     int = 40,
        platform_applied_today: int = 0,
    ):
        self.mode                = mode
        self.threshold_override  = threshold_override
        self.adaptive_enabled    = adaptive_enabled
        self.threshold_adjustment = threshold_adjustment
        self.platform            = platform
        self.platform_limit      = platform_limit
        self.platform_applied_today = platform_applied_today

    @property
    def effective_threshold(self) -> int:
        if self.threshold_override is not None:
            return self.threshold_override
        base = BASE_THRESHOLDS[self.mode]
        adj  = self.threshold_adjustment if self.adaptive_enabled else 0
        # Adjustment bounded: never raises above base+20, never drops below base-10
        adj  = max(-10, min(20, adj))
        return base + adj

    def decide(self, score: int, job_title: str = "") -> ApplicationDecisionResult:
        """
        Returns ApplicationDecisionResult.
        Call this once per candidate job before applying.
        """
        # Layer 1: platform daily limit
        if self.platform_applied_today >= self.platform_limit:
            return ApplicationDecisionResult(
                should_apply=False,
                reason=(
                    f"Platform daily cap reached: {self.platform_applied_today}/"
                    f"{self.platform_limit} applications on {self.platform} today."
                ),
                score=score,
                effective_threshold=self.effective_threshold,
                platform=self.platform,
            )

        # Layer 2: score threshold
        threshold = self.effective_threshold
        if score < threshold:
            return ApplicationDecisionResult(
                should_apply=False,
                reason=(
                    f"Score {score}/100 is below {self.mode.value} threshold "
                    f"({threshold}). Job: {job_title[:60]}"
                ),
                score=score,
                effective_threshold=threshold,
                platform=self.platform,
            )

        return ApplicationDecisionResult(
            should_apply=True,
            reason=f"Score {score}/100 ≥ threshold {threshold}. Applying.",
            score=score,
            effective_threshold=threshold,
            platform=self.platform,
        )

    @classmethod
    def for_user(cls, user_email: str, platform: str) -> "DecisionEngine":
        """Load config from DB and build a DecisionEngine for this user+platform."""
        try:
            from database import SessionLocal, ScoringConfig
            with SessionLocal() as db:
                cfg = db.query(ScoringConfig).filter_by(user_email=user_email).first()
                if not cfg:
                    cfg = _default_config(user_email, db)

                platform_limit        = getattr(cfg, f"{platform}_daily", DEFAULT_PLATFORM_LIMITS.get(platform, 30))
                platform_applied_today = _count_platform_today(db, user_email, platform)

                return cls(
                    mode                 = Mode(cfg.mode),
                    threshold_override   = cfg.threshold_override,
                    adaptive_enabled     = cfg.adaptive_enabled,
                    threshold_adjustment = cfg.threshold_adjustment,
                    platform             = platform,
                    platform_limit       = platform_limit,
                    platform_applied_today = platform_applied_today,
                )
        except Exception as e:
            logger.warning("Could not load scoring config for %s: %s", user_email, e)
            return cls(platform=platform)


# ── Adaptive threshold computation ─────────────────────────────────────────────

def compute_adaptive_stats(user_email: str) -> AdaptiveStats:
    """
    Compute 30-day application stats and derive a threshold adjustment.
    Call this periodically (e.g. before each bot session) and persist
    the result to ScoringConfig.threshold_adjustment.
    """
    try:
        from database import SessionLocal, JobApplication
        from sqlalchemy import func

        cutoff = datetime.now(timezone.utc) - timedelta(days=30)

        with SessionLocal() as db:
            apps = db.query(JobApplication).filter(
                JobApplication.user_email == user_email,
                JobApplication.applied_at >= cutoff,
            ).all()

            applied   = len(apps)
            replied   = sum(1 for a in apps if a.outcome in ("reply", "interview", "offer"))
            interviewed = sum(1 for a in apps if a.outcome in ("interview", "offer"))

        if applied == 0:
            return AdaptiveStats(0, 0, 0, 0.0, 0, "stable")

        success_rate = replied / applied

        # Compute adjustment
        if applied >= 20 and success_rate < 0.05:
            # Very poor response rate — be more selective
            adj = min(15, round((0.05 - success_rate) * 200))
            direction = "increasing"
        elif applied >= 10 and success_rate > 0.15:
            # Great response rate — can afford to cast wider
            adj = max(-5, -round((success_rate - 0.15) * 30))
            direction = "decreasing"
        else:
            adj = 0
            direction = "stable"

        # Clamp total adjustment
        adj = max(-10, min(20, adj))

        return AdaptiveStats(
            applied_30d        = applied,
            replied_30d        = replied,
            interviewed_30d    = interviewed,
            success_rate       = round(success_rate, 4),
            threshold_adjustment = adj,
            direction          = direction,
        )
    except Exception as e:
        logger.warning("compute_adaptive_stats failed: %s", e)
        return AdaptiveStats(0, 0, 0, 0.0, 0, "stable")


def update_adaptive_threshold(user_email: str) -> AdaptiveStats:
    """Compute stats and persist the adjustment to DB."""
    stats = compute_adaptive_stats(user_email)
    try:
        from database import SessionLocal, ScoringConfig
        with SessionLocal() as db:
            cfg = db.query(ScoringConfig).filter_by(user_email=user_email).first()
            if not cfg:
                cfg = _default_config(user_email, db)
            if cfg.adaptive_enabled:
                cfg.threshold_adjustment = stats.threshold_adjustment
                db.commit()
    except Exception as e:
        logger.warning("Could not persist adaptive threshold for %s: %s", user_email, e)
    return stats


# ── Helpers ────────────────────────────────────────────────────────────────────

def _count_platform_today(db, user_email: str, platform: str) -> int:
    from datetime import date
    from sqlalchemy import func
    from database import JobApplication
    today = date.today()
    count = db.query(func.count(JobApplication.id)).filter(
        JobApplication.user_email == user_email,
        JobApplication.platform   == platform,
        func.date(JobApplication.applied_at) == today,
    ).scalar() or 0
    return count


def _default_config(user_email: str, db):
    """Insert and return a default ScoringConfig for a new user."""
    from database import ScoringConfig
    cfg = ScoringConfig(user_email=user_email)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg
