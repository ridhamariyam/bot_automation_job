"""Bot runner — sequential LinkedIn then Indeed, no concurrent crash."""
import asyncio, sys, os, httpx
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import linkedin
import indeed

BASE_URL = "http://localhost:8000"


async def fetch_profile(user_email: str, token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/api/profile/{user_email}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Could not fetch profile: {r.text}")
        return r.json()


async def main(user_email: str, token: str, max_jobs_each: int = 50):
    print(f"\n🚀 JobRocket Bot starting for {user_email}")
    print("   Press Ctrl+C to stop.\n")

    data = await fetch_profile(user_email, token)

    # Parse locations properly — split by newline OR semicolon first,
    # fall back to comma only if no other delimiter found
    raw_locations = data.get("target_locations", [])
    locations = _clean_locations(raw_locations)
    titles    = [t.strip() for t in data.get("target_titles", []) if t.strip()]

    if not titles:
        print("❌ No target job titles set. Go to Settings → Profile.")
        return
    if not locations:
        print("❌ No target locations set. Go to Settings → Profile.")
        return

    print(f"   Titles:    {titles}")
    print(f"   Locations: {locations}\n")

    profile = {
        "user_email":       user_email,
        "name":             data.get("name", ""),
        "phone":            data.get("phone", ""),
        "cv_path":          data.get("cv_path", ""),
        "target_titles":    titles,
        "target_locations": locations,
        "skills":           data.get("skills", []),
        "years_experience": str(data.get("years_experience", "2")),
        "expected_salary":  str(data.get("expected_salary", "800000")),
        "notice_period":    str(data.get("notice_period", "30")),
        "linkedin_email":   data.get("linkedin_email", ""),
        "linkedin_password":data.get("linkedin_password", ""),
        "indeed_email":     data.get("indeed_email", ""),
        "indeed_password":  data.get("indeed_password", ""),
    }

    stop_event = asyncio.Event()

    # ── Run LinkedIn first, then Indeed (sequential — avoids browser conflicts) ──
    if profile["linkedin_email"] and profile["linkedin_password"]:
        print("─── LinkedIn ───────────────────────────────────")
        li_profile = {**profile, "email": profile["linkedin_email"], "password": profile["linkedin_password"]}
        try:
            await linkedin.run(li_profile, stop_event, max_jobs=max_jobs_each)
        except Exception as e:
            print(f"[LinkedIn] Fatal error: {e}")
    else:
        print("⚠️  LinkedIn credentials not set — skipping.")

    if stop_event.is_set():
        print("\n✅ Bot stopped by user.")
        return

    if profile["indeed_email"] and profile["indeed_password"]:
        print("\n─── Indeed ─────────────────────────────────────")
        in_profile = {**profile, "email": profile["indeed_email"], "password": profile["indeed_password"]}
        try:
            await indeed.run(in_profile, stop_event, max_jobs=max_jobs_each)
        except Exception as e:
            print(f"[Indeed] Fatal error: {e}")
    else:
        print("⚠️  Indeed credentials not set — skipping.")

    print("\n✅ Bot finished.")


def _clean_locations(raw: list[str]) -> list[str]:
    """
    Handles locations like ['Doha, Qatar', 'Dubai, UAE'] that arrive
    pre-split from DB comma-split. Re-joins 'City, Country' pairs.
    """
    # If already good (multi-word like 'Doha Qatar') just return cleaned
    result = []
    i = 0
    while i < len(raw):
        loc = raw[i].strip()
        # Check if next token looks like a country suffix (short, no digits)
        if (i + 1 < len(raw)
                and len(raw[i + 1].strip()) <= 20
                and not any(c.isdigit() for c in raw[i + 1])
                and raw[i + 1].strip() not in ("Remote", "remote")):
            combined = f"{loc}, {raw[i+1].strip()}"
            result.append(combined)
            i += 2
        else:
            result.append(loc)
            i += 1
    return result


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

    email = os.getenv("BOT_USER_EMAIL") or input("JobRocket email: ").strip()
    token = os.getenv("BOT_TOKEN")      or input("Token: ").strip()
    max_j = int(os.getenv("BOT_MAX_JOBS", "50"))

    asyncio.run(main(email, token, max_jobs_each=max_j))
