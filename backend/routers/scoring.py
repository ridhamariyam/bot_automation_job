"""
Scoring API — exposes job scoring, config management, adaptive stats,
and outcome recording for the frontend and bot worker.

Routes:
  POST /api/scoring/score            — score a job for a user
  POST /api/scoring/score/batch      — score multiple jobs at once
  GET  /api/scoring/config/{email}   — get scoring config
  PATCH /api/scoring/config/{email}  — update mode / limits / override
  GET  /api/scoring/stats/{email}    — adaptive stats + recommendation
  POST /api/scoring/outcome/{job_id} — record reply/interview/rejected
"""
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Depends
from middleware.auth import require_self, require_auth
from pydantic import BaseModel, Field

from database import SessionLocal, ScoringConfig, JobApplication, User
from services.job_scorer import score_job, batch_score_jobs, ScoreResult
from services.decision_engine import (
    DecisionEngine, Mode, BASE_THRESHOLDS,
    compute_adaptive_stats, update_adaptive_threshold,
    DEFAULT_PLATFORM_LIMITS,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response schemas ─────────────────────────────────────────────────

class ScoreJobIn(BaseModel):
    user_email:  str
    job_title:   str
    company:     str
    description: str = ""
    job_url:     str = ""


class BatchScoreIn(BaseModel):
    user_email: str
    jobs: list[dict]   # each: {title, company, description, url?}


class ScoreJobOut(BaseModel):
    total:             int
    title_score:       int
    skills_score:      int
    experience_score:  int
    relevance_score:   int
    quality_score:     int
    matched_skills:    list[str]
    missing_skills:    list[str]
    reasoning:         str
    experience_required: Optional[str]
    scorer:            str
    should_apply:      bool
    effective_threshold: int
    decision_reason:   str
    mode:              str


class UpdateConfigIn(BaseModel):
    mode:                Optional[Literal["aggressive", "balanced", "high_quality"]] = None
    threshold_override:  Optional[int] = Field(None, ge=0, le=100)
    adaptive_enabled:    Optional[bool] = None
    linkedin_daily:      Optional[int] = Field(None, ge=0, le=200)
    indeed_daily:        Optional[int] = Field(None, ge=0, le=200)
    glassdoor_daily:     Optional[int] = Field(None, ge=0, le=200)
    monster_daily:       Optional[int] = Field(None, ge=0, le=200)
    google_jobs_daily:   Optional[int] = Field(None, ge=0, le=200)
    naukri_daily:        Optional[int] = Field(None, ge=0, le=200)
    bayt_daily:          Optional[int] = Field(None, ge=0, le=200)
    timesjobs_daily:     Optional[int] = Field(None, ge=0, le=200)


class OutcomeIn(BaseModel):
    outcome: Literal["reply", "interview", "offer", "rejected"]


# ── POST /score ────────────────────────────────────────────────────────────────

@router.post("/score", response_model=ScoreJobOut)
async def score_one_job(body: ScoreJobIn, token_email: str = Depends(require_auth)):
    """
    Score a single job against the user's profile.
    Returns the full breakdown plus a should_apply decision.
    """
    if body.user_email.lower() != token_email.lower():
        raise HTTPException(403, "Access denied")
    user, cfg = _load_user_and_config(body.user_email)

    result: ScoreResult = await score_job(
        job_title     = body.job_title,
        company       = body.company,
        description   = body.description,
        target_titles = _parse_titles(user.target_titles),
        skills        = _parse_skills(user.skills),
        years_exp     = user.years_exp or 0,
        user_email    = body.user_email,
        job_url       = body.job_url,
    )

    engine = DecisionEngine(
        mode                 = Mode(cfg.mode),
        threshold_override   = cfg.threshold_override,
        adaptive_enabled     = cfg.adaptive_enabled,
        threshold_adjustment = cfg.threshold_adjustment,
        platform             = "",   # no platform limit check from API
        platform_limit       = 9999,
        platform_applied_today = 0,
    )
    decision = engine.decide(result.total, body.job_title)

    return ScoreJobOut(
        total             = result.total,
        title_score       = result.title_score,
        skills_score      = result.skills_score,
        experience_score  = result.experience_score,
        relevance_score   = result.relevance_score,
        quality_score     = result.quality_score,
        matched_skills    = result.matched_skills,
        missing_skills    = result.missing_skills,
        reasoning         = result.reasoning,
        experience_required = result.experience_required,
        scorer            = result.scorer,
        should_apply      = decision.should_apply,
        effective_threshold = decision.effective_threshold,
        decision_reason   = decision.reason,
        mode              = cfg.mode,
    )


# ── POST /score/batch ──────────────────────────────────────────────────────────

@router.post("/score/batch")
async def score_jobs_batch(body: BatchScoreIn, token_email: str = Depends(require_auth)):
    """
    Score up to 50 jobs at once. Useful for pre-filtering before the bot runs.
    Returns each job with its score and should_apply flag.
    """
    if body.user_email.lower() != token_email.lower():
        raise HTTPException(403, "Access denied")
    if len(body.jobs) > 50:
        raise HTTPException(400, "Maximum 50 jobs per batch request.")

    user, cfg = _load_user_and_config(body.user_email)
    engine = DecisionEngine(
        mode                 = Mode(cfg.mode),
        threshold_override   = cfg.threshold_override,
        adaptive_enabled     = cfg.adaptive_enabled,
        threshold_adjustment = cfg.threshold_adjustment,
        platform             = "",
        platform_limit       = 9999,
        platform_applied_today = 0,
    )

    scored = await batch_score_jobs(
        jobs          = body.jobs,
        target_titles = _parse_titles(user.target_titles),
        skills        = _parse_skills(user.skills),
        years_exp     = user.years_exp or 0,
        user_email    = body.user_email,
    )

    results = []
    for job, result in scored:
        decision = engine.decide(result.total, job.get("title", ""))
        results.append({
            **job,
            "score":              result.total,
            "matched_skills":     result.matched_skills,
            "missing_skills":     result.missing_skills,
            "reasoning":          result.reasoning,
            "scorer":             result.scorer,
            "should_apply":       decision.should_apply,
            "effective_threshold": decision.effective_threshold,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {
        "user_email": body.user_email,
        "mode":       cfg.mode,
        "threshold":  engine.effective_threshold,
        "total":      len(results),
        "to_apply":   sum(1 for r in results if r["should_apply"]),
        "jobs":       results,
    }


# ── GET /config/{email} ────────────────────────────────────────────────────────

@router.get("/config/{email}")
def get_config(email: str, _: str = Depends(require_self)):
    """Return the user's current scoring configuration."""
    _, cfg = _load_user_and_config(email)
    return _fmt_config(cfg)


# ── PATCH /config/{email} ──────────────────────────────────────────────────────

@router.patch("/config/{email}")
def update_config(email: str, body: UpdateConfigIn, _: str = Depends(require_self)):
    """Update scoring mode, per-platform limits, or manual threshold."""
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(404, "User not found")

        cfg = db.query(ScoringConfig).filter_by(user_email=email).first()
        if not cfg:
            cfg = ScoringConfig(user_email=email)
            db.add(cfg)

        updatable = [
            "mode", "threshold_override", "adaptive_enabled",
            "linkedin_daily", "indeed_daily", "glassdoor_daily",
            "monster_daily", "google_jobs_daily", "naukri_daily",
            "bayt_daily", "timesjobs_daily",
        ]
        for field in updatable:
            val = getattr(body, field, None)
            if val is not None:
                setattr(cfg, field, val)

        cfg.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(cfg)
        return _fmt_config(cfg)


# ── POST /config/{email} ── (same as PATCH; used by the frontend Save button) ──

@router.post("/config/{email}")
def save_config(email: str, body: UpdateConfigIn, _: str = Depends(require_self)):
    """Frontend Save button sends POST — delegate to same logic as PATCH."""
    return update_config(email, body, _)


# ── GET /stats/{email} ─────────────────────────────────────────────────────────

@router.get("/stats/{email}")
def get_adaptive_stats(email: str, _: str = Depends(require_self)):
    """
    Return 30-day application success stats and the adaptive threshold recommendation.
    Also persists the new threshold adjustment to DB.
    """
    with SessionLocal() as db:
        if not db.query(User).filter(User.email == email).first():
            raise HTTPException(404, "User not found")

    stats = update_adaptive_threshold(email)
    _, cfg = _load_user_and_config(email)
    mode = Mode(cfg.mode)

    return {
        "user_email":          email,
        "mode":                cfg.mode,
        "base_threshold":      BASE_THRESHOLDS[mode],
        "threshold_adjustment": stats.threshold_adjustment,
        "effective_threshold": DecisionEngine(
            mode=mode,
            threshold_override=cfg.threshold_override,
            adaptive_enabled=cfg.adaptive_enabled,
            threshold_adjustment=stats.threshold_adjustment,
        ).effective_threshold,
        "applied_30d":         stats.applied_30d,
        "replied_30d":         stats.replied_30d,
        "interviewed_30d":     stats.interviewed_30d,
        "success_rate_pct":    round(stats.success_rate * 100, 1),
        "direction":           stats.direction,
        "recommendation": _build_recommendation(stats, cfg.mode),
    }


# ── POST /outcome/{job_id} ─────────────────────────────────────────────────────

@router.post("/outcome/{job_id}")
def record_outcome(job_id: str, body: OutcomeIn, token_email: str = Depends(require_auth)):
    """
    Record the outcome of an application (reply / interview / offer / rejected).
    Used by the adaptive engine to compute success rate.
    Can be called manually from the frontend or automatically (future webhook).
    """
    with SessionLocal() as db:
        job = db.get(JobApplication, job_id)
        if not job:
            raise HTTPException(404, "Application not found")
        if job.user_email.lower() != token_email.lower():
            raise HTTPException(403, "Access denied")

        job.outcome    = body.outcome
        job.outcome_at = datetime.utcnow()

        # Map outcome to status for existing dashboard
        if body.outcome in ("interview", "offer"):
            job.status = "Interview"
        elif body.outcome == "reply":
            job.status = "Viewed"
        elif body.outcome == "rejected":
            job.status = "Rejected"

        db.commit()

        # Recompute adaptive threshold in background (non-blocking)
        try:
            update_adaptive_threshold(job.user_email)
        except Exception:
            pass

        return {
            "job_id":    job_id,
            "outcome":   job.outcome,
            "status":    job.status,
            "recorded_at": job.outcome_at.isoformat(),
        }


# ── GET /suggestions/{email} ──────────────────────────────────────────────────

@router.get("/suggestions/{email}")
def get_suggestions(email: str, _: str = Depends(require_self)):
    """
    Compute actionable suggestions from the user's application history.
    Analyzes skill gaps, platform performance, and score quality.
    """
    with SessionLocal() as db:
        if not db.query(User).filter(User.email == email).first():
            raise HTTPException(404, "User not found")
        jobs = (
            db.query(JobApplication)
            .filter(JobApplication.user_email == email)
            .order_by(JobApplication.applied_at.desc())
            .limit(200)
            .all()
        )
        cfg = db.query(ScoringConfig).filter_by(user_email=email).first()
        mode = cfg.mode if cfg else "balanced"

    if not jobs:
        return {"suggestions": [], "skill_gaps": [], "platform_stats": [], "avg_score": None, "total_analyzed": 0}

    # ── Skill gap frequency ───────────────────────────────────────────────────
    skill_freq: dict[str, int] = {}
    for j in jobs:
        if not j.score_breakdown:
            continue
        try:
            bd = json.loads(j.score_breakdown)
            for skill in bd.get("missing_skills", []):
                skill_freq[skill] = skill_freq.get(skill, 0) + 1
        except Exception:
            pass
    top_skills = sorted(skill_freq.items(), key=lambda x: x[1], reverse=True)[:8]

    # ── Platform conversion ───────────────────────────────────────────────────
    plat: dict[str, dict] = {}
    for j in jobs:
        p = j.platform or "unknown"
        if p not in plat:
            plat[p] = {"applied": 0, "replied": 0, "interviewed": 0, "scores": []}
        plat[p]["applied"] += 1
        if j.outcome in ("reply", "interview", "offer"):
            plat[p]["replied"] += 1
        if j.outcome in ("interview", "offer"):
            plat[p]["interviewed"] += 1
        if j.score is not None:
            plat[p]["scores"].append(j.score)

    platform_stats = []
    for p, v in plat.items():
        if v["applied"] < 2:
            continue
        avg_s = round(sum(v["scores"]) / len(v["scores"])) if v["scores"] else None
        platform_stats.append({
            "platform": p,
            "applied": v["applied"],
            "replied": v["replied"],
            "interviewed": v["interviewed"],
            "reply_rate": round(v["replied"] / v["applied"] * 100, 1),
            "avg_score": avg_s,
        })
    platform_stats.sort(key=lambda x: x["reply_rate"], reverse=True)

    # ── Score quality ─────────────────────────────────────────────────────────
    scored = [j for j in jobs if j.score is not None]
    avg_score = round(sum(j.score for j in scored) / len(scored)) if scored else None

    # ── Build suggestions ─────────────────────────────────────────────────────
    suggestions = []

    if top_skills:
        skill, freq = top_skills[0]
        suggestions.append({
            "type": "skill_gap",
            "priority": "high" if freq >= 5 else "medium",
            "icon": "🎯",
            "title": f'Add "{skill}" to your profile',
            "detail": f"Missing from {freq} recent job descriptions. Could boost your score by 5–15 points.",
            "action": "Go to Settings → Profile to update your skills",
        })

    if len(top_skills) > 1:
        others = ", ".join(s for s, _ in top_skills[1:4])
        suggestions.append({
            "type": "skill_gap",
            "priority": "medium",
            "icon": "📚",
            "title": f"Also consider adding: {others}",
            "detail": "These appear frequently in jobs you're targeting but aren't on your profile.",
        })

    if platform_stats:
        best = platform_stats[0]
        if best["reply_rate"] > 0 and best["applied"] >= 3:
            suggestions.append({
                "type": "platform",
                "priority": "medium",
                "icon": "🚀",
                "title": f"{best['platform'].replace('_', ' ').title()} has your best reply rate",
                "detail": f"{best['reply_rate']}% reply rate ({best['replied']}/{best['applied']} responded). Consider increasing your daily limit.",
                "action": "Adjust in Settings → Daily Application Limits",
            })
        worst = [p for p in platform_stats if p["applied"] >= 5 and p["reply_rate"] == 0]
        if worst:
            w = worst[0]
            suggestions.append({
                "type": "platform",
                "priority": "low",
                "icon": "📉",
                "title": f"{w['platform'].replace('_', ' ').title()} has 0% reply rate",
                "detail": f"{w['applied']} applications with no replies. Consider reducing or disabling this platform.",
                "action": "Set limit to 0 in Settings → Daily Application Limits",
            })

    if avg_score is not None and avg_score < 60 and len(scored) >= 10 and mode != "high_quality":
        suggestions.append({
            "type": "mode",
            "priority": "high",
            "icon": "⚡",
            "title": "Your job match quality is low",
            "detail": f"Average score is {avg_score}/100. Switching to Balanced or High Quality mode filters for better matches.",
            "action": "Change mode in Settings → Application Mode",
        })

    no_outcome = [j for j in jobs if not j.outcome]
    if len(jobs) >= 15 and len(no_outcome) == len(jobs):
        suggestions.append({
            "type": "tracking",
            "priority": "high",
            "icon": "📊",
            "title": "Start tracking your outcomes",
            "detail": f"You have {len(jobs)} applications but no outcomes recorded. This activates the adaptive scoring engine.",
            "action": "Click any job card and use the outcome buttons",
        })

    return {
        "suggestions": suggestions,
        "skill_gaps": [{"skill": k, "frequency": v} for k, v in top_skills],
        "platform_stats": platform_stats,
        "avg_score": avg_score,
        "total_analyzed": len(jobs),
    }


# ── GET /outcome-intelligence/{email} ─────────────────────────────────────────

@router.get("/outcome-intelligence/{email}")
def get_outcome_intelligence(email: str, _: str = Depends(require_self)):
    """
    Compute outcome intelligence from up to 500 historical applications:
    - Pattern analysis: reply rate by score range, platform, and role
    - Optimization: ideal threshold, best platform, best role focus
    - Rejection analysis: inferred reasons from skill gaps + score distribution
    - Progression: weekly trend of avg score and reply rate
    """
    with SessionLocal() as db:
        if not db.query(User).filter(User.email == email).first():
            raise HTTPException(404, "User not found")
        jobs = (
            db.query(JobApplication)
            .filter(JobApplication.user_email == email)
            .order_by(JobApplication.applied_at.asc())
            .limit(500)
            .all()
        )
        cfg = db.query(ScoringConfig).filter_by(user_email=email).first()

    if not jobs:
        return _empty_intelligence()

    mode = Mode(cfg.mode) if cfg else Mode("balanced")
    effective_threshold = DecisionEngine(
        mode=mode,
        threshold_override=cfg.threshold_override if cfg else None,
        adaptive_enabled=cfg.adaptive_enabled if cfg else True,
        threshold_adjustment=cfg.threshold_adjustment if cfg else 0,
    ).effective_threshold

    scored       = [j for j in jobs if j.score is not None]
    with_outcome = [j for j in jobs if j.outcome is not None]

    patterns     = _intel_patterns(with_outcome)
    optimization = _intel_optimization(with_outcome, patterns, effective_threshold)
    rejection    = _intel_rejection(jobs, scored, with_outcome)
    progression  = _intel_progression(jobs)

    return {
        "patterns":       patterns,
        "optimization":   optimization,
        "rejection":      rejection,
        "progression":    progression,
        "total_analyzed": len(jobs),
        "with_outcomes":  len(with_outcome),
        "has_enough_data": len(with_outcome) >= 10,
    }


# ── Intelligence helpers ───────────────────────────────────────────────────────

_ROLE_STOP = frozenset({
    "senior", "junior", "mid", "lead", "staff", "principal", "associate",
    "remote", "hybrid", "contract", "freelance", "full", "time", "part",
    "level", "the", "and", "for", "with", "experienced", "expert",
    "intern", "graduate", "entry", "new", "role", "position", "job",
})


def _extract_role(title: str) -> str:
    tokens = re.sub(r"[^a-z0-9 ]", " ", title.lower()).split()
    tokens = [t for t in tokens if len(t) >= 3 and t not in _ROLE_STOP]
    return " ".join(tokens[:2]) if tokens else ""


def _reply(j) -> bool:
    return j.outcome in ("reply", "interview", "offer")


def _intel_patterns(with_outcome: list) -> dict:
    # ── By score range ──────────────────────────────────────────────────────
    by_score_range = []
    for label, lo, hi in [("Strong", 80, 100), ("Good", 65, 79), ("Fair", 50, 64), ("Weak", 0, 49)]:
        bucket = [j for j in with_outcome if j.score is not None and lo <= j.score <= hi]
        replied = [j for j in bucket if _reply(j)]
        rate = round(len(replied) / len(bucket) * 100, 1) if bucket else 0.0
        by_score_range.append({
            "range": f"{lo}–{hi}", "label": label,
            "applied": len(bucket), "replied": len(replied), "rate": rate,
        })

    # ── By platform ─────────────────────────────────────────────────────────
    plat: dict[str, dict] = {}
    for j in with_outcome:
        p = j.platform or "unknown"
        if p not in plat:
            plat[p] = {"applied": 0, "replied": 0, "scores": []}
        plat[p]["applied"] += 1
        if _reply(j):
            plat[p]["replied"] += 1
        if j.score is not None:
            plat[p]["scores"].append(j.score)

    by_platform = []
    for p, v in plat.items():
        if v["applied"] < 3:
            continue
        avg_s = round(sum(v["scores"]) / len(v["scores"])) if v["scores"] else None
        by_platform.append({
            "platform": p, "applied": v["applied"], "replied": v["replied"],
            "rate": round(v["replied"] / v["applied"] * 100, 1), "avg_score": avg_s,
        })
    by_platform.sort(key=lambda x: x["rate"], reverse=True)

    # ── By role ─────────────────────────────────────────────────────────────
    role_map: dict[str, dict] = {}
    for j in with_outcome:
        role = _extract_role(j.title or "")
        if not role:
            continue
        if role not in role_map:
            role_map[role] = {"applied": 0, "replied": 0, "scores": []}
        role_map[role]["applied"] += 1
        if _reply(j):
            role_map[role]["replied"] += 1
        if j.score is not None:
            role_map[role]["scores"].append(j.score)

    by_role = []
    for r, v in role_map.items():
        if v["applied"] < 3:
            continue
        avg_s = round(sum(v["scores"]) / len(v["scores"])) if v["scores"] else None
        by_role.append({
            "role": r, "applied": v["applied"], "replied": v["replied"],
            "rate": round(v["replied"] / v["applied"] * 100, 1), "avg_score": avg_s,
        })
    by_role.sort(key=lambda x: x["rate"], reverse=True)

    # ── Top / worst across all dimensions ───────────────────────────────────
    all_patterns = []
    for r in by_score_range:
        if r["applied"] >= 5:
            all_patterns.append({"dimension": "score", "label": f'Score {r["label"]}', "rate": r["rate"], "applied": r["applied"]})
    for p in by_platform:
        all_patterns.append({"dimension": "platform", "label": p["platform"].replace("_", " ").title(), "rate": p["rate"], "applied": p["applied"]})
    for r in by_role:
        all_patterns.append({"dimension": "role", "label": r["role"].title(), "rate": r["rate"], "applied": r["applied"]})

    all_patterns.sort(key=lambda x: x["rate"], reverse=True)
    bottom = list(reversed(all_patterns[-3:])) if len(all_patterns) >= 3 else list(reversed(all_patterns))

    return {
        "by_score_range": by_score_range,
        "by_platform":    by_platform,
        "by_role":        by_role[:8],
        "top_patterns":   [{**p, "positive": True}  for p in all_patterns[:3] if p["rate"] > 0],
        "worst_patterns": [{**p, "positive": False} for p in bottom],
    }


def _intel_optimization(with_outcome: list, patterns: dict, current_threshold: int) -> dict:
    # ── Ideal threshold: highest reply rate with ≥5 outcome-tracked apps ────
    ideal_threshold = current_threshold
    best_rate = 0.0
    threshold_rationale = "Apply to more jobs and record outcomes to get a recommendation."

    for T in range(50, 86, 5):
        above = [j for j in with_outcome if j.score is not None and j.score >= T]
        if len(above) < 5:
            continue
        rate = len([j for j in above if _reply(j)]) / len(above)
        if rate > best_rate:
            best_rate, ideal_threshold = rate, T

    if best_rate > 0 and with_outcome:
        overall = len([j for j in with_outcome if _reply(j)]) / len(with_outcome) * 100
        threshold_rationale = (
            f"Jobs scored ≥{ideal_threshold} have a {round(best_rate*100,1)}% reply rate "
            f"vs {round(overall,1)}% overall across all applications."
        )

    # ── Best platform ────────────────────────────────────────────────────────
    by_plat = patterns["by_platform"]
    best_platform, platform_rationale = "", "Apply to more platforms to get a recommendation."
    if by_plat:
        bp = by_plat[0]
        best_platform = bp["platform"]
        platform_rationale = (
            f"{bp['platform'].replace('_',' ').title()} has your highest reply rate: "
            f"{bp['rate']}% from {bp['applied']} applications."
        )

    # ── Best role ────────────────────────────────────────────────────────────
    by_role = patterns["by_role"]
    best_role, role_rationale = "", "Apply to more roles to get a recommendation."
    if by_role:
        br = by_role[0]
        best_role = br["role"]
        role_rationale = (
            f'"{br["role"].title()}" roles have your highest reply rate: '
            f"{br['rate']}% from {br['applied']} applications."
        )

    return {
        "ideal_threshold":      ideal_threshold,
        "best_platform":        best_platform,
        "best_role":            best_role,
        "threshold_rationale":  threshold_rationale,
        "platform_rationale":   platform_rationale,
        "role_rationale":       role_rationale,
    }


def _intel_rejection(jobs: list, scored: list, with_outcome: list) -> dict:
    reasons = []

    # ── Skill gap (from score_breakdown JSON) ────────────────────────────────
    missing_counts: list[int] = []
    all_missing: dict[str, int] = {}
    for j in jobs:
        if not j.score_breakdown:
            continue
        try:
            bd = json.loads(j.score_breakdown)
            missing = bd.get("missing_skills", [])
            missing_counts.append(len(missing))
            for s in missing:
                all_missing[s] = all_missing.get(s, 0) + 1
        except Exception:
            pass

    if missing_counts:
        avg_missing = sum(missing_counts) / len(missing_counts)
        top_gaps = sorted(all_missing.items(), key=lambda x: x[1], reverse=True)[:5]
        severity = "high" if avg_missing >= 4 else "medium" if avg_missing >= 2 else "low"
        reasons.append({
            "type": "skill_gap", "label": "Skill gaps",
            "severity": severity,
            "evidence": f"Avg {avg_missing:.1f} missing skills per job — top gaps: {', '.join(s for s,_ in top_gaps[:3])}",
            "top_gaps": [s for s, _ in top_gaps],
        })

    # ── Broad targeting: too many low-score applications ────────────────────
    if len(scored) >= 10:
        avg_score_val = sum(j.score for j in scored) / len(scored)
        below_50 = sum(1 for j in scored if j.score < 50)
        low_pct = below_50 / len(scored)
        if low_pct >= 0.3:
            reasons.append({
                "type": "targeting", "label": "Broad targeting",
                "severity": "high" if low_pct >= 0.5 else "medium",
                "evidence": f"{below_50}/{len(scored)} scored jobs ({round(low_pct*100)}%) are below score 50 — applying too broadly dilutes reply rates",
                "top_gaps": [],
            })
        elif avg_score_val < 60:
            reasons.append({
                "type": "targeting", "label": "Below-average match scores",
                "severity": "low",
                "evidence": f"Avg score {round(avg_score_val)}/100 — raising your threshold to 65+ should improve reply quality",
                "top_gaps": [],
            })

    # ── Profile vs high-score no-reply ───────────────────────────────────────
    if len(with_outcome) >= 10:
        high_scored = [j for j in with_outcome if j.score is not None and j.score >= 80]
        if len(high_scored) >= 5:
            high_reply_rate = len([j for j in high_scored if _reply(j)]) / len(high_scored)
            if high_reply_rate < 0.10:
                reasons.append({
                    "type": "profile", "label": "Profile / presentation gap",
                    "severity": "medium",
                    "evidence": f"High-score jobs (80+) only reply {round(high_reply_rate*100)}% of the time — your resume or cover letter may need updating",
                    "top_gaps": [],
                })

    # ── Experience proxy: low scores without skill gaps ─────────────────────
    if len(scored) >= 10 and missing_counts:
        avg_score_val = sum(j.score for j in scored) / len(scored)
        avg_missing = sum(missing_counts) / len(missing_counts)
        if avg_score_val < 58 and avg_missing < 2:
            reasons.append({
                "type": "experience", "label": "Experience requirements",
                "severity": "medium",
                "evidence": f"Avg score {round(avg_score_val)}/100 with few skill gaps — roles may require more experience than your profile shows",
                "top_gaps": [],
            })

    severity_order = {"high": 0, "medium": 1, "low": 2}
    reasons.sort(key=lambda r: severity_order.get(r["severity"], 3))
    return {
        "primary_reason": reasons[0]["type"] if reasons else "insufficient_data",
        "reasons": reasons,
    }


def _intel_progression(jobs: list) -> dict:
    week_map: dict[str, dict] = {}
    for j in jobs:
        dt = j.applied_at
        if not isinstance(dt, datetime):
            continue
        monday = (dt - timedelta(days=dt.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        key = monday.strftime("%Y-%m-%d")
        if key not in week_map:
            week_map[key] = {"applied": 0, "replied": 0, "scores": [], "date": monday}
        week_map[key]["applied"] += 1
        if j.outcome in ("reply", "interview", "offer"):
            week_map[key]["replied"] += 1
        if j.score is not None:
            week_map[key]["scores"].append(j.score)

    sorted_weeks = sorted(week_map.items())[-12:]
    weeks_out = []
    for key, v in sorted_weeks:
        d = v["date"]
        reply_rate = round(v["replied"] / v["applied"] * 100, 1) if v["applied"] > 0 else 0.0
        avg_s = round(sum(v["scores"]) / len(v["scores"])) if v["scores"] else None
        weeks_out.append({
            "week": key,
            "label": d.strftime("%b ") + str(d.day),
            "applied": v["applied"],
            "replied": v["replied"],
            "reply_rate": reply_rate,
            "avg_score": avg_s,
        })

    def _trend(values: list) -> str:
        clean = [v for v in values if v is not None]
        if len(clean) < 4:
            return "insufficient"
        mid = len(clean) // 2
        first  = sum(clean[:mid]) / mid
        second = sum(clean[mid:]) / (len(clean) - mid)
        diff = second - first
        if first == 0:
            return "improving" if diff > 0 else "stable"
        if diff / first > 0.10:
            return "improving"
        if diff / first < -0.10:
            return "declining"
        return "stable"

    return {
        "weeks":       weeks_out,
        "trend_score": _trend([w["avg_score"] for w in weeks_out]),
        "trend_rate":  _trend([w["reply_rate"] for w in weeks_out]),
    }


def _empty_intelligence() -> dict:
    return {
        "patterns": {
            "by_score_range": [], "by_platform": [], "by_role": [],
            "top_patterns": [], "worst_patterns": [],
        },
        "optimization": {
            "ideal_threshold": 65, "best_platform": "", "best_role": "",
            "threshold_rationale": "No data yet.",
            "platform_rationale": "No data yet.",
            "role_rationale": "No data yet.",
        },
        "rejection": {"primary_reason": "insufficient_data", "reasons": []},
        "progression": {"weeks": [], "trend_score": "insufficient", "trend_rate": "insufficient"},
        "total_analyzed": 0, "with_outcomes": 0, "has_enough_data": False,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_user_and_config(email: str) -> tuple:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(404, "User not found")

        cfg = db.query(ScoringConfig).filter_by(user_email=email).first()
        if not cfg:
            cfg = ScoringConfig(user_email=email)
            db.add(cfg)
            db.commit()
            db.refresh(cfg)

        # Detach from session so we can use outside the with block
        db.expunge(user)
        db.expunge(cfg)
        return user, cfg


def _parse_titles(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def _parse_skills(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _fmt_config(cfg: ScoringConfig) -> dict:
    mode = Mode(cfg.mode)
    return {
        "mode":               cfg.mode,
        "base_threshold":     BASE_THRESHOLDS[mode],
        "threshold_override": cfg.threshold_override,
        "adaptive_enabled":   cfg.adaptive_enabled,
        "threshold_adjustment": cfg.threshold_adjustment,
        "effective_threshold": DecisionEngine(
            mode=mode,
            threshold_override=cfg.threshold_override,
            adaptive_enabled=cfg.adaptive_enabled,
            threshold_adjustment=cfg.threshold_adjustment,
        ).effective_threshold,
        # Flat fields for frontend (scoring page reads these directly)
        "linkedin_daily":    cfg.linkedin_daily,
        "indeed_daily":      cfg.indeed_daily,
        "glassdoor_daily":   cfg.glassdoor_daily,
        "monster_daily":     cfg.monster_daily,
        "google_jobs_daily": cfg.google_jobs_daily,
        "naukri_daily":      cfg.naukri_daily,
        "bayt_daily":        cfg.bayt_daily,
        "timesjobs_daily":   cfg.timesjobs_daily,
        "platform_limits": {
            "linkedin":    cfg.linkedin_daily,
            "indeed":      cfg.indeed_daily,
            "glassdoor":   cfg.glassdoor_daily,
            "monster":     cfg.monster_daily,
            "google_jobs": cfg.google_jobs_daily,
            "naukri":      cfg.naukri_daily,
            "bayt":        cfg.bayt_daily,
            "timesjobs":   cfg.timesjobs_daily,
        },
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


def _build_recommendation(stats, mode_str: str) -> str:
    if stats.applied_30d == 0:
        return "Not enough data yet. Apply to at least 10 jobs to enable adaptive scoring."
    if stats.applied_30d < 10:
        return f"Only {stats.applied_30d} applications in the last 30 days. Apply to more jobs for adaptive scoring to activate."
    if stats.direction == "increasing":
        return (
            f"Your reply rate is {round(stats.success_rate*100,1)}% — below 5%. "
            f"Threshold raised by {stats.threshold_adjustment} points to improve application quality."
        )
    if stats.direction == "decreasing":
        return (
            f"Great reply rate: {round(stats.success_rate*100,1)}%! "
            f"Threshold slightly lowered to increase application volume."
        )
    return f"Stable performance ({round(stats.success_rate*100,1)}% reply rate). Threshold unchanged."
