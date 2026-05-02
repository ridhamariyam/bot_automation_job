"""
LinkedIn Jobs adapter — Easy Apply automation with stealth.

Features:
- DB-backed session persistence (no filesystem cookies)
- Multi-step Easy Apply form filler
- Recruiter phone extraction from job descriptions
- Email fallback for non-Easy-Apply jobs
"""
import asyncio
import random
import re
import smtplib
import os
import sys
import urllib.parse
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from playwright.async_api import BrowserContext, Page

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from .base import AbstractPlatform, PlatformConfig, JobResult

PHONE_RE = re.compile(
    r'(?:\+?91[\s\-]?)?[6-9]\d{9}'          # Indian
    r'|\+\d{1,3}[\s\-.]?\d{6,14}'            # International
    r'|\(\d{3}\)\s?\d{3}[\-\s]\d{4}'         # US
)


class LinkedInJobsAdapter(AbstractPlatform):

    LOGIN_URL = "https://www.linkedin.com/login"
    JOBS_URL  = "https://www.linkedin.com/jobs/search/"

    def __init__(self, config: PlatformConfig, context: BrowserContext):
        super().__init__(config, context)
        self._user_email = getattr(config, "_user_email", config.email)

    async def login(self) -> bool:
        from bot.browser.session_manager import (
            invalidate_session,
            load_session,
            save_session,
            validate_authenticated_session,
        )

        page = await self.ctx.new_page()
        try:
            # Try saved session first
            if await load_session(self.ctx, self._user_email, "linkedin"):
                if await validate_authenticated_session(self.ctx, "linkedin"):
                    await self._log("LinkedIn session restored", "info")
                    return True
                invalidate_session(self._user_email, "linkedin")
                await self._log("SESSION_EXPIRED", "warn")

            if not self.config.email or not self.config.password:
                await self._log("LinkedIn session expired — reconnect", "error")
                return False

            # Fresh login
            await page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(random.uniform(1.5, 2.5))

            await self._type_human(page, "#username", self.config.email)
            await asyncio.sleep(random.uniform(0.5, 1.0))
            await self._type_human(page, "#password", self.config.password)
            await asyncio.sleep(random.uniform(0.8, 1.5))
            await page.click("button[type='submit']")
            await page.wait_for_load_state("networkidle", timeout=15000)

            url = page.url
            if "feed" in url:
                await save_session(self.ctx, self._user_email, "linkedin")
                await self._log("LinkedIn login successful", "success")
                return True
            if "checkpoint" in url or "challenge" in url:
                await self._log(
                    "LinkedIn requires OTP verification. Log in manually once then retry.",
                    "error",
                )
                return False

            await self._log("LinkedIn login failed — check credentials", "error")
            return False
        finally:
            await page.close()

    async def search_jobs(self) -> list[JobResult]:
        jobs: list[JobResult] = []
        page = await self.ctx.new_page()
        try:
            for title in self.config.target_titles[:3]:
                for location in self.config.target_locations[:2]:
                    batch = await self._search_one(page, title, location)
                    jobs.extend(batch)
                    if len(jobs) >= self.config.max_applications * 2:
                        return jobs
                    await asyncio.sleep(random.uniform(1.5, 3.0))
        finally:
            await page.close()
        return jobs

    async def _search_one(self, page: Page, title: str, location: str) -> list[JobResult]:
        params = urllib.parse.urlencode({
            "keywords": title,
            "location": location,
            "f_AL":     "true",   # Easy Apply only
            "sortBy":   "DD",     # Most recent
            "f_TPR":    "r86400", # Last 24 hours
        })
        await page.goto(f"{self.JOBS_URL}?{params}",
                        wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(random.uniform(2.5, 4.0))

        # Scroll to load more results
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, 600)")
            await asyncio.sleep(random.uniform(0.8, 1.5))

        results: list[JobResult] = []
        for sel_group in [
            "[data-occludable-job-id]",
            "[data-job-id]",
            "a[href*='/jobs/view/']",
        ]:
            els = page.locator(sel_group)
            n   = await els.count()
            if n == 0:
                continue
            for i in range(min(n, 20)):
                try:
                    el   = els.nth(i)
                    jid  = (
                        await el.get_attribute("data-occludable-job-id")
                        or await el.get_attribute("data-job-id")
                        or ""
                    )
                    if not jid:
                        href = await el.get_attribute("href") or ""
                        m    = re.search(r"/jobs/view/(\d+)", href)
                        if m:
                            jid = m.group(1)
                    if jid and not any(r.job_id == jid for r in results):
                        results.append(JobResult(
                            title        = title,
                            company      = "",
                            location     = location,
                            url          = f"https://www.linkedin.com/jobs/view/{jid}/",
                            platform     = "linkedin",
                            job_id       = jid,
                            is_easy_apply = True,
                        ))
                except Exception:
                    continue
            break

        return results

    async def apply_to_job(self, job: JobResult) -> JobResult:
        from bot.browser.session_manager import save_session

        page = await self.ctx.new_page()
        try:
            await page.goto(job.url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # Enrich job metadata
            job.title   = await self._get_text(
                page,
                "h1.t-24", "h1.job-details-jobs-unified-top-card__job-title", "h1"
            ) or job.title
            job.company = await self._get_text(
                page,
                ".job-details-jobs-unified-top-card__company-name a",
                ".jobs-unified-top-card__company-name",
            ) or job.company
            job.location = await self._get_text(
                page,
                ".job-details-jobs-unified-top-card__bullet",
                ".jobs-unified-top-card__bullet",
            ) or job.location

            # Extract description + recruiter phone
            try:
                desc_el = page.locator(
                    ".jobs-description__content, .jobs-description-content"
                ).first
                if await desc_el.count():
                    job.description = await desc_el.inner_text()
                    phones = PHONE_RE.findall(job.description)
                    if phones:
                        job.recruiter_phone = phones[0]
            except Exception:
                pass

            # Try Easy Apply
            easy_btn = None
            for sel in ["button.jobs-apply-button", "button[aria-label*='Easy Apply']"]:
                el = page.locator(sel).first
                if await el.count():
                    easy_btn = el
                    break

            if easy_btn:
                await easy_btn.click()
                await asyncio.sleep(random.uniform(1.0, 2.0))
                success = await self._complete_easy_apply(page)
                if success:
                    job.applied = True
                else:
                    # Dismiss modal
                    for lbl in ["Dismiss", "Cancel"]:
                        d = page.locator(f"button[aria-label='{lbl}']")
                        if await d.count():
                            await d.click()
                            await asyncio.sleep(0.5)
                            discard = page.locator(
                                "button[data-control-name='discard_application_confirm_btn'],"
                                "button:has-text('Discard')"
                            )
                            if await discard.count():
                                await discard.first.click()
                            break
                    job.error = "Easy Apply form could not be completed"
            else:
                # Email fallback
                body_text   = await page.inner_text("body")
                email_match = re.search(
                    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", body_text
                )
                if email_match and "linkedin.com" not in email_match.group():
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
                else:
                    job.error = "No Easy Apply and no recruiter email found"

            await save_session(self.ctx, self._user_email, "linkedin")
            return job

        except Exception as e:
            job.error = str(e)
            return job
        finally:
            await page.close()

    async def _complete_easy_apply(self, page: Page) -> bool:
        """Work through multi-step Easy Apply modal. Returns True on success."""
        for step in range(15):
            await asyncio.sleep(random.uniform(0.5, 1.0))

            # Success indicators
            if await page.locator(
                "h3:has-text('Application submitted'), "
                "div:has-text('Your application was sent')"
            ).count():
                return True

            # Submit button (final step)
            for lbl in ["Submit application", "Submit Application"]:
                btn = page.locator(f"button[aria-label='{lbl}']")
                if await btn.count():
                    await btn.click()
                    await asyncio.sleep(random.uniform(1.5, 2.5))
                    return True

            # Fill form fields
            await self._fill_common_fields(page)

            # Advance to next step
            advanced = False
            for lbl in ["Next", "Continue", "Review", "Review your application", "Done"]:
                btn = page.locator(f"button[aria-label='{lbl}']")
                if await btn.count():
                    await btn.click()
                    await asyncio.sleep(random.uniform(0.8, 1.5))
                    advanced = True
                    break
            if not advanced:
                break

        return False


# ── Email fallback ─────────────────────────────────────────────────────────────

def _send_email_application(
    to_email:  str,
    job_title: str,
    company:   str,
    cv_path:   str,
    user_name: str,
    skills:    str,
    phone:     str,
) -> bool:
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not smtp_user or not smtp_pass:
        return False

    top_skills = ", ".join(s.strip() for s in skills.split(",")[:6] if s.strip())
    msg        = MIMEMultipart()
    msg["Subject"] = f"Application for {job_title} — {user_name or smtp_user}"
    msg["From"]    = smtp_user
    msg["To"]      = to_email
    msg.attach(MIMEText(
        f"Dear Hiring Team at {company},\n\n"
        f"I am writing to express my interest in the {job_title} position.\n\n"
        f"With expertise in {top_skills}, I am confident I can contribute to your team. "
        f"Please find my CV attached.\n\n"
        f"Best regards,\n{user_name or smtp_user}\n{phone}",
        "plain",
    ))
    if cv_path and Path(cv_path).exists():
        with open(cv_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        fn = f"{(user_name or 'Applicant').replace(' ', '_')}_CV.pdf"
        part.add_header("Content-Disposition", f'attachment; filename="{fn}"')
        msg.attach(part)

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, to_email, msg.as_string())
        return True
    except Exception:
        return False
