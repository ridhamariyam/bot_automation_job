"""Indeed bot — correct 2024 login flow, robust apply, headless-safe."""
import asyncio, json, random, httpx, os
from pathlib import Path
from playwright.async_api import async_playwright, Page, BrowserContext

SESSION_DIR = Path(__file__).parent / "sessions"
SESSION_DIR.mkdir(exist_ok=True)
BASE_URL  = "http://localhost:8000"
SHORT     = (0.8, 1.8)
MEDIUM    = (2.0, 4.0)
LONG      = (5.0, 9.0)
HEADLESS  = True  # Always run headless — frontend should never see the browser


async def _delay(r=MEDIUM):
    await asyncio.sleep(random.uniform(*r))


async def _human_type(page: Page, selector: str, text: str):
    await page.click(selector)
    await page.fill(selector, "")
    for ch in text:
        await page.type(selector, ch, delay=random.randint(60, 160))


async def _save_session(ctx: BrowserContext, email: str):
    cookies = await ctx.cookies()
    (SESSION_DIR / f"indeed_{email.replace('@','_')}.json").write_text(json.dumps(cookies))


async def _load_session(ctx: BrowserContext, email: str) -> bool:
    p = SESSION_DIR / f"indeed_{email.replace('@','_')}.json"
    if not p.exists():
        return False
    await ctx.add_cookies(json.loads(p.read_text()))
    return True


async def _logged_in(page: Page) -> bool:
    try:
        await page.goto("https://www.indeed.com/myjobs", wait_until="domcontentloaded", timeout=15000)
        await _delay(SHORT)
        return "myjobs" in page.url or "my-jobs" in page.url
    except Exception:
        return False


async def _login(page: Page, email: str, password: str) -> bool:
    print(f"[Indeed] Logging in as {email}…")
    await page.goto("https://secure.indeed.com/auth", wait_until="domcontentloaded", timeout=20000)
    await _delay(MEDIUM)

    # Step 1 — enter email
    email_sel = "input[name='__email'], input[type='email']"
    try:
        await page.wait_for_selector(email_sel, timeout=10000)
        await _human_type(page, email_sel, email)
        await _delay(SHORT)

        # Click Continue / Next
        for btn_sel in [
            "button[type='submit']",
            "button:has-text('Continue')",
            "button:has-text('Next')",
            "button:has-text('Sign in')",
        ]:
            if await page.locator(btn_sel).count():
                await page.locator(btn_sel).first.click()
                break
        await _delay(MEDIUM)
    except Exception as e:
        print(f"[Indeed] Email step failed: {e}")
        return False

    # Step 2 — enter password (appears on same or next page)
    try:
        pw_sel = "input[type='password']"
        await page.wait_for_selector(pw_sel, timeout=10000)
        await _human_type(page, pw_sel, password)
        await _delay(SHORT)

        for btn_sel in [
            "button[type='submit']",
            "button:has-text('Sign in')",
            "button:has-text('Continue')",
        ]:
            if await page.locator(btn_sel).count():
                await page.locator(btn_sel).first.click()
                break
        await _delay(MEDIUM)
    except Exception as e:
        print(f"[Indeed] Password step failed: {e}")
        return False

    # OTP / verification
    if "challenge" in page.url or "verify" in page.url or "auth" in page.url:
        if not HEADLESS:
            print("[Indeed] ⚠️  Verification needed. Complete it in the browser (60s).")
            try:
                await page.wait_for_function(
                    "() => window.location.href.includes('indeed.com') && !window.location.href.includes('auth') && !window.location.href.includes('challenge') && !window.location.href.includes('verify')",
                    timeout=60000,
                )
            except Exception:
                return False
        else:
            print("[Indeed] ❌ Verification required but running headless. Log in manually once first.")
            return False

    logged = await _logged_in(page)
    if logged:
        print("[Indeed] ✅ Login OK")
    else:
        print(f"[Indeed] ❌ Login failed — {page.url}")
    return logged


async def _record(user_email: str, title: str, company: str, location: str, url: str):
    async with httpx.AsyncClient() as c:
        try:
            await c.post(f"{BASE_URL}/api/jobs", json={
                "user_email": user_email, "title": title, "company": company,
                "location": location, "platform": "Indeed",
                "job_url": url, "status": "Applied",
                "proof": f"Applied on Indeed at {url}",
            }, timeout=10)
        except Exception as e:
            print(f"[Indeed] ⚠️  DB record failed: {e}")


