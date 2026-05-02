"""
AbstractPlatform — the interface every job platform adapter must implement.

The worker calls adapter.run() and gets back a list[JobResult].
It doesn't need to know anything about LinkedIn vs Indeed internals.
"""
import asyncio
import logging
import random
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from playwright.async_api import BrowserContext, Page

from bot.browser.human_behavior import HumanBehavior
from bot.browser.safe_mode import SafeMode

# Backend services are available when the worker runs from the project root
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

logger = logging.getLogger(__name__)


@dataclass
class JobResult:
    title:           str
    company:         str
    location:        str
    url:             str
    platform:        str
    job_id:          str
    description:     Optional[str] = None
    recruiter_name:  Optional[str] = None
    recruiter_phone: Optional[str] = None
    is_easy_apply:   bool          = False
    applied:         bool          = False
    error:           Optional[str] = None
    score:           int           = 0     # 0-100 from job scorer
    score_breakdown: Optional[str] = None  # JSON ScoreResult


@dataclass
class PlatformConfig:
    platform_id:       str
    email:             str
    password:          str
    target_titles:     list[str]
    target_locations:  list[str]
    max_applications:  int
    cv_path:           Optional[str] = None
    phone:             Optional[str] = None
    skills:            Optional[str] = None


class AbstractPlatform(ABC):
    """
    Base class for all platform adapters.

    Subclasses implement:
        login()        → bool
        search_jobs()  → list[JobResult]
        apply_to_job() → JobResult

    The base run() orchestrates them with rate limiting + error handling.
    """

    def __init__(self, config: PlatformConfig, context: BrowserContext):
        self.config      = config
        self.ctx         = context
        self._applied    = 0
        self._log_fn     = None   # Optional async logger injected by worker
        self._user_email = getattr(config, "_user_email", config.email)
        self._safe       = SafeMode(
            user_email = self._user_email,
            daily_max  = config.max_applications,
        )
        self.H = HumanBehavior   # shorthand: self.H.click(page, sel)

        # Scoring engine — loaded lazily on first use
        self._decision_engine = None

    @property
    def platform_id(self) -> str:
        return self.config.platform_id

    @abstractmethod
    async def login(self) -> bool:
        """Authenticate. Returns True on success."""
        ...

    @abstractmethod
    async def search_jobs(self) -> list[JobResult]:
        """Return candidate jobs (not yet applied)."""
        ...

    @abstractmethod
    async def apply_to_job(self, job: JobResult) -> JobResult:
        """Apply to one job. Return updated JobResult with applied=True or error set."""
        ...

    async def run(self) -> list[JobResult]:
        """
        Full automation flow:
          1. Login (abort if fails)
          2. Search jobs
          3. Score each job — skip if below threshold
          4. Apply up to max_applications with safe-mode gaps
        """
        results: list[JobResult] = []

        if not await self.login():
            return results

        # Run adaptive threshold update once per session (non-blocking)
        await self._refresh_adaptive_threshold()

        jobs = await self.search_jobs()
        await self._log(f"Found {len(jobs)} candidate jobs on {self.platform_id}")

        skipped_by_score = 0

        for job in jobs:
            if self._safe.limit_reached():
                await self._log(
                    f"Safe mode: daily cap of {self._safe.daily_max} reached. Stopping.",
                    level="warn",
                )
                break

            # ── Score & decide ──────────────────────────────────────────────
            score_result, decision = await self._score_and_decide(job)
            job.score           = score_result.total
            job.score_breakdown = score_result.to_json()

            if not decision.should_apply:
                skipped_by_score += 1
                await self._log(
                    f"[Score {score_result.total}/100] Skip: {job.title} @ {job.company} — {decision.reason}",
                    level="info",
                )
                continue

            await self._log(
                f"[Score {score_result.total}/100 ≥ {decision.effective_threshold}] "
                f"Queued: {job.title} @ {job.company}",
                level="info",
            )

            # ── Wait & apply ────────────────────────────────────────────────
            await self._safe.wait_before_apply()
            result = await self.apply_to_job(job)
            # Carry score through to result
            result.score           = job.score
            result.score_breakdown = job.score_breakdown
            results.append(result)

            if result.applied:
                self._applied += 1
                self._safe.record()
                await self._log(
                    f"Applied ({self._applied}/{self.config.max_applications}, "
                    f"{self._safe.remaining} remaining today): "
                    f"{result.title} @ {result.company} [score={result.score}]",
                    level="success",
                )
            elif result.error:
                await self._log(f"Skip: {result.title} — {result.error}", level="warn")

        if skipped_by_score:
            await self._log(
                f"Score filter: skipped {skipped_by_score} jobs below threshold on {self.platform_id}.",
                level="info",
            )

        return results

    # ── Helpers ────────────────────────────────────────────────────────────────

    async def _human_delay(self, min_s: float = 1.0, max_s: float = 4.0):
        await asyncio.sleep(random.uniform(min_s, max_s))

    async def _type_human(self, page: Page, selector: str, text: str):
        """Delegates to HumanBehavior.type (curved mouse + gaussian typing)."""
        await HumanBehavior.type(page, selector, text)

    async def _score_and_decide(self, job: JobResult):
        """
        Score a job and run the decision engine.
        Returns (ScoreResult, ApplicationDecisionResult).
        Keyword-scores jobs with empty description (no extra page load needed).
        Falls back to score=75 / should_apply=True if scoring is unavailable.
        """
        try:
            from services.job_scorer import score_job
            from services.decision_engine import DecisionEngine

            engine = self._get_decision_engine()
            result = await score_job(
                job_title     = job.title,
                company       = job.company,
                description   = job.description or "",
                target_titles = self.config.target_titles,
                skills        = [s.strip() for s in (self.config.skills or "").split(",") if s.strip()],
                years_exp     = 0,   # PlatformConfig doesn't expose this yet
                user_email    = self._user_email,
                job_url       = job.url,
            )
            decision = engine.decide(result.total, job.title)
            return result, decision

        except Exception as e:
            logger.warning("Scoring unavailable, defaulting to apply: %s", e)
            from services.job_scorer import ScoreResult
            from services.decision_engine import ApplicationDecisionResult
            fallback_score = ScoreResult(
                total=75, title_score=15, skills_score=25, experience_score=15,
                relevance_score=15, quality_score=5,
                matched_skills=[], missing_skills=[],
                reasoning="Scoring unavailable — applying by default.",
                scorer="fallback",
            )
            fallback_decision = ApplicationDecisionResult(
                should_apply=True, reason="Scoring unavailable — defaulting to apply.",
                score=75, effective_threshold=65, platform=self.platform_id,
            )
            return fallback_score, fallback_decision

    def _get_decision_engine(self):
        if self._decision_engine is None:
            from services.decision_engine import DecisionEngine
            self._decision_engine = DecisionEngine.for_user(
                self._user_email, self.platform_id,
            )
        return self._decision_engine

    async def _refresh_adaptive_threshold(self) -> None:
        """Update adaptive threshold in background — called once per session."""
        try:
            from services.decision_engine import update_adaptive_threshold
            stats = update_adaptive_threshold(self._user_email)
            if stats.threshold_adjustment != 0:
                await self._log(
                    f"Adaptive threshold: {'+' if stats.threshold_adjustment > 0 else ''}"
                    f"{stats.threshold_adjustment} pts "
                    f"(reply rate {round(stats.success_rate*100,1)}% over {stats.applied_30d} apps)",
                    level="info",
                )
            # Reload engine so it picks up the new adjustment
            self._decision_engine = None
        except Exception as e:
            logger.debug("Could not refresh adaptive threshold: %s", e)

    async def _log(self, message: str, level: str = "info"):
        if self._log_fn:
            await self._log_fn(message, level)

    async def _get_text(self, page: Page, *selectors: str) -> str:
        """Try selectors in order, return first non-empty inner text."""
        for sel in selectors:
            el = page.locator(sel).first
            if await el.count():
                text = (await el.inner_text()).strip()
                if text:
                    return text
        return ""

    async def _fill_common_fields(self, page: Page):
        """
        Fill form fields common to most job application modals:
        phone, experience years, salary, notice period, Yes/No radios, dropdowns.
        """
        # Phone
        if self.config.phone:
            for sel in ["input[id*='phoneNumber']", "input[type='tel']", "input[name*='phone']"]:
                inp = page.locator(sel)
                if await inp.count() and not await inp.first.input_value():
                    await inp.first.fill(self.config.phone)

        # Text / number inputs
        for inp in await page.locator(
            "input[type='text']:visible, input[type='number']:visible"
        ).all():
            try:
                if await inp.input_value():
                    continue
                lbl = " ".join([
                    await inp.get_attribute("aria-label")   or "",
                    await inp.get_attribute("placeholder")  or "",
                    await inp.get_attribute("name")         or "",
                ]).lower()
                lid = await inp.get_attribute("aria-labelledby") or ""
                if lid:
                    lel = page.locator(f"#{lid}")
                    if await lel.count():
                        lbl += " " + (await lel.inner_text()).lower()

                if any(k in lbl for k in ["year", "experience"]):
                    await inp.fill("3")
                elif any(k in lbl for k in ["salary", "ctc", "pay", "expected"]):
                    await inp.fill("800000")
                elif "notice" in lbl:
                    await inp.fill("30")
                elif lbl.strip():
                    await inp.fill("3")
                await asyncio.sleep(random.uniform(0.15, 0.35))
            except Exception:
                pass

        # Radio buttons — pick Yes
        for radio in await page.locator("input[type='radio']:visible").all():
            try:
                val = (await radio.get_attribute("value") or "").lower()
                if val in ("yes", "true", "1"):
                    await radio.check()
                    await asyncio.sleep(random.uniform(0.1, 0.3))
            except Exception:
                pass

        # Dropdowns — pick Yes or first non-placeholder option
        for sel in await page.locator("select:visible").all():
            try:
                opts = await sel.locator("option").all_inner_texts()
                yes  = [o for o in opts if "yes" in o.lower()]
                if yes:
                    await sel.select_option(label=yes[0])
                elif len(opts) > 1:
                    await sel.select_option(index=1)
                await asyncio.sleep(random.uniform(0.1, 0.3))
            except Exception:
                pass

        # CV upload
        if self.config.cv_path:
            from pathlib import Path
            if Path(self.config.cv_path).exists():
                upload = page.locator("input[type='file']")
                if await upload.count():
                    await upload.first.set_input_files(self.config.cv_path)
                    await asyncio.sleep(1.5)
