"""
Indeed platform adapter — Easily Apply automation.
"""
import asyncio
import random
import urllib.parse
from pathlib import Path
import sys

from playwright.async_api import BrowserContext, Page

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from .base import AbstractPlatform, PlatformConfig, JobResult


class IndeedAdapter(AbstractPlatform):

    LOGIN_URL  = "https://secure.indeed.com/auth"
    SEARCH_URL = "https://www.indeed.com/jobs"

    async def login(self) -> bool:
        from bot.browser.session_manager import load_session, save_session, invalidate_session

        page = await self.ctx.new_page()
        try:
            if await load_session(self.ctx, self.config.email, "indeed"):
                await page.goto("https://www.indeed.com/myjobs",
                                wait_until="domcontentloaded", timeout=15000)
                await asyncio.sleep(2)
                if "myjobs" in page.url or "my-jobs" in page.url:
                    return True
                invalidate_session(self.config.email, "indeed")

            await page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # Email step
            email_sel = "input[name='__email'], input[type='email']"
            await page.wait_for_selector(email_sel, timeout=10000)
            await self._type_human(page, email_sel, self.config.email)
            await asyncio.sleep(random.uniform(0.5, 1.0))
            for btn in ["button[type='submit']", "button:has-text('Continue')"]:
                if await page.locator(btn).count():
                    await page.locator(btn).first.click()
                    break
            await asyncio.sleep(random.uniform(2.5, 3.5))

            # Password step
            pw_sel = "input[type='password']"
            await page.wait_for_selector(pw_sel, timeout=10000)
            await self._type_human(page, pw_sel, self.config.password)
            await asyncio.sleep(random.uniform(0.5, 1.0))
            for btn in ["button[type='submit']", "button:has-text('Sign in')"]:
                if await page.locator(btn).count():
                    await page.locator(btn).first.click()
                    break
            await asyncio.sleep(random.uniform(3.0, 4.5))

            url = page.url
            if "challenge" in url or "verify" in url:
                await self._log("Indeed requires verification. Complete manually once.", "error")
                return False

            if "indeed.com" in url and "auth" not in url:
                await save_session(self.ctx, self.config.email, "indeed")
                return True

            await self._log("Indeed login failed — check credentials", "error")
            return False
        finally:
            await page.close()

    async def search_jobs(self) -> list[JobResult]:
        jobs: list[JobResult] = []
        page = await self.ctx.new_page()
        try:
            for title in self.config.target_titles[:2]:
                for location in self.config.target_locations[:2]:
                    params = urllib.parse.urlencode({
                        "q":        title,
                        "l":        location,
                        "iafilter": "1",     # Easily Apply only
                        "sort":     "date",
                        "fromage":  "3",     # Last 3 days
                    })
                    await page.goto(f"{self.SEARCH_URL}?{params}",
                                    wait_until="domcontentloaded", timeout=20000)
                    await asyncio.sleep(random.uniform(2.5, 4.0))

                    for sel in ["a.jcs-JobTitle", "h2.jobTitle a", "a[data-jk]"]:
                        els = page.locator(sel)
                        n   = await els.count()
                        if n == 0:
                            continue
                        for i in range(min(n, 20)):
                            try:
                                href = await els.nth(i).get_attribute("href") or ""
                                if not href:
                                    continue
                                full = (
                                    f"https://www.indeed.com{href}"
                                    if href.startswith("/") else href
                                )
                                jk = ""
                                if "jk=" in full:
                                    jk = full.split("jk=")[1][:16]
                                if jk and not any(j.job_id == jk for j in jobs):
                                    jobs.append(JobResult(
                                        title        = title,
                                        company      = "",
                                        location     = location,
                                        url          = full,
                                        platform     = "indeed",
                                        job_id       = jk,
                                        is_easy_apply = True,
                                    ))
                            except Exception:
                                continue
                        break
        finally:
            await page.close()
        return jobs

    async def apply_to_job(self, job: JobResult) -> JobResult:
        page = await self.ctx.new_page()
        try:
            await page.goto(job.url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # Extract title/company
            job.title   = await self._get_text(
                page,
                "h1.jobsearch-JobInfoHeader-title", "h1[class*='title']", "h1"
            ) or job.title
            job.company = await self._get_text(
                page,
                "[data-testid='inlineHeader-companyName'] a",
                "[data-testid='inlineHeader-companyName']",
                "[class*='companyName']",
            ) or job.company

            # Find apply button
            apply_btn = None
            for sel in [
                "button#indeedApplyButton",
                "button[class*='indeed-apply']",
                "span[class*='indeed-apply'] button",
            ]:
                el = page.locator(sel).first
                if await el.count():
                    apply_btn = el
                    break

            if not apply_btn:
                job.error = "No Easily Apply button"
                return job

            await apply_btn.click()
            await asyncio.sleep(random.uniform(1.5, 2.5))

            # Indeed opens the form in an iframe
            success = await self._fill_indeed_modal(page)
            if success:
                job.applied = True
            else:
                job.error = "Could not complete Indeed application form"

            return job
        except Exception as e:
            job.error = str(e)
            return job
        finally:
            await page.close()

    async def _fill_indeed_modal(self, page: Page) -> bool:
        """Navigate the Indeed Easily Apply multi-step modal."""
        # Try inline frame or direct page form
        frame = page.frame_locator("iframe[title*='application'], iframe[title*='Job']")

        for step in range(8):
            await asyncio.sleep(random.uniform(0.8, 1.5))

            # Check confirmation
            for confirmed_sel in [
                ":text('Application submitted')",
                ":text('application was submitted')",
                ":text('Your application')",
            ]:
                if await page.locator(confirmed_sel).count():
                    return True
            if "thank" in page.url or "applied" in page.url:
                return True

            # Fill fields — try both frame and direct page
            for container in [frame, page]:
                await self._fill_frame_fields(container)

            # Advance
            clicked = False
            for label in ["Continue", "Next", "Submit your application", "Apply now", "Review"]:
                for container in [frame, page]:
                    btn = container.locator(
                        f"button:has-text('{label}'), input[value='{label}']"
                    )
                    if await btn.count():
                        await btn.first.click()
                        await asyncio.sleep(random.uniform(1.0, 2.0))
                        clicked = True
                        break
                if clicked:
                    break
            if not clicked:
                break

        return await page.locator(
            ":text('Application submitted'), :text('application was submitted')"
        ).count() > 0

    async def _fill_frame_fields(self, container):
        """Fill form fields in an iframe or the page itself."""
        try:
            # CV upload
            if self.config.cv_path and Path(self.config.cv_path).exists():
                upload = container.locator("input[type='file']")
                if await upload.count():
                    await upload.first.set_input_files(self.config.cv_path)
                    await asyncio.sleep(1.5)

            # Phone
            if self.config.phone:
                for sel in ["input[name='phone']", "input[id*='phone']", "input[type='tel']"]:
                    inp = container.locator(sel)
                    if await inp.count() and not await inp.first.input_value():
                        await inp.first.fill(self.config.phone)
                        break

            # Generic text inputs
            for inp in await container.locator(
                "input[type='text']:visible, input[type='number']:visible, textarea:visible"
            ).all():
                try:
                    if await inp.input_value():
                        continue
                    hint = (
                        (await inp.get_attribute("placeholder") or "")
                        + (await inp.get_attribute("name") or "")
                        + (await inp.get_attribute("aria-label") or "")
                    ).lower()
                    if "year" in hint or "experience" in hint:
                        await inp.fill("3")
                    elif "salary" in hint or "pay" in hint:
                        await inp.fill("800000")
                    elif "notice" in hint:
                        await inp.fill("30")
                    await asyncio.sleep(random.uniform(0.1, 0.3))
                except Exception:
                    pass

            # Radio — Yes
            for r in await container.locator("input[type='radio']:visible").all():
                try:
                    if (await r.get_attribute("value") or "").lower() in ("yes", "true", "1"):
                        await r.check()
                except Exception:
                    pass
        except Exception:
            pass
