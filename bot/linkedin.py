"""
LinkedIn bot — Easy Apply + email fallback via Gmail SMTP.
Logs every action to DB so dashboard shows live activity.
"""
import asyncio, json, random, re, smtplib, os
from pathlib import Path
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import httpx
from playwright.async_api import async_playwright, Page, BrowserContext

SESSION_DIR = Path(__file__).parent / "sessions"
SESSION_DIR.mkdir(exist_ok=True)

BASE_URL = "http://localhost:8000"
HEADLESS = True  # Always run headless — frontend should never see the browser
SHORT, MEDIUM, LONG = (0.8, 1.8), (2.0, 3.5), (4.0, 7.0)


# ── Logging ──────────────────────────────────────────────────────────────────
async def _log(user_email: str, msg: str, level: str = "info"):
    print(f"[{level.upper()}] {msg}")
    async with httpx.AsyncClient() as c:
        try:
            await c.post(f"{BASE_URL}/api/bot/log",
                json={"user_email": user_email, "message": msg, "level": level},
                timeout=5)
        except Exception:
            pass


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _delay(r=MEDIUM):
    await asyncio.sleep(random.uniform(*r))

async def _type(page: Page, sel: str, text: str):
    await page.click(sel)
    await page.fill(sel, "")
    for ch in text:
        await page.type(sel, ch, delay=random.randint(60, 150))

async def _save_session(ctx: BrowserContext, email: str):
    (SESSION_DIR / f"li_{email.replace('@','_')}.json").write_text(
        json.dumps(await ctx.cookies()))

async def _load_session(ctx: BrowserContext, email: str) -> bool:
    p = SESSION_DIR / f"li_{email.replace('@','_')}.json"
    if not p.exists():
        return False
    await ctx.add_cookies(json.loads(p.read_text()))
    return True

async def _logged_in(page: Page) -> bool:
    try:
        await page.goto("https://www.linkedin.com/feed/",
            wait_until="domcontentloaded", timeout=15000)
        await _delay(SHORT)
        return "feed" in page.url
    except Exception:
        return False


# ── Login ─────────────────────────────────────────────────────────────────────
async def _login(page: Page, email: str, password: str, user_email: str) -> bool:
    await _log(user_email, "Logging into LinkedIn…")
    await page.goto("https://www.linkedin.com/login",
        wait_until="domcontentloaded", timeout=15000)
    await _delay(SHORT)
    await _type(page, "#username", email)
    await _delay(SHORT)
    await _type(page, "#password", password)
    await _delay(SHORT)
    await page.click("button[type='submit']")
    await _delay(MEDIUM)

    if "checkpoint" in page.url or "challenge" in page.url:
        await _log(user_email,
            "LinkedIn requires OTP verification. Please log in once manually in your browser, then restart the bot.",
            "error")
        return False

    if "feed" in page.url:
        await _log(user_email, "LinkedIn login successful ✓", "success")
        return True

    await _log(user_email, f"LinkedIn login failed — check your credentials.", "error")
    return False


# ── Record application ────────────────────────────────────────────────────────
async def _record(user_email: str, title: str, company: str,
                  location: str, url: str, method: str = "Easy Apply"):
    async with httpx.AsyncClient() as c:
        try:
            await c.post(f"{BASE_URL}/api/jobs", json={
                "user_email": user_email, "title": title, "company": company,
                "location": location, "platform": "LinkedIn",
                "job_url": url, "status": "Applied",
                "proof": f"{method} — {url}",
            }, timeout=10)
        except Exception as e:
            await _log(user_email, f"DB record failed: {e}", "warn")


