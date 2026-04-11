"""
Google Jobs adapter — scrapes Google Jobs search results and applies
by following through to the recruiter's ATS/company page.

Note: Google Jobs doesn't have its own apply flow — it redirects to
external ATS pages (Greenhouse, Lever, Workday, etc.).
This adapter: scrapes job listings → tries email-based application.
"""
import asyncio
import random
import re
import sys
import urllib.parse
from pathlib import Path

from playwright.async_api import BrowserContext, Page

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from .base import AbstractPlatform, PlatformConfig, JobResult
from .linkedin_jobs import _send_email_application


class GoogleJobsAdapter(AbstractPlatform):
    """
    Scrapes Google Jobs SERP for job listings.
    No login required. Applies via email when contact found on job page.
    """

    async def login(self) -> bool:
        # Google Jobs requires no authentication
        return True

    async def search_jobs(self) -> list[JobResult]:
        jobs: list[JobResult] = []
        page = await self.ctx.new_page()
        try:
            for title in self.config.target_titles[:2]:
                for location in self.config.target_locations[:2]:
                    params = urllib.parse.urlencode({
                        "q":     f"{title} jobs in {location}",
                        "ibp":   "htl;jobs",
                    })
                    await page.goto(
                        f"https://www.google.com/search?{params}",
                        wait_until="domcontentloaded", timeout=20000,
                    )
                    await asyncio.sleep(random.uniform(2.0, 3.5))

                    # Google Jobs results appear in a special panel
                    for card in await page.locator(
                        "li.iFjolb, div[jscontroller][data-ved] li"
                    ).all():
                        try:
                            title_el   = card.locator("div.BjJfJf, [class*='title']").first
                            company_el = card.locator("div.vNEEBe, [class*='company']").first
                            jid        = await card.get_attribute("data-ved") or str(random.random())

                            jobs.append(JobResult(
                                title        = await title_el.inner_text() if await title_el.count() else title,
                                company      = await company_el.inner_text() if await company_el.count() else "",
                                location     = location,
                                url          = page.url,
                                platform     = "google_jobs",
                                job_id       = jid[:30],
                                is_easy_apply = False,
                            ))
                        except Exception:
                            continue
        finally:
            await page.close()
        return jobs

    async def apply_to_job(self, job: JobResult) -> JobResult:
        """
        Google Jobs doesn't have a native apply flow.
        Try to find an email address in the job description and apply via email.
        """
        page = await self.ctx.new_page()
        try:
            await page.goto(job.url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 3.0))

            body_text   = await page.inner_text("body")
            email_match = re.search(
                r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", body_text
            )
            if not email_match or "google.com" in email_match.group():
                job.error = "No recruiter email found on Google Jobs listing"
                return job

            sent = _send_email_application(
                to_email  = email_match.group(),
                job_title = job.title,
                company   = job.company,
                cv_path   = self.config.cv_path or "",
                user_name = "",
                skills    = self.config.skills or "",
                phone     = self.config.phone or "",
            )
            if sent:
                job.applied = True
                job.proof   = f"Email to {email_match.group()}"
            else:
                job.error = "Email send failed"

            return job
        except Exception as e:
            job.error = str(e)
            return job
        finally:
            await page.close()
