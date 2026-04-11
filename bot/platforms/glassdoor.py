"""Glassdoor platform adapter — Easy Apply via Glassdoor's job listings."""
import asyncio
import random
import sys
import urllib.parse
from pathlib import Path

from playwright.async_api import BrowserContext, Page

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from .base import AbstractPlatform, PlatformConfig, JobResult


class GlassdoorAdapter(AbstractPlatform):

    LOGIN_URL  = "https://www.glassdoor.com/profile/login_input.htm"
    SEARCH_URL = "https://www.glassdoor.com/Job/jobs.htm"

    async def login(self) -> bool:
        from bot.browser.session_manager import load_session, save_session

        page = await self.ctx.new_page()
        try:
            if await load_session(self.ctx, self.config.email, "glassdoor"):
                await page.goto("https://www.glassdoor.com/member/home/index.htm",
                                wait_until="domcontentloaded", timeout=15000)
                if "home" in page.url:
                    return True

            await page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 3.0))

            await self._type_human(page, "input[name='username']", self.config.email)
            await asyncio.sleep(random.uniform(0.5, 1.0))
            await self._type_human(page, "input[name='password']", self.config.password)
            await asyncio.sleep(random.uniform(0.5, 1.0))
            await page.click("button[type='submit'], button[data-test='submit-btn']")
            await asyncio.sleep(random.uniform(3.0, 4.5))

            if "glassdoor.com" in page.url and "login" not in page.url:
                await save_session(self.ctx, self.config.email, "glassdoor")
                return True

            await self._log("Glassdoor login failed", "error")
            return False
        finally:
            await page.close()

    async def search_jobs(self) -> list[JobResult]:
        jobs: list[JobResult] = []
        page = await self.ctx.new_page()
        try:
            for title in self.config.target_titles[:2]:
                for location in self.config.target_locations[:2]:
                    params = urllib.parse.urlencode({"sc.keyword": title, "locT": "C", "locKeyword": location})
                    await page.goto(f"{self.SEARCH_URL}?{params}",
                                    wait_until="domcontentloaded", timeout=20000)
                    await asyncio.sleep(random.uniform(2.5, 4.0))

                    for el in await page.locator("li.react-job-listing, article[data-jobid]").all():
                        try:
                            jid = await el.get_attribute("data-jobid") or ""
                            if not jid:
                                continue
                            title_el   = el.locator("[class*='jobTitle'], [class*='job-title']").first
                            company_el = el.locator("[class*='employerName'], [class*='company']").first
                            jobs.append(JobResult(
                                title        = await title_el.inner_text() if await title_el.count() else title,
                                company      = await company_el.inner_text() if await company_el.count() else "",
                                location     = location,
                                url          = f"https://www.glassdoor.com/job-listing/x?jl={jid}",
                                platform     = "glassdoor",
                                job_id       = jid,
                                is_easy_apply = True,
                            ))
                        except Exception:
                            continue
        finally:
            await page.close()
        return jobs

    async def apply_to_job(self, job: JobResult) -> JobResult:
        page = await self.ctx.new_page()
        try:
            await page.goto(job.url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 3.5))

            apply_btn = page.locator(
                "button[data-test='apply-button'], button:has-text('Easy Apply'), "
                "button:has-text('Apply Now')"
            ).first
            if not await apply_btn.count():
                job.error = "No apply button"
                return job

            await apply_btn.click()
            await asyncio.sleep(random.uniform(1.5, 2.5))
            await self._fill_common_fields(page)

            for step in range(6):
                await asyncio.sleep(random.uniform(0.8, 1.5))
                submit = page.locator("button:has-text('Submit'), button:has-text('Apply')")
                if await submit.count():
                    await submit.first.click()
                    await asyncio.sleep(2.0)
                    job.applied = True
                    return job
                nxt = page.locator("button:has-text('Next'), button:has-text('Continue')")
                if await nxt.count():
                    await nxt.first.click()
                else:
                    break

            return job
        except Exception as e:
            job.error = str(e)
            return job
        finally:
            await page.close()