# ── Easy Apply ────────────────────────────────────────────────────────────────
async def _easy_apply(page: Page, profile: dict, user_email: str) -> bool:
    for step in range(15):
        await _delay(SHORT)

        if await page.locator(
            "h3:has-text('Application submitted'), div:has-text('Your application was sent')"
        ).count():
            return True

        # Submit
        for lbl in ["Submit application", "Submit Application"]:
            btn = page.locator(f"button[aria-label='{lbl}']")
            if await btn.count():
                await btn.click()
                await _delay(MEDIUM)
                return True

        # Phone
        ph = page.locator("input[id*='phoneNumber'], input[type='tel']")
        if await ph.count() and not await ph.first.input_value():
            await ph.first.fill(profile.get("phone", ""))

        # CV upload
        fi = page.locator("input[type='file']")
        if await fi.count():
            cv = profile.get("cv_path", "")
            if cv and Path(cv).exists():
                await fi.first.set_input_files(cv)
                await _delay(MEDIUM)

        # Text inputs
        for inp in await page.locator(
            "input[type='text']:visible, input[type='number']:visible"
        ).all():
            try:
                if await inp.input_value():
                    continue
                lbl = ""
                for attr in ["aria-label", "placeholder"]:
                    v = await inp.get_attribute(attr) or ""
                    if v:
                        lbl = v.lower(); break
                lid = await inp.get_attribute("aria-labelledby") or ""
                if lid:
                    el = page.locator(f"#{lid}")
                    if await el.count():
                        lbl = (await el.inner_text()).lower()

                if any(k in lbl for k in ["year", "experience"]):
                    await inp.fill(profile.get("years_experience", "2"))
                elif any(k in lbl for k in ["salary", "ctc", "expected", "pay"]):
                    await inp.fill(profile.get("expected_salary", "800000"))
                elif "notice" in lbl:
                    await inp.fill(profile.get("notice_period", "30"))
                elif lbl:
                    await inp.fill("2")
                await _delay(SHORT)
            except Exception:
                pass

        # Radios — Yes
        for r in await page.locator("input[type='radio']:visible").all():
            try:
                v = (await r.get_attribute("value") or "").lower()
                if v in ("yes", "true", "1"):
                    await r.check(); await _delay(SHORT)
            except Exception:
                pass

        # Selects
        for sel in await page.locator("select:visible").all():
            try:
                opts = await sel.locator("option").all_inner_texts()
                yes = [o for o in opts if re.search(r'\byes\b', o, re.I)]
                if yes:
                    await sel.select_option(label=yes[0])
                elif len(opts) > 1:
                    await sel.select_option(index=1)
                await _delay(SHORT)
            except Exception:
                pass

        # Next / Review
        advanced = False
        for lbl in ["Next", "Continue", "Review", "Review your application", "Done"]:
            btn = page.locator(f"button[aria-label='{lbl}']")
            if await btn.count():
                await btn.click(); await _delay(MEDIUM)
                advanced = True; break
        if not advanced:
            break

    return False


# ── Email apply via Gmail SMTP ────────────────────────────────────────────────
def _send_email_application(
    to_email: str, job_title: str, company: str,
    profile: dict, cv_path: str
) -> bool:
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not smtp_user or not smtp_pass:
        return False

    name = profile.get("name", "Applicant")
    skills = ", ".join(profile.get("skills", [])[:6])

    msg = MIMEMultipart()
    msg["Subject"] = f"Application for {job_title} — {name}"
    msg["From"]    = f"{name} <{smtp_user}>"
    msg["To"]      = to_email

    body = (
        f"Dear Hiring Team at {company},\n\n"
        f"I am writing to express my interest in the {job_title} position at {company}.\n\n"
        f"With expertise in {skills}, I am confident I can contribute meaningfully to your team. "
        f"Please find my CV attached for your review.\n\n"
        f"I would welcome the opportunity to discuss how my background aligns with your needs.\n\n"
        f"Best regards,\n{name}\n{profile.get('phone', '')}\n{smtp_user}"
    )
    msg.attach(MIMEText(body, "plain"))

    if cv_path and Path(cv_path).exists():
        with open(cv_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition",
            f'attachment; filename="{name.replace(" ", "_")}_CV.pdf"')
        msg.attach(part)

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[EMAIL] SMTP error: {e}")
        return False


def _extract_email(text: str) -> str | None:
    m = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return m.group(0) if m else None


