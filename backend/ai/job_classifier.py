"""
Job relevance classifier — scores how well a job matches the user's profile.
Used to skip irrelevant jobs before applying.
"""
import asyncio
import logging
import os

logger = logging.getLogger(__name__)


def _client():
    from openai import AsyncOpenAI
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return AsyncOpenAI(api_key=key)


async def score_job_relevance(
    job_title:       str,
    job_description: str,
    user_titles:     list[str],
    user_skills:     str,
) -> int:
    """
    Returns a relevance score 0-10.
    0-3: skip, 4-6: borderline, 7-10: apply.
    Falls back to keyword scoring if OpenAI unavailable.
    """
    try:
        user_titles_str = ", ".join(user_titles)
        resp = await _client().chat.completions.create(
            model    = "gpt-4o-mini",
            messages = [{
                "role":    "user",
                "content": (
                    f"Score job relevance 0-10. Return only the integer.\n\n"
                    f"Candidate targets: {user_titles_str}\n"
                    f"Candidate skills: {user_skills[:300]}\n\n"
                    f"Job title: {job_title}\n"
                    f"Job description: {job_description[:500]}"
                ),
            }],
            temperature = 0,
            max_tokens  = 5,
        )
        raw = resp.choices[0].message.content.strip()
        return min(10, max(0, int("".join(c for c in raw if c.isdigit()) or "5")))
    except Exception:
        return _keyword_score(job_title, user_titles, user_skills)


def _keyword_score(job_title: str, user_titles: list[str], user_skills: str) -> int:
    """Fast keyword matching fallback."""
    title_lower  = job_title.lower()
    skills_lower = user_skills.lower()
    score = 0
    for ut in user_titles:
        words = ut.lower().split()
        if all(w in title_lower for w in words):
            score += 5
            break
        if any(w in title_lower for w in words):
            score += 2
    for skill in skills_lower.split(",")[:10]:
        if skill.strip() in title_lower:
            score += 1
    return min(10, score)


async def filter_relevant_jobs(
    jobs:        list[dict],
    user_titles: list[str],
    user_skills: str,
    min_score:   int = 4,
    concurrency: int = 10,
) -> list[dict]:
    """Filter a list of jobs to only those meeting the relevance threshold."""
    sem = asyncio.Semaphore(concurrency)

    async def _score(job: dict) -> dict:
        async with sem:
            score = await score_job_relevance(
                job_title       = job.get("title", ""),
                job_description = job.get("description", ""),
                user_titles     = user_titles,
                user_skills     = user_skills,
            )
            return {**job, "relevance_score": score}

    scored = await asyncio.gather(*[_score(j) for j in jobs])
    return [j for j in scored if j["relevance_score"] >= min_score]
