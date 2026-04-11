"""Monster.com platform adapter."""
import asyncio
import random
import sys
import urllib.parse
from pathlib import Path

from playwright.async_api import BrowserContext

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from .base import AbstractPlatform, PlatformConfig, JobResult


class MonsterAdapter(AbstractPlatform):

    LOGIN_URL  = "https://www.monster.com/profile/login"
    SEARCH_URL = "https://www.monster.com/jobs/search"

    async def login(self) -> bool:
        from bot.browser.session_manager import load_session, save_session

        page = await self.ctx.new_page()
        try:
            if await load_session(self.ctx, self.config.email, "monster"):
                await page.goto("https://www.monster.com/profile/",
                                wait_until="domcontentloaded", timeout=15000)
                if "profile" in page.url:
                    return True

            await page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 3.0))

            await self._type_human(page, "input[type='email']", self.config.email)
            await asyncio.sleep(random.uniform(0.5, 1.0))
            await self._type_human(page, "input[type='password']", self.config.password)
            await asyncio.sleep(random.uniform(0.5, 1.0))
            await page.click("button[type='submit']")
            await asyncio.sleep(random.uniform(3.0, 4.5))

            if "monster.com" in page.url and "login" not in page.url:
                await save_session(self.ctx, self.config.email, "monster")
                return True

            await self._log("Monster login failed", "error")
            return False
        finally:
            await page.close()

    async def search_jobs(self) -> list[JobResult]:
        jobs: list[JobResult] = []
        page = await self.ctx.new_page()
        try:
            for title in self.config.target_titles[:2]:
                for location in self.config.target_locations[:2]:
                    params = urllib.parse.urlencode({"q": title, "where": location})
                    await page.goto(f"{self.SEARCH_URL}?{params}",
                                    wait_until="domcontentloaded", timeout=20000)
                    await asyncio.sleep(random.uniform(2.5, 4.0))

                    for card in await page.locator(
                        "section.card-content, div[data-jobid]"
                    ).all():
                        try:
                            jid      = await card.get_attribute("data-jobid") or ""
                            title_el = card.locator("[class*='title']").first
                            co_el    = card.locator("[class*='company']").first
                            if not jid:
                                link = card.locator("a").first
                                href = await link.get_attribute("href") or ""
                                jid  = href.split("/")[-1][:20]
                            if jid:
                                jobs.append(JobResult(
                                    title        = await title_el.inner_text() if await title_el.count() else title,
                                    company      = await co_el.inner_text() if await co_el.count() else "",
                                    location     = location,
                                    url          = f"https://www.monster.com/job-openings/{jid}",
                                    platform     = "monster",
                                    job_id       = jid,
                                    is_easy_apply = False,
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
            await asyncio.sleep(random.uniform(2.0, 3.0))

            apply_btn = page.locator(
                "button:has-text('Apply'), a:has-text('Apply Now')"
            ).first
            if not await apply_btn.count():
                job.error = "No apply button"
                return job

            await apply_btn.click()
            await asyncio.sleep(random.uniform(1.5, 2.5))
            await self._fill_common_fields(page)

            for _ in range(5):
                await asyncio.sleep(1.0)
                done = page.locator("button:has-text('Submit'), button:has-text('Send Application')")
                if await done.count():
                    await done.first.click()
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
