"""
Resume tailoring — rewrites summary, skills, and top bullets to match a job.
Never fabricates experience; only reshapes language using job keywords.
"""
import asyncio
import json
import logging
import os

logger = logging.getLogger(__name__)


def _client():
    from openai import AsyncOpenAI
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return AsyncOpenAI(api_key=key)


async def tailor_resume_for_job(
    base_resume:     str,
    job_description: str,
    job_title:       str,
    company:         str,
) -> dict:
    """
    Returns a dict with keys: summary, skills, experience_bullets.
    Only rewrites these three sections — experience dates/companies stay intact.
    """
    try:
        client = _client()
        prompt = (
            f"You are an expert resume writer. Rewrite resume sections to match this job.\n\n"
            f"JOB: {job_title} at {company}\n"
            f"JOB DESCRIPTION:\n{job_description[:2000]}\n\n"
            f"CANDIDATE RESUME:\n{base_resume[:3000]}\n\n"
            "Rewrite ONLY these three sections:\n"
            "1. Professional Summary (3-4 sentences)\n"
            "2. Key Skills (12-15 skills, comma-separated)\n"
            "3. Top 3 experience bullet points (from their existing experience, "
            "reworded with job keywords — never invent new experience)\n\n"
            "Rules:\n"
            "- Use keywords from the job description naturally\n"
            "- Be specific and quantifiable\n"
            "- ATS-friendly formatting\n\n"
            'Return ONLY valid JSON: {"summary": "...", "skills": "...", '
            '"experience_bullets": ["...", "...", "..."]}'
        )
        resp = await client.chat.completions.create(
            model           = "gpt-4o",
            messages        = [{"role": "user", "content": prompt}],
            response_format = {"type": "json_object"},
            temperature     = 0.3,
            max_tokens      = 800,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        logger.warning("GPT resume tailoring failed: %s", e)
        return {"summary": "", "skills": "", "experience_bullets": []}


async def tailor_resume_batch(
    base_resume: str,
    jobs:        list[dict],
    concurrency: int = 5,
) -> list[dict]:
    """Tailor resume for multiple jobs with concurrency control."""
    sem = asyncio.Semaphore(concurrency)

    async def _one(job: dict) -> dict:
        async with sem:
            tailored = await tailor_resume_for_job(
                base_resume     = base_resume,
                job_description = job.get("description", ""),
                job_title       = job.get("title", ""),
                company         = job.get("company", ""),
            )
            return {**job, "tailored_resume": tailored}

    return list(await asyncio.gather(*[_one(j) for j in jobs]))
