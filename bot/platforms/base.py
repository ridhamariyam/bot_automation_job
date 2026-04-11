"""
AbstractPlatform — the interface every job platform adapter must implement.

The worker calls adapter.run() and gets back a list[JobResult].
It doesn't need to know anything about LinkedIn vs Indeed internals.
"""
import asyncio
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from playwright.async_api import BrowserContext, Page


@dataclass
class JobResult:
    title:          str
    company:        str
    location:       str
    url:            str
    platform:       str
    job_id:         str
    description:    Optional[str] = None
    recruiter_name: Optional[str] = None
    recruiter_phone: Optional[str] = None
    is_easy_apply:  bool          = False
    applied:        bool          = False
    error:          Optional[str] = None


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
        self.config   = config
        self.ctx      = context
        self._applied = 0
        self._log_fn  = None   # Optional async logger injected by worker

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
        Full automation flow. Override only if you need custom orchestration.
        1. Login (abort if fails)
        2. Search jobs
        3. Apply up to max_applications
        """
        results: list[JobResult] = []

        if not await self.login():
            return results

        jobs = await self.search_jobs()
        await self._log(f"Found {len(jobs)} candidate jobs on {self.platform_id}")

        for job in jobs:
            if self._applied >= self.config.max_applications:
                break
            result = await self.apply_to_job(job)
            results.append(result)
            if result.applied:
                self._applied += 1
                await self._log(
                    f"Applied ({self._applied}/{self.config.max_applications}): "
                    f"{result.title} @ {result.company}",
                    level="success",
                )
            elif result.error:
                await self._log(f"Skip: {result.title} — {result.error}", level="warn")

            await self._human_delay(3.0, 9.0)

        return results

    # ── Helpers ────────────────────────────────────────────────────────────────

    async def _human_delay(self, min_s: float = 1.0, max_s: float = 4.0):
        """Randomised delay simulating human reading/thinking time."""
        await asyncio.sleep(random.uniform(min_s, max_s))

    async def _type_human(self, page: Page, selector: str, text: str):
        """Type text character-by-character with randomised per-key delays."""
        await page.click(selector)
        await page.fill(selector, "")
        for ch in text:
            await page.type(selector, ch, delay=random.randint(45, 130))
        await asyncio.sleep(random.uniform(0.2, 0.5))

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