async def _fill_indeed_apply(page: Page, profile: dict) -> bool:
    for _ in range(12):
        await _delay(SHORT)
        url = page.url

        # Submitted confirmation
        if any(x in url for x in ["thank", "submitted", "applied"]):
            return True
        if await page.locator(":text('Application submitted'), :text('application was submitted')").count():
            return True

        # Resume upload
        file_inp = page.locator("input[type='file']")
        if await file_inp.count():
            cv = profile.get("cv_path", "")
            if cv and Path(cv).exists():
                await file_inp.first.set_input_files(cv)
                await _delay(MEDIUM)

        # Phone
        for sel in ["input[name='phone']", "input[id*='phone']", "input[type='tel']"]:
            inp = page.locator(sel)
            if await inp.count() and not await inp.first.input_value():
                await inp.first.fill(profile.get("phone", ""))
                await _delay(SHORT)
                break

        # Text inputs
        for inp in await page.locator("input[type='text']:visible, input[type='number']:visible, textarea:visible").all():
            try:
                if await inp.input_value():
                    continue
                hint = ((await inp.get_attribute("placeholder") or "") +
                        (await inp.get_attribute("name") or "") +
                        (await inp.get_attribute("aria-label") or "")).lower()
                if "year" in hint or "experience" in hint:
                    await inp.fill(profile.get("years_experience", "2"))
                elif "salary" in hint or "pay" in hint or "ctc" in hint:
                    await inp.fill(profile.get("expected_salary", "800000"))
                elif "notice" in hint:
                    await inp.fill(profile.get("notice_period", "30"))
                elif "city" in hint or "location" in hint:
                    locs = profile.get("target_locations") or ["Bangalore"]
                    await inp.fill(locs[0])
                await _delay(SHORT)
            except Exception:
                pass

        # Radios
        for r in await page.locator("input[type='radio']:visible").all():
            try:
                v = (await r.get_attribute("value") or "").lower()
                if v in ("yes", "true", "1"):
                    await r.check()
                    await _delay(SHORT)
            except Exception:
                pass

        # Continue / Next / Submit
        clicked = False
        for label in ["Continue", "Next", "Submit your application", "Apply now", "Review"]:
            btn = page.locator(f"button:has-text('{label}'), input[value='{label}']")
            if await btn.count():
                await btn.first.click()
                await _delay(MEDIUM)
                clicked = True
                break
        if not clicked:
            break

    if await page.locator(":text('Application submitted'), :text('application was submitted')").count():
        return True
    return False


async def run(profile: dict, stop_event: asyncio.Event, max_jobs: int = 50):
    email      = profile["email"]
    password   = profile["password"]
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
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        page = await ctx.new_page()

        ok = await _load_session(ctx, email) and await _logged_in(page)
        if not ok:
            ok = await _login(page, email, password)
        if not ok:
            await browser.close()
            return
        await _save_session(ctx, email)

        for title in titles:
            for location in locations:
                if stop_event.is_set() or applied >= max_jobs:
                    break
                print(f"\n[Indeed] Searching: '{title}' in '{location}'")

                q = title.replace(" ", "+")
                l = location.replace(" ", "+")
                await page.goto(
                    f"https://www.indeed.com/jobs?q={q}&l={l}&iafilter=1&sort=date",
                    wait_until="domcontentloaded", timeout=20000,
                )
                await _delay(LONG)

                # Collect job links
                job_links: list[str] = []
                for sel in [
                    "a.jcs-JobTitle",
                    "h2.jobTitle a",
                    "a[data-jk]",
                    "a[href*='/rc/clk']",
                    "a[href*='/viewjob']",
                ]:
                    els = page.locator(sel)
                    n = await els.count()
                    if n > 0:
                        for i in range(min(n, 25)):
                            href = await els.nth(i).get_attribute("href") or ""
                            if href:
                                full = f"https://www.indeed.com{href}" if href.startswith("/") else href
                                job_links.append(full)
                        print(f"[Indeed]   Found {len(job_links)} jobs via '{sel}'")
                        break

                for job_url in job_links:
                    if stop_event.is_set() or applied >= max_jobs:
                        break
                    try:
                        await page.goto(job_url, wait_until="domcontentloaded", timeout=15000)
                        await _delay(MEDIUM)

                        # Title
                        for sel in ["h1.jobsearch-JobInfoHeader-title", "h1[class*='title']", "h1"]:
                            el = page.locator(sel).first
                            if await el.count():
                                job_title = (await el.inner_text()).strip()
                                break
                        else:
                            job_title = title

                        # Company
                        for sel in ["[data-testid='inlineHeader-companyName'] a",
                                    "[data-testid='inlineHeader-companyName']",
                                    "[class*='companyName']"]:
                            el = page.locator(sel).first
                            if await el.count():
                                company = (await el.inner_text()).strip()
                                break
                        else:
                            company = "Unknown"

                        # Location
                        for sel in ["[data-testid='inlineHeader-companyLocation']",
                                    "[class*='companyLocation']"]:
                            el = page.locator(sel).first
                            if await el.count():
                                job_location = (await el.inner_text()).strip()
                                break
                        else:
                            job_location = location

                        # Apply button — only "Apply on Indeed", skip external ATS
                        apply_btn = None
                        for sel in [
                            "button#indeedApplyButton",
                            "button[class*='indeed-apply']",
                            "span[class*='indeed-apply'] button",
                            "button:has-text('Apply now')",
                        ]:
                            el = page.locator(sel).first
                            if await el.count():
                                apply_btn = el
                                break

                        if not apply_btn:
                            print(f"[Indeed]   Skip (external apply): {job_title}")
                            continue

                        print(f"[Indeed]   Applying: {job_title} @ {company}")
                        await apply_btn.click()
                        await _delay(MEDIUM)

                        success = await _fill_indeed_apply(page, profile)
                        if success:
                            applied += 1
                            await _record(user_email, job_title, company, job_location, job_url)
                            print(f"[Indeed]   ✅ Applied ({applied}/{max_jobs})")
                        else:
                            print(f"[Indeed]   ⚠️  Incomplete: {job_title}")

                        await _delay(LONG)

                    except Exception as e:
                        print(f"[Indeed]   ⚠️  {e}")
                        await _delay(MEDIUM)

        await _save_session(ctx, email)
        await browser.close()
        print(f"\n[Indeed] Done — applied to {applied} jobs.")