# ── Main run ──────────────────────────────────────────────────────────────────
async def run(profile: dict, stop_event: asyncio.Event, max_jobs: int = 50):
    li_email   = profile["email"]
    li_pass    = profile["password"]
    user_email = profile["user_email"]
    titles     = profile.get("target_titles") or ["Software Engineer"]
    locations  = profile.get("target_locations") or ["Remote"]
    applied    = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        page = await ctx.new_page()

        # Login
        ok = await _load_session(ctx, li_email) and await _logged_in(page)
        if not ok:
            ok = await _login(page, li_email, li_pass, user_email)
        if not ok:
            await browser.close(); return
        await _save_session(ctx, li_email)

        for title in titles:
            for location in locations:
                if stop_event.is_set() or applied >= max_jobs:
                    break

                await _log(user_email, f"Searching: '{title}' in '{location}'")
                q = title.replace(" ", "%20")
                l = location.replace(" ", "%20")

                # Search Easy Apply jobs
                await page.goto(
                    f"https://www.linkedin.com/jobs/search/?keywords={q}&location={l}&f_AL=true&sortBy=DD",
                    wait_until="domcontentloaded", timeout=20000)
                await _delay(LONG)

                # Also search ALL jobs (for email-apply fallback)
                job_ids: list[str] = []
                for sel in ["[data-occludable-job-id]", "[data-job-id]",
                             "a[href*='/jobs/view/']"]:
                    els = page.locator(sel)
                    n = await els.count()
                    if n > 0:
                        for i in range(min(n, 20)):
                            jid = (await els.nth(i).get_attribute("data-occludable-job-id")
                                   or await els.nth(i).get_attribute("data-job-id") or "")
                            if not jid:
                                href = await els.nth(i).get_attribute("href") or ""
                                m = re.search(r'/jobs/view/(\d+)', href)
                                if m: jid = m.group(1)
                            if jid and jid not in job_ids:
                                job_ids.append(jid)
                        break

                await _log(user_email, f"Found {len(job_ids)} jobs for '{title}' in '{location}'")

                for jid in job_ids:
                    if stop_event.is_set() or applied >= max_jobs:
                        break
                    try:
                        job_url = f"https://www.linkedin.com/jobs/view/{jid}/"
                        await page.goto(job_url,
                            wait_until="domcontentloaded", timeout=15000)
                        await _delay(MEDIUM)

                        # Title
                        job_title = title
                        for sel in ["h1.t-24", "h1.job-details-jobs-unified-top-card__job-title", "h1"]:
                            el = page.locator(sel).first
                            if await el.count():
                                job_title = (await el.inner_text()).strip(); break

                        # Company
                        company = "Unknown"
                        for sel in [
                            ".job-details-jobs-unified-top-card__company-name a",
                            ".jobs-unified-top-card__company-name",
                            "a[data-tracking-control-name*='company']",
                        ]:
                            el = page.locator(sel).first
                            if await el.count():
                                company = (await el.inner_text()).strip(); break

                        # Location
                        job_location = location
                        for sel in [".job-details-jobs-unified-top-card__bullet",
                                     ".jobs-unified-top-card__bullet"]:
                            el = page.locator(sel).first
                            if await el.count():
                                job_location = (await el.inner_text()).strip(); break

                        # ── Try Easy Apply ──
                        easy_btn = None
                        for sel in ["button.jobs-apply-button",
                                    "button[aria-label*='Easy Apply']"]:
                            el = page.locator(sel).first
                            if await el.count():
                                easy_btn = el; break

                        if easy_btn:
                            await _log(user_email, f"Applying (Easy Apply): {job_title} @ {company}")
                            await easy_btn.click()
                            await _delay(MEDIUM)
                            success = await _easy_apply(page, profile, user_email)
                            if success:
                                applied += 1
                                await _record(user_email, job_title, company,
                                              job_location, job_url, "Easy Apply")
                                await _log(user_email,
                                    f"✓ Applied via Easy Apply: {job_title} @ {company} ({applied}/{max_jobs})",
                                    "success")
                            else:
                                # Dismiss
                                for dlbl in ["Dismiss", "Cancel"]:
                                    d = page.locator(f"button[aria-label='{dlbl}']")
                                    if await d.count():
                                        await d.click(); await _delay(SHORT)
                                        discard = page.locator(
                                            "button[data-control-name='discard_application_confirm_btn'],"
                                            "button:has-text('Discard')")
                                        if await discard.count():
                                            await discard.first.click()
                                        break
                                await _log(user_email,
                                    f"Could not complete Easy Apply for {job_title}", "warn")

                        else:
                            # ── Email fallback ──
                            page_text = await page.inner_text("body")
                            email_addr = _extract_email(page_text)

                            # Filter out LinkedIn's own emails
                            if email_addr and "linkedin.com" not in email_addr:
                                await _log(user_email,
                                    f"Applying via email ({email_addr}): {job_title} @ {company}")
                                cv_path = profile.get("cv_path", "")
                                sent = _send_email_application(
                                    email_addr, job_title, company, profile, cv_path)
                                if sent:
                                    applied += 1
                                    await _record(user_email, job_title, company,
                                                  job_location, job_url,
                                                  f"Email to {email_addr}")
                                    await _log(user_email,
                                        f"✓ Applied via email: {job_title} @ {company} ({applied}/{max_jobs})",
                                        "success")
                                else:
                                    await _log(user_email,
                                        f"Email send failed for {job_title}", "warn")
                            else:
                                await _log(user_email,
                                    f"Skipped (no Easy Apply, no email): {job_title} @ {company}")

                        await _delay(LONG)

                    except Exception as e:
                        await _log(user_email, f"Error on job {jid}: {e}", "error")
                        await _delay(MEDIUM)

        await _save_session(ctx, li_email)
        await browser.close()
        await _log(user_email,
            f"Bot finished. Total applications submitted: {applied}", "success")
