"""
Job relevance classifier — thin wrapper around services/job_scorer.

Kept for backward compatibility: existing code that imports
`score_job_relevance` or `filter_relevant_jobs` still works unchanged.
New code should import directly from services.job_scorer.
"""
import asyncio
import logging

from services.job_scorer import score_job, keyword_score_job

logger = logging.getLogger(__name__)


async def score_job_relevance(
    job_title:       str,
    job_description: str,
    user_titles:     list[str],
    user_skills:     str,
    years_exp:       int = 0,
) -> int:
    """
    Returns 0-10 relevance score (legacy scale).
    Internally uses the 0-100 scorer and divides by 10.
    """
    result = await score_job(
        job_title     = job_title,
        company       = "",
        description   = job_description,
        target_titles = user_titles,
        skills        = [s.strip() for s in user_skills.split(",") if s.strip()],
        years_exp     = years_exp,
    )
    return min(10, result.total // 10)


async def filter_relevant_jobs(
    jobs:        list[dict],
    user_titles: list[str],
    user_skills: str,
    min_score:   int = 4,
    concurrency: int = 10,
) -> list[dict]:
    """
    Filter jobs by relevance. min_score is on the legacy 0-10 scale.
    Converts to 0-100 internally.
    """
    min_score_100 = min_score * 10
    sem = asyncio.Semaphore(concurrency)

    async def _score(job: dict) -> dict:
        async with sem:
            result = await score_job(
                job_title     = job.get("title", ""),
                company       = job.get("company", ""),
                description   = job.get("description", ""),
                target_titles = user_titles,
                skills        = [s.strip() for s in user_skills.split(",") if s.strip()],
            )
            return {**job, "relevance_score": result.total // 10, "_score_100": result.total}

    scored = await asyncio.gather(*[_score(j) for j in jobs])
    return [j for j in scored if j["_score_100"] >= min_score_100]
