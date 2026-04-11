"""
AI cover letter generator using GPT-4o.
Produces concise, ATS-friendly cover letters tailored to each job.
Falls back to a template if OpenAI is not configured.
"""
import asyncio
import os
import logging

logger = logging.getLogger(__name__)


def _client():
    from openai import AsyncOpenAI
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return AsyncOpenAI(api_key=key)


async def generate_cover_letter(
    user_name:        str,
    job_title:        str,
    company:          str,
    job_description:  str,
    skills:           str,
    years_experience: int = 3,
) -> str:
    """
    Generate a tailored cover letter for a single job.
    Returns plain text, ready to paste or attach.
    Falls back to a template if OpenAI unavailable.
    """
    try:
        client = _client()
        prompt = (
            f"Write a professional cover letter for this job application.\n\n"
            f"Applicant: {user_name}\n"
            f"Role: {job_title} at {company}\n"
            f"Key skills: {skills}\n"
            f"Years of experience: {years_experience}\n\n"
            f"Job description excerpt:\n{job_description[:1500]}\n\n"
            "Requirements:\n"
            "- 3 short paragraphs, under 180 words total\n"
            "- Opening: genuine interest + one specific thing about the role/company\n"
            "- Middle: 2-3 matching skills with brief concrete examples\n"
            "- Closing: clear call-to-action\n"
            "- Tone: confident, professional, never generic\n"
            "- Do NOT use: 'I am writing to', 'To whom it may concern'\n"
            "- Start directly with the role name\n\n"
            "Return ONLY the cover letter text."
        )
        resp = await client.chat.completions.create(
            model       = "gpt-4o",
            messages    = [{"role": "user", "content": prompt}],
            temperature = 0.6,
            max_tokens  = 450,
        )
        return resp.choices[0].message.content.strip()

    except Exception as e:
        logger.warning("GPT cover letter failed, using template: %s", e)
        return _template_cover_letter(user_name, job_title, company, skills)


def _template_cover_letter(name: str, title: str, company: str, skills: str) -> str:
    top_skills = ", ".join(skills.split(",")[:3]) if skills else "relevant skills"
    return (
        f"The {title} role at {company} is a compelling opportunity that aligns closely "
        f"with my professional background.\n\n"
        f"I bring hands-on expertise in {top_skills}, which I have applied to deliver "
        f"measurable results in my previous roles. I am confident this experience maps "
        f"directly to the requirements you are looking for.\n\n"
        f"I would welcome the chance to discuss how I can contribute to {company}'s "
        f"success. Please find my CV attached.\n\nBest regards,\n{name}"
    )


async def generate_cover_letter_batch(
    user_profile: dict,
    jobs:         list[dict],
    concurrency:  int = 5,
) -> list[dict]:
    """
    Generate cover letters for multiple jobs concurrently.
    Returns the input list with 'cover_letter' key added to each item.
    """
    sem = asyncio.Semaphore(concurrency)

    async def _one(job: dict) -> dict:
        async with sem:
            letter = await generate_cover_letter(
                user_name       = user_profile.get("name", ""),
                job_title       = job.get("title", ""),
                company         = job.get("company", ""),
                job_description = job.get("description", ""),
                skills          = user_profile.get("skills", ""),
            )
            return {**job, "cover_letter": letter}

    return list(await asyncio.gather(*[_one(j) for j in jobs]))
